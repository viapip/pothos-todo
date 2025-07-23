import { 
  Saga, 
  SagaId, 
  SagaState, 
  SagaStateStore, 
  SagaStatus,
  InMemorySagaStateStore 
} from './Saga.js';
import { DomainEvent } from '@/domain/events/DomainEvent.js';
import { EventBus, EventEnvelope, EventHandler } from '../events/EventBus.js';
import { logger } from '@/logger.js';

export interface SagaOrchestratorConfig {
  stateStore?: SagaStateStore;
  enableMetrics?: boolean;
  defaultTimeout?: number;
  maxConcurrentSagas?: number;
}

/**
 * Orchestrates saga execution, managing state transitions,
 * compensations, and error handling
 */
export class SagaOrchestrator implements EventHandler {
  private sagas: Map<string, Saga> = new Map();
  private stateStore: SagaStateStore;
  private eventBus: EventBus;
  private config: Required<SagaOrchestratorConfig>;
  private activeSagas: Map<SagaId, AbortController> = new Map();
  private metrics: SagaMetrics;

  constructor(
    eventBus: EventBus,
    config: SagaOrchestratorConfig = {}
  ) {
    this.eventBus = eventBus;
    this.config = {
      stateStore: config.stateStore || new InMemorySagaStateStore(),
      enableMetrics: config.enableMetrics ?? true,
      defaultTimeout: config.defaultTimeout ?? 30000, // 30 seconds
      maxConcurrentSagas: config.maxConcurrentSagas ?? 100,
    };
    this.stateStore = this.config.stateStore;
    this.metrics = new SagaMetrics();
  }

  /**
   * Register a saga definition
   */
  registerSaga(saga: Saga): void {
    this.sagas.set(saga.name, saga);
    logger.info(`Registered saga: ${saga.name}`);
  }

  /**
   * Handle incoming events and trigger appropriate sagas
   */
  async handle(envelope: EventEnvelope): Promise<void> {
    const event = envelope.event;

    // Check each registered saga
    for (const saga of this.sagas.values()) {
      if (saga.canHandle(event)) {
        await this.startSaga(saga, event, envelope.metadata.correlationId);
      }
    }
  }

  /**
   * Get supported event types (all events, as sagas decide what to handle)
   */
  supportedEvents(): string[] {
    return ['*']; // Listen to all events
  }

  /**
   * Start a new saga instance
   */
  private async startSaga(
    saga: Saga,
    triggeringEvent: DomainEvent,
    correlationId: string
  ): Promise<void> {
    const sagaId = this.generateSagaId();
    const startTime = Date.now();

    // Check concurrent saga limit
    if (this.activeSagas.size >= this.config.maxConcurrentSagas) {
      logger.warn('Max concurrent sagas reached, queuing saga', {
        sagaName: saga.name,
        sagaId,
      });
      // In production, this would queue the saga
      return;
    }

    // Create abort controller for timeout/cancellation
    const abortController = new AbortController();
    this.activeSagas.set(sagaId, abortController);

    try {
      // Create initial state
      const context = saga.createContext(triggeringEvent);
      const state: SagaState = {
        sagaId,
        sagaType: saga.name,
        status: 'running',
        currentStep: 0,
        context,
        startedAt: new Date(),
        updatedAt: new Date(),
        compensationLog: [],
      };

      await this.stateStore.save(state);
      
      logger.info(`Starting saga ${saga.name}`, {
        sagaId,
        triggeringEvent: triggeringEvent.eventType,
        correlationId,
      });

      if (this.config.enableMetrics) {
        this.metrics.recordSagaStart(saga.name);
      }

      // Execute saga steps
      await this.executeSaga(saga, state, abortController.signal);

      // Saga completed successfully
      state.status = 'completed';
      state.completedAt = new Date();
      await this.stateStore.save(state);

      // Call completion handler
      await saga.onCompleted(context, sagaId);

      if (this.config.enableMetrics) {
        this.metrics.recordSagaComplete(saga.name, Date.now() - startTime);
      }

      logger.info(`Saga ${saga.name} completed successfully`, {
        sagaId,
        duration: Date.now() - startTime,
      });

    } catch (error) {
      await this.handleSagaError(saga, sagaId, error as Error, startTime);
    } finally {
      this.activeSagas.delete(sagaId);
    }
  }

  /**
   * Execute saga steps sequentially
   */
  private async executeSaga(
    saga: Saga,
    state: SagaState,
    signal: AbortSignal
  ): Promise<void> {
    for (let i = 0; i < saga.steps.length; i++) {
      if (signal.aborted) {
        throw new Error('Saga aborted');
      }

      const step = saga.steps[i];
      state.currentStep = i;
      await this.stateStore.save(state);

      logger.debug(`Executing saga step ${step.name}`, {
        sagaId: state.sagaId,
        step: i + 1,
        totalSteps: saga.steps.length,
      });

      // Execute step with timeout
      const timeout = step.timeout || this.config.defaultTimeout;
      await this.executeStepWithTimeout(
        () => step.execute(state.context, state.sagaId),
        timeout,
        signal
      );
    }
  }

  /**
   * Handle saga execution errors
   */
  private async handleSagaError(
    saga: Saga,
    sagaId: SagaId,
    error: Error,
    startTime: number
  ): Promise<void> {
    logger.error(`Saga ${saga.name} failed`, {
      sagaId,
      error: error.message,
      stack: error.stack,
    });

    const state = await this.stateStore.load(sagaId);
    if (!state) {
      logger.error('Failed to load saga state for compensation', { sagaId });
      return;
    }

    // Update state to failed
    state.status = 'failed';
    state.error = {
      message: error.message,
      step: state.currentStep,
      timestamp: new Date(),
    };
    await this.stateStore.save(state);

    // Start compensation
    await this.compensateSaga(saga, state);

    // Call failure handler
    await saga.onFailed(state.context, error, sagaId);

    if (this.config.enableMetrics) {
      this.metrics.recordSagaFailure(saga.name, Date.now() - startTime);
    }
  }

  /**
   * Execute compensation steps in reverse order
   */
  private async compensateSaga(
    saga: Saga,
    state: SagaState
  ): Promise<void> {
    state.status = 'compensating';
    await this.stateStore.save(state);

    logger.info(`Starting compensation for saga ${saga.name}`, {
      sagaId: state.sagaId,
      failedStep: state.currentStep,
    });

    // Compensate in reverse order, starting from the failed step
    for (let i = state.currentStep; i >= 0; i--) {
      const step = saga.steps[i];
      
      try {
        logger.debug(`Compensating step ${step.name}`, {
          sagaId: state.sagaId,
          step: i,
        });

        await step.compensate(state.context, state.sagaId);

        state.compensationLog.push({
          step: i,
          action: step.name,
          timestamp: new Date(),
          success: true,
        });

      } catch (compensationError) {
        logger.error(`Compensation failed for step ${step.name}`, {
          sagaId: state.sagaId,
          error: compensationError,
        });

        state.compensationLog.push({
          step: i,
          action: step.name,
          timestamp: new Date(),
          success: false,
        });
      }
    }

    await this.stateStore.save(state);
  }

  /**
   * Execute a step with timeout
   */
  private async executeStepWithTimeout(
    stepFn: () => Promise<void>,
    timeout: number,
    signal: AbortSignal
  ): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step execution timed out after ${timeout}ms`));
      }, timeout);

      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Step execution aborted'));
      });
    });

    await Promise.race([stepFn(), timeoutPromise]);
  }

  /**
   * Resume incomplete sagas (e.g., after restart)
   */
  async resumeIncompleteSagas(): Promise<void> {
    const incompleteSagas = await this.stateStore.findByStatus('running');
    
    logger.info(`Found ${incompleteSagas.length} incomplete sagas to resume`);

    for (const state of incompleteSagas) {
      const saga = this.sagas.get(state.sagaType);
      if (!saga) {
        logger.error(`Saga definition not found for type: ${state.sagaType}`);
        continue;
      }

      // Resume from the next step
      const abortController = new AbortController();
      this.activeSagas.set(state.sagaId, abortController);

      try {
        state.currentStep++; // Move to next step
        await this.executeSaga(saga, state, abortController.signal);
      } catch (error) {
        await this.handleSagaError(saga, state.sagaId, error as Error, Date.now());
      } finally {
        this.activeSagas.delete(state.sagaId);
      }
    }
  }

  /**
   * Cancel a running saga
   */
  async cancelSaga(sagaId: SagaId): Promise<void> {
    const controller = this.activeSagas.get(sagaId);
    if (controller) {
      controller.abort();
      logger.info(`Cancelled saga ${sagaId}`);
    }
  }

  /**
   * Get saga execution metrics
   */
  getMetrics(): SagaMetrics {
    return this.metrics;
  }

  private generateSagaId(): SagaId {
    return `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Saga execution metrics
 */
class SagaMetrics {
  private started: Map<string, number> = new Map();
  private completed: Map<string, number> = new Map();
  private failed: Map<string, number> = new Map();
  private durations: Map<string, number[]> = new Map();

  recordSagaStart(sagaType: string): void {
    this.started.set(sagaType, (this.started.get(sagaType) || 0) + 1);
  }

  recordSagaComplete(sagaType: string, duration: number): void {
    this.completed.set(sagaType, (this.completed.get(sagaType) || 0) + 1);
    
    const durations = this.durations.get(sagaType) || [];
    durations.push(duration);
    if (durations.length > 100) {
      durations.shift(); // Keep last 100
    }
    this.durations.set(sagaType, durations);
  }

  recordSagaFailure(sagaType: string, duration: number): void {
    this.failed.set(sagaType, (this.failed.get(sagaType) || 0) + 1);
  }

  getStats() {
    const stats: Record<string, any> = {};
    
    for (const sagaType of this.started.keys()) {
      const started = this.started.get(sagaType) || 0;
      const completed = this.completed.get(sagaType) || 0;
      const failed = this.failed.get(sagaType) || 0;
      const durations = this.durations.get(sagaType) || [];
      
      stats[sagaType] = {
        started,
        completed,
        failed,
        successRate: started > 0 ? completed / started : 0,
        avgDuration: durations.length > 0 
          ? durations.reduce((a, b) => a + b, 0) / durations.length 
          : 0,
      };
    }
    
    return stats;
  }
}