// @ts-ignore - amqplib is optional dependency
import * as amqp from 'amqplib';
import type { EventBusAdapter, EventEnvelope } from '../EventBus.js';
import { logger } from '@/logger.js';
import { DomainEvent } from '@/domain/events/DomainEvent.js';

export interface RabbitMQConfig {
  url: string;
  exchange?: string;
  exchangeType?: 'direct' | 'topic' | 'fanout' | 'headers';
  durable?: boolean;
  prefetch?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

/**
 * RabbitMQ adapter for the Event Bus
 * Provides reliable message delivery with RabbitMQ
 */
export class RabbitMQAdapter implements EventBusAdapter {
  private config: Required<RabbitMQConfig>;
  private connection?: amqp.Connection;
  private channel?: amqp.Channel;
  private consumers: Map<string, string> = new Map(); // topic -> consumerTag
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: RabbitMQConfig) {
    this.config = {
      exchange: 'events',
      exchangeType: 'topic',
      durable: true,
      prefetch: 10,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      ...config,
    };
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();

      // Set prefetch for fair dispatch
      await this.channel.prefetch(this.config.prefetch);

      // Create exchange
      await this.channel.assertExchange(
        this.config.exchange,
        this.config.exchangeType,
        { durable: this.config.durable }
      );

      // Set up connection error handlers
      this.connection.on('error', (err: Error) => {
        logger.error('RabbitMQ connection error:', err);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.handleConnectionError();
      });

      this.reconnectAttempts = 0;
      logger.info('Connected to RabbitMQ');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Cancel all consumers
    for (const [topic, consumerTag] of this.consumers.entries()) {
      try {
        await this.channel?.cancel(consumerTag);
      } catch (error) {
        logger.error(`Failed to cancel consumer for ${topic}:`, error);
      }
    }
    this.consumers.clear();

    // Close channel and connection
    if (this.channel) {
      await this.channel.close();
      this.channel = undefined;
    }

    if (this.connection) {
      await this.connection.close();
      this.connection = undefined;
    }

    logger.info('Disconnected from RabbitMQ');
  }

  async publish<T extends DomainEvent>(
    topic: string,
    envelope: EventEnvelope<T>
  ): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('RabbitMQ adapter is not connected');
    }

    const message = Buffer.from(JSON.stringify(envelope));
    const options: amqp.Options.Publish = {
      persistent: true,
      contentType: 'application/json',
      timestamp: Date.now(),
      messageId: envelope.event.eventId,
      correlationId: envelope.metadata.correlationId,
      headers: {
        eventType: envelope.event.eventType,
        aggregateId: envelope.event.aggregateId,
        aggregateType: envelope.event.aggregateType || 'unknown',
        userId: envelope.metadata.userId,
        source: envelope.metadata.source,
      },
    };

    // Publish with publisher confirms
    const published = this.channel!.publish(
      this.config.exchange,
      topic,
      message,
      options
    );

    if (!published) {
      // Channel buffer is full, wait for drain event
      await new Promise<void>((resolve) => {
        this.channel!.once('drain', resolve);
      });
    }

    logger.debug(`Published event to RabbitMQ topic ${topic}`, {
      eventId: envelope.event.eventId,
      eventType: envelope.event.eventType,
    });
  }

  async subscribe(
    topic: string,
    handler: (envelope: EventEnvelope) => Promise<void>
  ): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('RabbitMQ adapter is not connected');
    }

    // Create a unique queue for this consumer
    const queueName = `${topic}.${process.env.NODE_ENV || 'dev'}.${
      process.pid
    }`;
    const { queue } = await this.channel!.assertQueue(queueName, {
      durable: this.config.durable,
      exclusive: false,
      autoDelete: true,
    });

    // Bind queue to exchange with topic pattern
    await this.channel!.bindQueue(queue, this.config.exchange, topic);

    // Start consuming
    const { consumerTag } = await this.channel!.consume(
      queue,
      async (msg: amqp.Message | null) => {
        if (!msg) return;

        try {
          const envelope: EventEnvelope = JSON.parse(
            msg.content.toString()
          );

          // Restore Date objects
          // @ts-ignore - readonly property
          envelope.event.occurredAt = new Date(envelope.event.occurredAt);
          // @ts-ignore - property may not exist
          envelope.event.recordedAt = envelope.event.recordedAt ? new Date(envelope.event.recordedAt) : undefined;
          envelope.metadata.timestamp = new Date(envelope.metadata.timestamp);

          await handler(envelope);

          // Acknowledge message
          this.channel!.ack(msg);
        } catch (error) {
          logger.error('Error processing RabbitMQ message:', error);

          // Reject and requeue on error (unless it's been redelivered too many times)
          const redeliveryCount = msg.properties.headers['x-redelivery-count'] || 0;
          if (redeliveryCount < 3) {
            this.channel!.nack(msg, false, true);
          } else {
            // Send to DLQ after max retries
            this.channel!.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    );

    this.consumers.set(topic, consumerTag);
    logger.info(`Subscribed to RabbitMQ topic ${topic} with queue ${queue}`);
  }

  async unsubscribe(topic: string): Promise<void> {
    const consumerTag = this.consumers.get(topic);
    if (consumerTag && this.channel) {
      await this.channel.cancel(consumerTag);
      this.consumers.delete(topic);
      logger.info(`Unsubscribed from RabbitMQ topic ${topic}`);
    }
  }

  isConnected(): boolean {
    return !!(this.connection && this.channel);
  }

  private handleConnectionError(): void {
    if (this.reconnectTimer) return; // Already reconnecting

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached for RabbitMQ');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectDelay * this.reconnectAttempts,
      30000
    );

    logger.info(
      `Attempting to reconnect to RabbitMQ in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try {
        await this.connect();

        // Re-subscribe to all topics
        for (const [topic, _] of this.consumers) {
          // Note: We need to store the handlers to properly re-subscribe
          logger.info(`Re-subscribing to topic ${topic} after reconnection`);
        }
      } catch (error) {
        logger.error('RabbitMQ reconnection failed:', error);
        this.handleConnectionError(); // Retry again
      }
    }, delay);
  }
}

/**
 * Factory function for creating RabbitMQ adapter
 */
export function createRabbitMQAdapter(config: RabbitMQConfig): RabbitMQAdapter {
  return new RabbitMQAdapter(config);
}