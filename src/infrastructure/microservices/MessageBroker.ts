/**
 * Advanced Message Broker System
 * Event-driven microservices communication with pub/sub, queues, and event sourcing
 */

import { logger, objectUtils, stringUtils } from '@/lib/unjs-utils.js';
import { configManager } from '@/config/unjs-config.js';
import { validationService } from '@/infrastructure/validation/UnJSValidation.js';
import { monitoring } from '@/infrastructure/observability/AdvancedMonitoring.js';
import { serviceRegistry } from './ServiceRegistry.js';
import { z } from 'zod';

export interface Message {
  id: string;
  type: string;
  topic: string;
  payload: any;
  metadata: {
    source: string;
    timestamp: Date;
    correlationId?: string;
    traceId?: string;
    priority: 'low' | 'normal' | 'high' | 'critical';
    retryCount: number;
    maxRetries: number;
    ttl?: number;
  };
  routing: {
    exchange?: string;
    routingKey?: string;
    headers?: Record<string, any>;
  };
}

export interface MessageHandler {
  id: string;
  topic: string;
  pattern?: RegExp;
  handler: (message: Message) => Promise<void>;
  options: {
    autoAck: boolean;
    prefetch?: number;
    retryDelay?: number;
    deadLetterQueue?: string;
    concurrency?: number;
  };
}

export interface Queue {
  name: string;
  type: 'direct' | 'topic' | 'fanout' | 'headers' | 'priority' | 'delay';
  durable: boolean;
  autoDelete: boolean;
  options: {
    maxLength?: number;
    messageTtl?: number;
    deadLetterExchange?: string;
    priority?: number;
    delayed?: boolean;
  };
  statistics: {
    messageCount: number;
    consumerCount: number;
    publishRate: number;
    consumeRate: number;
  };
}

export interface EventStore {
  streamId: string;
  events: StoredEvent[];
  version: number;
  snapshot?: {
    version: number;
    data: any;
    timestamp: Date;
  };
}

export interface StoredEvent {
  id: string;
  streamId: string;
  type: string;
  data: any;
  metadata: any;
  version: number;
  timestamp: Date;
}

export interface Saga {
  id: string;
  type: string;
  state: 'pending' | 'running' | 'completed' | 'failed' | 'compensating';
  steps: SagaStep[];
  currentStep: number;
  context: any;
  startTime: Date;
  endTime?: Date;
}

export interface SagaStep {
  id: string;
  name: string;
  action: (context: any) => Promise<any>;
  compensation: (context: any) => Promise<void>;
  status: 'pending' | 'completed' | 'failed' | 'compensated';
  result?: any;
  error?: string;
}

/**
 * Comprehensive message broker for microservices communication
 */
export class MessageBroker {
  private queues: Map<string, Queue> = new Map();
  private handlers: Map<string, MessageHandler[]> = new Map();
  private eventStore: Map<string, EventStore> = new Map();
  private sagas: Map<string, Saga> = new Map();
  private messageBuffer: Map<string, Message[]> = new Map();
  private deadLetterQueue: Message[] = [];
  private subscriptions: Map<string, Set<string>> = new Map();

  constructor() {
    this.setupValidationSchemas();
    this.setupDefaultQueues();
    this.startMessageProcessing();
    this.startEventStoreCleanup();
    this.startSagaProcessor();
  }

  /**
   * Setup validation schemas
   */
  private setupValidationSchemas(): void {
    const messageSchema = z.object({
      type: z.string().min(1),
      topic: z.string().min(1),
      payload: z.any(),
      metadata: z.object({
        source: z.string(),
        priority: z.enum(['low', 'normal', 'high', 'critical']),
        retryCount: z.number().min(0),
        maxRetries: z.number().min(0),
        correlationId: z.string().optional(),
        traceId: z.string().optional(),
        ttl: z.number().optional(),
      }),
      routing: z.object({
        exchange: z.string().optional(),
        routingKey: z.string().optional(),
        headers: z.record(z.any()).optional(),
      }),
    });

    validationService.registerSchema('message', messageSchema);
  }

  /**
   * Publish message to topic
   */
  async publish(
    topic: string,
    payload: any,
    options: {
      type?: string;
      priority?: Message['metadata']['priority'];
      correlationId?: string;
      traceId?: string;
      ttl?: number;
      exchange?: string;
      routingKey?: string;
      headers?: Record<string, any>;
    } = {}
  ): Promise<string> {
    const messageId = stringUtils.random(12);
    const message: Message = {
      id: messageId,
      type: options.type || 'message',
      topic,
      payload,
      metadata: {
        source: 'message-broker',
        timestamp: new Date(),
        priority: options.priority || 'normal',
        retryCount: 0,
        maxRetries: 3,
        correlationId: options.correlationId,
        traceId: options.traceId,
        ttl: options.ttl,
      },
      routing: {
        exchange: options.exchange,
        routingKey: options.routingKey || topic,
        headers: options.headers,
      },
    };

    // Store in appropriate queue
    await this.routeMessage(message);

    logger.debug('Message published', {
      messageId,
      topic,
      type: message.type,
      priority: message.metadata.priority,
    });

    monitoring.recordMetric({
      name: 'messagebroker.message.published',
      value: 1,
      tags: {
        topic,
        type: message.type,
        priority: message.metadata.priority,
      },
    });

    return messageId;
  }

  /**
   * Subscribe to topic with handler
   */
  subscribe(
    topic: string,
    handler: MessageHandler['handler'],
    options: Partial<MessageHandler['options']> = {}
  ): string {
    const handlerId = stringUtils.random(8);
    const messageHandler: MessageHandler = {
      id: handlerId,
      topic,
      handler,
      options: {
        autoAck: true,
        prefetch: 10,
        retryDelay: 1000,
        concurrency: 1,
        ...options,
      },
    };

    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, []);
    }

    this.handlers.get(topic)!.push(messageHandler);

    // Track subscription
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set());
    }
    this.subscriptions.get(topic)!.add(handlerId);

    logger.info('Message handler subscribed', {
      handlerId,
      topic,
      autoAck: messageHandler.options.autoAck,
    });

    monitoring.recordMetric({
      name: 'messagebroker.subscription.created',
      value: 1,
      tags: { topic, handlerId },
    });

    return handlerId;
  }

  /**
   * Unsubscribe handler
   */
  unsubscribe(topic: string, handlerId: string): void {
    const handlers = this.handlers.get(topic);
    if (handlers) {
      const filteredHandlers = handlers.filter(h => h.id !== handlerId);
      this.handlers.set(topic, filteredHandlers);
    }

    const subscriptions = this.subscriptions.get(topic);
    if (subscriptions) {
      subscriptions.delete(handlerId);
    }

    logger.info('Message handler unsubscribed', { topic, handlerId });

    monitoring.recordMetric({
      name: 'messagebroker.subscription.removed',
      value: 1,
      tags: { topic, handlerId },
    });
  }

  /**
   * Create queue
   */
  createQueue(queue: Omit<Queue, 'statistics'>): void {
    const queueWithStats: Queue = {
      ...queue,
      statistics: {
        messageCount: 0,
        consumerCount: 0,
        publishRate: 0,
        consumeRate: 0,
      },
    };

    this.queues.set(queue.name, queueWithStats);
    this.messageBuffer.set(queue.name, []);

    logger.info('Queue created', {
      name: queue.name,
      type: queue.type,
      durable: queue.durable,
    });

    monitoring.recordMetric({
      name: 'messagebroker.queue.created',
      value: 1,
      tags: {
        queue: queue.name,
        type: queue.type,
      },
    });
  }

  /**
   * Route message to appropriate handlers
   */
  private async routeMessage(message: Message): Promise<void> {
    const queue = this.queues.get(message.topic);
    if (queue) {
      // Add to queue buffer
      const buffer = this.messageBuffer.get(message.topic) || [];
      buffer.push(message);
      this.messageBuffer.set(message.topic, buffer);
      
      queue.statistics.messageCount++;
    }

    // Direct topic routing
    const handlers = this.handlers.get(message.topic) || [];
    await this.processMessageHandlers(message, handlers);

    // Pattern-based routing
    for (const [topic, topicHandlers] of this.handlers.entries()) {
      if (topic !== message.topic) {
        const patternHandlers = topicHandlers.filter(h => 
          h.pattern && h.pattern.test(message.topic)
        );
        await this.processMessageHandlers(message, patternHandlers);
      }
    }
  }

  /**
   * Process message with handlers
   */
  private async processMessageHandlers(message: Message, handlers: MessageHandler[]): Promise<void> {
    const processingPromises = handlers.map(async (handler) => {
      const spanId = monitoring.startTrace(`message.handler.${handler.topic}`);
      
      try {
        await this.processMessageWithHandler(message, handler);
        
        monitoring.finishSpan(spanId, {
          success: true,
          messageId: message.id,
          handlerId: handler.id,
          topic: message.topic,
        });

      } catch (error) {
        monitoring.finishSpan(spanId, {
          success: false,
          messageId: message.id,
          handlerId: handler.id,
          topic: message.topic,
          error: String(error),
        });

        await this.handleMessageError(message, handler, error as Error);
      }
    });

    await Promise.allSettled(processingPromises);
  }

  /**
   * Process message with single handler
   */
  private async processMessageWithHandler(message: Message, handler: MessageHandler): Promise<void> {
    const startTime = Date.now();

    try {
      await handler.handler(message);
      
      const duration = Date.now() - startTime;

      monitoring.recordMetric({
        name: 'messagebroker.message.processed',
        value: 1,
        tags: {
          topic: message.topic,
          handlerId: handler.id,
          status: 'success',
        },
      });

      monitoring.recordMetric({
        name: 'messagebroker.message.processing_time',
        value: duration,
        tags: {
          topic: message.topic,
          handlerId: handler.id,
        },
        unit: 'ms',
      });

      logger.debug('Message processed successfully', {
        messageId: message.id,
        handlerId: handler.id,
        topic: message.topic,
        duration,
      });

    } catch (error) {
      monitoring.recordMetric({
        name: 'messagebroker.message.processed',
        value: 1,
        tags: {
          topic: message.topic,
          handlerId: handler.id,
          status: 'error',
        },
      });

      throw error;
    }
  }

  /**
   * Handle message processing error
   */
  private async handleMessageError(message: Message, handler: MessageHandler, error: Error): Promise<void> {
    logger.error('Message processing failed', {
      messageId: message.id,
      handlerId: handler.id,
      topic: message.topic,
      error: String(error),
      retryCount: message.metadata.retryCount,
    });

    // Increment retry count
    message.metadata.retryCount++;

    // Check if we should retry
    if (message.metadata.retryCount <= message.metadata.maxRetries) {
      // Schedule retry with exponential backoff
      const delay = Math.pow(2, message.metadata.retryCount) * (handler.options.retryDelay || 1000);
      
      setTimeout(async () => {
        try {
          await this.processMessageWithHandler(message, handler);
        } catch (retryError) {
          await this.handleMessageError(message, handler, retryError as Error);
        }
      }, delay);

      monitoring.recordMetric({
        name: 'messagebroker.message.retry',
        value: 1,
        tags: {
          topic: message.topic,
          handlerId: handler.id,
          retryCount: message.metadata.retryCount.toString(),
        },
      });

    } else {
      // Send to dead letter queue
      await this.sendToDeadLetterQueue(message, handler, error);
    }
  }

  /**
   * Send message to dead letter queue
   */
  private async sendToDeadLetterQueue(message: Message, handler: MessageHandler, error: Error): Promise<void> {
    const deadLetterMessage: Message = {
      ...message,
      metadata: {
        ...message.metadata,
        timestamp: new Date(),
      },
      routing: {
        ...message.routing,
        headers: {
          ...message.routing.headers,
          originalTopic: message.topic,
          handlerId: handler.id,
          error: String(error),
          failureTime: new Date().toISOString(),
        },
      },
    };

    this.deadLetterQueue.push(deadLetterMessage);

    logger.warn('Message sent to dead letter queue', {
      messageId: message.id,
      originalTopic: message.topic,
      handlerId: handler.id,
      error: String(error),
    });

    monitoring.recordMetric({
      name: 'messagebroker.deadletter.message',
      value: 1,
      tags: {
        originalTopic: message.topic,
        handlerId: handler.id,
      },
    });
  }

  /**
   * Event sourcing - append event to stream
   */
  async appendEvent(
    streamId: string,
    eventType: string,
    eventData: any,
    metadata: any = {}
  ): Promise<string> {
    let eventStore = this.eventStore.get(streamId);
    if (!eventStore) {
      eventStore = {
        streamId,
        events: [],
        version: 0,
      };
      this.eventStore.set(streamId, eventStore);
    }

    const eventId = stringUtils.random(12);
    const event: StoredEvent = {
      id: eventId,
      streamId,
      type: eventType,
      data: eventData,
      metadata,
      version: eventStore.version + 1,
      timestamp: new Date(),
    };

    eventStore.events.push(event);
    eventStore.version = event.version;

    // Publish event as message
    await this.publish(`event.${eventType}`, {
      eventId,
      streamId,
      eventType,
      data: eventData,
      version: event.version,
    }, {
      type: 'domain-event',
      correlationId: metadata.correlationId,
      traceId: metadata.traceId,
    });

    logger.debug('Event appended to stream', {
      eventId,
      streamId,
      eventType,
      version: event.version,
    });

    monitoring.recordMetric({
      name: 'messagebroker.event.appended',
      value: 1,
      tags: {
        streamId,
        eventType,
        version: event.version.toString(),
      },
    });

    return eventId;
  }

  /**
   * Get events from stream
   */
  getEvents(streamId: string, fromVersion?: number): StoredEvent[] {
    const eventStore = this.eventStore.get(streamId);
    if (!eventStore) return [];

    if (fromVersion !== undefined) {
      return eventStore.events.filter(event => event.version > fromVersion);
    }

    return eventStore.events;
  }

  /**
   * Create saga
   */
  async startSaga(
    sagaType: string,
    steps: Omit<SagaStep, 'id' | 'status'>[],
    context: any = {}
  ): Promise<string> {
    const sagaId = stringUtils.random(12);
    const saga: Saga = {
      id: sagaId,
      type: sagaType,
      state: 'pending',
      steps: steps.map((step, index) => ({
        id: `${sagaId}-step-${index}`,
        status: 'pending',
        ...step,
      })),
      currentStep: 0,
      context,
      startTime: new Date(),
    };

    this.sagas.set(sagaId, saga);

    logger.info('Saga started', {
      sagaId,
      sagaType,
      stepsCount: steps.length,
    });

    monitoring.recordMetric({
      name: 'messagebroker.saga.started',
      value: 1,
      tags: {
        sagaType,
        stepsCount: steps.length.toString(),
      },
    });

    return sagaId;
  }

  /**
   * Process saga steps
   */
  private async processSaga(saga: Saga): Promise<void> {
    if (saga.state !== 'pending' && saga.state !== 'running') return;

    saga.state = 'running';
    const step = saga.steps[saga.currentStep];

    if (!step || step.status === 'completed') {
      // Check if all steps are completed
      const allCompleted = saga.steps.every(s => s.status === 'completed');
      if (allCompleted) {
        saga.state = 'completed';
        saga.endTime = new Date();
        logger.info('Saga completed successfully', { sagaId: saga.id });
        return;
      }
      
      // Move to next step
      saga.currentStep++;
      if (saga.currentStep < saga.steps.length) {
        await this.processSaga(saga);
      }
      return;
    }

    try {
      logger.debug('Executing saga step', {
        sagaId: saga.id,
        stepId: step.id,
        stepName: step.name,
      });

      const result = await step.action(saga.context);
      step.result = result;
      step.status = 'completed';
      
      // Update context with step result
      saga.context = { ...saga.context, [step.name]: result };

      monitoring.recordMetric({
        name: 'messagebroker.saga.step.completed',
        value: 1,
        tags: {
          sagaId: saga.id,
          stepName: step.name,
        },
      });

      // Continue with next step
      saga.currentStep++;
      await this.processSaga(saga);

    } catch (error) {
      step.status = 'failed';
      step.error = String(error);
      saga.state = 'compensating';

      logger.error('Saga step failed, starting compensation', {
        sagaId: saga.id,
        stepId: step.id,
        error: String(error),
      });

      monitoring.recordMetric({
        name: 'messagebroker.saga.step.failed',
        value: 1,
        tags: {
          sagaId: saga.id,
          stepName: step.name,
        },
      });

      await this.compensateSaga(saga);
    }
  }

  /**
   * Compensate saga (rollback)
   */
  private async compensateSaga(saga: Saga): Promise<void> {
    saga.state = 'compensating';

    // Compensate completed steps in reverse order
    for (let i = saga.currentStep - 1; i >= 0; i--) {
      const step = saga.steps[i];
      if (step.status === 'completed') {
        try {
          await step.compensation(saga.context);
          step.status = 'compensated';

          logger.debug('Saga step compensated', {
            sagaId: saga.id,
            stepId: step.id,
            stepName: step.name,
          });

        } catch (error) {
          logger.error('Saga compensation failed', {
            sagaId: saga.id,
            stepId: step.id,
            error: String(error),
          });
        }
      }
    }

    saga.state = 'failed';
    saga.endTime = new Date();

    logger.warn('Saga failed and compensated', { sagaId: saga.id });

    monitoring.recordMetric({
      name: 'messagebroker.saga.compensated',
      value: 1,
      tags: {
        sagaId: saga.id,
        sagaType: saga.type,
      },
    });
  }

  /**
   * Start message processing
   */
  private startMessageProcessing(): void {
    setInterval(() => {
      // Process queued messages
      for (const [queueName, messages] of this.messageBuffer.entries()) {
        if (messages.length > 0) {
          const queue = this.queues.get(queueName);
          if (queue) {
            queue.statistics.publishRate = messages.length;
            queue.statistics.messageCount = messages.length;
          }
        }
      }

      // Update queue statistics
      for (const [queueName, queue] of this.queues.entries()) {
        const handlers = this.handlers.get(queueName) || [];
        queue.statistics.consumerCount = handlers.length;

        monitoring.recordMetric({
          name: 'messagebroker.queue.message_count',
          value: queue.statistics.messageCount,
          tags: { queue: queueName },
        });

        monitoring.recordMetric({
          name: 'messagebroker.queue.consumer_count',
          value: queue.statistics.consumerCount,
          tags: { queue: queueName },
        });
      }

    }, 5000); // Every 5 seconds
  }

  /**
   * Start saga processor
   */
  private startSagaProcessor(): void {
    setInterval(async () => {
      const pendingSagas = Array.from(this.sagas.values()).filter(saga => 
        saga.state === 'pending' || saga.state === 'running'
      );

      for (const saga of pendingSagas) {
        try {
          await this.processSaga(saga);
        } catch (error) {
          logger.error('Saga processing error', {
            sagaId: saga.id,
            error: String(error),
          });
        }
      }
    }, 1000); // Every second
  }

  /**
   * Start event store cleanup
   */
  private startEventStoreCleanup(): void {
    setInterval(() => {
      const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days

      for (const [streamId, eventStore] of this.eventStore.entries()) {
        const filteredEvents = eventStore.events.filter(event => 
          event.timestamp.getTime() > cutoff
        );

        if (filteredEvents.length !== eventStore.events.length) {
          eventStore.events = filteredEvents;
          logger.debug('Event store cleaned up', {
            streamId,
            eventsRemoved: eventStore.events.length - filteredEvents.length,
          });
        }
      }
    }, 24 * 60 * 60 * 1000); // Daily
  }

  /**
   * Setup default queues
   */
  private setupDefaultQueues(): void {
    // Main message queue
    this.createQueue({
      name: 'main',
      type: 'direct',
      durable: true,
      autoDelete: false,
      options: {
        maxLength: 10000,
        messageTtl: 3600000, // 1 hour
      },
    });

    // Priority queue for high-priority messages
    this.createQueue({
      name: 'priority',
      type: 'priority',
      durable: true,
      autoDelete: false,
      options: {
        priority: 10,
        maxLength: 1000,
      },
    });

    // Event queue for domain events
    this.createQueue({
      name: 'events',
      type: 'topic',
      durable: true,
      autoDelete: false,
      options: {
        maxLength: 50000,
        messageTtl: 7 * 24 * 3600000, // 7 days
      },
    });

    logger.info('Default queues created');
  }

  /**
   * Get broker statistics
   */
  getBrokerStatistics(): {
    queues: number;
    totalMessages: number;
    subscriptions: number;
    eventStreams: number;
    activeSagas: number;
    deadLetterMessages: number;
  } {
    const totalMessages = Array.from(this.messageBuffer.values())
      .reduce((sum, messages) => sum + messages.length, 0);

    const totalSubscriptions = Array.from(this.subscriptions.values())
      .reduce((sum, subs) => sum + subs.size, 0);

    const activeSagas = Array.from(this.sagas.values())
      .filter(saga => saga.state === 'pending' || saga.state === 'running')
      .length;

    return {
      queues: this.queues.size,
      totalMessages,
      subscriptions: totalSubscriptions,
      eventStreams: this.eventStore.size,
      activeSagas,
      deadLetterMessages: this.deadLetterQueue.length,
    };
  }

  /**
   * Get queue details
   */
  getQueue(queueName: string): Queue | undefined {
    return this.queues.get(queueName);
  }

  /**
   * Get saga details
   */
  getSaga(sagaId: string): Saga | undefined {
    return this.sagas.get(sagaId);
  }

  /**
   * Get dead letter queue messages
   */
  getDeadLetterMessages(): Message[] {
    return [...this.deadLetterQueue];
  }
}

// Export singleton instance
export const messageBroker = new MessageBroker();

// Export types
export type { Message, MessageHandler, Queue, EventStore, StoredEvent, Saga, SagaStep };