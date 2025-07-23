import { DomainEvent } from '@/domain/events/DomainEvent.js';
import { logger } from '@/logger.js';

export type SagaId = string;
export type SagaStatus = 'pending' | 'running' | 'completed' | 'failed' | 'compensating';

export interface SagaState {
  sagaId: SagaId;
  sagaType: string;
  status: SagaStatus;
  currentStep: number;
  context: Record<string, unknown>;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: {
    message: string;
    step: number;
    timestamp: Date;
  };
  compensationLog: Array<{
    step: number;
    action: string;
    timestamp: Date;
    success: boolean;
  }>;
}

export interface SagaStep<TContext = Record<string, unknown>> {
  name: string;

  /**
   * Execute the step action
   */
  execute(context: TContext, sagaId: SagaId): Promise<void>;

  /**
   * Compensate (rollback) this step
   */
  compensate(context: TContext, sagaId: SagaId): Promise<void>;

  /**
   * Check if this step can be retried
   */
  canRetry?(error: Error, retryCount: number): boolean;

  /**
   * Maximum retry attempts for this step
   */
  maxRetries?: number;

  /**
   * Timeout for this step in milliseconds
   */
  timeout?: number;
}

export interface SagaDefinition<TContext = Record<string, unknown>> {
  name: string;
  steps: SagaStep<TContext>[];

  /**
   * Initialize the saga context from the triggering event
   */
  createContext(event: DomainEvent): TContext;

  /**
   * Check if an event should trigger this saga
   */
  canHandle(event: DomainEvent): boolean;

  /**
   * Called when saga completes successfully
   */
  onCompleted?(context: TContext, sagaId: SagaId): Promise<void>;

  /**
   * Called when saga fails
   */
  onFailed?(context: TContext, error: Error, sagaId: SagaId): Promise<void>;
}

/**
 * Base class for implementing sagas
 */
export abstract class Saga<TContext = Record<string, unknown>> implements SagaDefinition<TContext> {
  abstract name: string;
  abstract steps: SagaStep<TContext>[];

  abstract createContext(event: DomainEvent): TContext;
  abstract canHandle(event: DomainEvent): boolean;

  async onCompleted(context: TContext, sagaId: SagaId): Promise<void> {
    logger.info(`Saga ${this.name} completed`, { sagaId, context });
  }

  async onFailed(context: TContext, error: Error, sagaId: SagaId): Promise<void> {
    logger.error(`Saga ${this.name} failed`, { sagaId, error, context });
  }
}

/**
 * Saga State Store interface
 */
export interface SagaStateStore {
  save(state: SagaState): Promise<void>;
  load(sagaId: SagaId): Promise<SagaState | null>;
  findByStatus(status: SagaStatus): Promise<SagaState[]>;
  updateStatus(sagaId: SagaId, status: SagaStatus, error?: Error): Promise<void>;
  delete(sagaId: SagaId): Promise<void>;
}

/**
 * In-memory implementation of SagaStateStore (for development)
 */
export class InMemorySagaStateStore implements SagaStateStore {
  private states: Map<SagaId, SagaState> = new Map();

  async save(state: SagaState): Promise<void> {
    this.states.set(state.sagaId, { ...state });
  }

  async load(sagaId: SagaId): Promise<SagaState | null> {
    const state = this.states.get(sagaId);
    return state ? { ...state } : null;
  }

  async findByStatus(status: SagaStatus): Promise<SagaState[]> {
    return Array.from(this.states.values()).filter(s => s.status === status);
  }

  async updateStatus(sagaId: SagaId, status: SagaStatus, error?: Error): Promise<void> {
    const state = this.states.get(sagaId);
    if (state) {
      state.status = status;
      state.updatedAt = new Date();

      if (status === 'completed') {
        state.completedAt = new Date();
      }

      if (error) {
        state.error = {
          message: error.message,
          step: state.currentStep,
          timestamp: new Date(),
        };
      }
    }
  }

  async delete(sagaId: SagaId): Promise<void> {
    this.states.delete(sagaId);
  }
}

/**
 * Example saga for complex todo operations
 */
export class CreateTodoWithNotificationsSaga extends Saga<{
  todoId: string;
  userId: string;
  title: string;
  assigneeIds?: string[];
}> {
  name = 'CreateTodoWithNotifications';

  steps: SagaStep[] = [
    {
      name: 'ValidateUsers',
      async execute(context, sagaId) {
        // Validate that all assignees exist
        logger.info(`Validating users for saga ${sagaId}`);
        // Implementation would check user existence
      },
      async compensate(context, sagaId) {
        // No compensation needed for validation
      },
    },
    {
      name: 'CreateTodo',
      async execute(context, sagaId) {
        logger.info(`Creating todo for saga ${sagaId}`, { todoId: context.todoId });
        // Implementation would create the todo
      },
      async compensate(context, sagaId) {
        logger.info(`Deleting todo for saga ${sagaId}`, { todoId: context.todoId });
        // Implementation would delete the created todo
      },
    },
    {
      name: 'SendNotifications',
      async execute(context, sagaId) {
        if (context.assigneeIds && (context.assigneeIds as string[]).length > 0) {
          logger.info(`Sending notifications for saga ${sagaId}`);
          // Implementation would send notifications
        }
      },
      async compensate(context, sagaId) {
        // Can't really "unsend" notifications, but could send cancellation
        logger.info(`Would send cancellation notifications for saga ${sagaId}`);
      },
      maxRetries: 3,
      timeout: 5000,
    },
    {
      name: 'UpdateAnalytics',
      async execute(context, sagaId) {
        logger.info(`Updating analytics for saga ${sagaId}`);
        // Implementation would update analytics
      },
      async compensate(context, sagaId) {
        logger.info(`Reverting analytics for saga ${sagaId}`);
        // Implementation would revert analytics
      },
    },
  ];

  createContext(event: DomainEvent) {
    // Extract context from the triggering event
    return {
      todoId: event.aggregateId,
      userId: event.userId || '',
      title: event.metadata?.title || '',
      assigneeIds: event.metadata?.assigneeIds || [],
    };
  }

  canHandle(event: DomainEvent): boolean {
    return event.eventType === 'TodoCreated' &&
      event.metadata?.requiresNotification === true;
  }
}

/**
 * Saga step builder for fluent API
 */
export class SagaStepBuilder<TContext = Record<string, unknown>> {
  private step: Partial<SagaStep<TContext>> = {};

  withName(name: string): this {
    this.step.name = name;
    return this;
  }

  withExecute(execute: SagaStep<TContext>['execute']): this {
    this.step.execute = execute;
    return this;
  }

  withCompensate(compensate: SagaStep<TContext>['compensate']): this {
    this.step.compensate = compensate;
    return this;
  }

  withRetry(maxRetries: number, canRetry?: SagaStep<TContext>['canRetry']): this {
    this.step.maxRetries = maxRetries;
    this.step.canRetry = canRetry;
    return this;
  }

  withTimeout(timeout: number): this {
    this.step.timeout = timeout;
    return this;
  }

  build(): SagaStep<TContext> {
    if (!this.step.name || !this.step.execute || !this.step.compensate) {
      throw new Error('SagaStep must have name, execute, and compensate functions');
    }

    return this.step as SagaStep<TContext>;
  }
}