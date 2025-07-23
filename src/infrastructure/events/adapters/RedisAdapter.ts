import { Redis } from 'ioredis';
import type { EventBusAdapter, EventEnvelope } from '../EventBus.js';
import { logger } from '@/logger.js';
import { DomainEvent } from '@/domain/events/DomainEvent.js';

export interface RedisAdapterConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  enableOfflineQueue?: boolean;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | null;
}

/**
 * Redis Pub/Sub adapter for the Event Bus
 * Provides lightweight in-memory message passing with Redis
 */
export class RedisAdapter implements EventBusAdapter {
  private publisher: Redis;
  private subscriber: Redis;
  private config: RedisAdapterConfig;
  private subscriptions: Map<string, (envelope: EventEnvelope) => Promise<void>> = new Map();
  private connected = false;

  constructor(config: RedisAdapterConfig = {}) {
    this.config = {
      host: 'localhost',
      port: 6379,
      keyPrefix: 'eventbus:',
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      ...config,
    };

    // Default retry strategy with exponential backoff
    if (!this.config.retryStrategy) {
      this.config.retryStrategy = (times: number) => {
        if (times > 10) return null; // Stop retrying after 10 attempts
        return Math.min(times * 1000, 30000); // Max 30 seconds
      };
    }

    // Create separate Redis clients for pub/sub
    this.publisher = new Redis({
      ...this.config,
      lazyConnect: true,
    });

    this.subscriber = new Redis({
      ...this.config,
      lazyConnect: true,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Publisher events
    this.publisher.on('connect', () => {
      logger.info('Redis publisher connected');
    });

    this.publisher.on('error', (err) => {
      logger.error('Redis publisher error:', err);
    });

    // Subscriber events
    this.subscriber.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    this.subscriber.on('error', (err) => {
      logger.error('Redis subscriber error:', err);
    });

    // Handle incoming messages
    this.subscriber.on('message', async (channel, message) => {
      try {
        const envelope: EventEnvelope = JSON.parse(message);
        
        // Restore Date objects
        // @ts-ignore - readonly property
        envelope.event.occurredAt = new Date(envelope.event.occurredAt);
        // @ts-ignore - property may not exist
        envelope.event.recordedAt = envelope.event.recordedAt ? new Date(envelope.event.recordedAt) : undefined;
        envelope.metadata.timestamp = new Date(envelope.metadata.timestamp);

        // Find handler for this channel
        const handler = this.subscriptions.get(channel);
        if (handler) {
          await handler(envelope);
        } else {
          logger.warn(`No handler registered for channel: ${channel}`);
        }
      } catch (error) {
        logger.error(`Error processing Redis message on channel ${channel}:`, error);
      }
    });

    // Handle pattern messages (for wildcard subscriptions)
    this.subscriber.on('pmessage', async (pattern, channel, message) => {
      try {
        const envelope: EventEnvelope = JSON.parse(message);
        
        // Restore Date objects
        // @ts-ignore - readonly property
        envelope.event.occurredAt = new Date(envelope.event.occurredAt);
        // @ts-ignore - property may not exist
        envelope.event.recordedAt = envelope.event.recordedAt ? new Date(envelope.event.recordedAt) : undefined;
        envelope.metadata.timestamp = new Date(envelope.metadata.timestamp);

        // Find handler for this pattern
        const handler = this.subscriptions.get(pattern);
        if (handler) {
          await handler(envelope);
        }
      } catch (error) {
        logger.error(`Error processing Redis pattern message:`, error);
      }
    });
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);
      
      this.connected = true;
      logger.info('Redis adapter connected');
    } catch (error) {
      logger.error('Failed to connect Redis adapter:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    
    // Unsubscribe from all channels
    for (const channel of this.subscriptions.keys()) {
      if (channel.includes('*')) {
        await this.subscriber.punsubscribe(channel);
      } else {
        await this.subscriber.unsubscribe(channel);
      }
    }
    this.subscriptions.clear();

    // Disconnect clients
    await Promise.all([
      this.publisher.quit(),
      this.subscriber.quit(),
    ]);

    logger.info('Redis adapter disconnected');
  }

  async publish<T extends DomainEvent>(
    topic: string,
    envelope: EventEnvelope<T>
  ): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Redis adapter is not connected');
    }

    const channel = this.getChannelName(topic);
    const message = JSON.stringify(envelope);

    try {
      // Publish message
      const receiverCount = await this.publisher.publish(channel, message);
      
      logger.debug(`Published event to Redis channel ${channel}`, {
        eventId: envelope.event.eventId,
        eventType: envelope.event.eventType,
        receiverCount,
      });

      // Also store in Redis for persistence (optional)
      if (this.config.keyPrefix) {
        const key = `${this.config.keyPrefix}events:${envelope.event.eventId}`;
        await this.publisher.setex(key, 86400, message); // TTL: 24 hours
      }
    } catch (error) {
      logger.error(`Failed to publish to Redis channel ${channel}:`, error);
      throw error;
    }
  }

  async subscribe(
    topic: string,
    handler: (envelope: EventEnvelope) => Promise<void>
  ): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Redis adapter is not connected');
    }

    const channel = this.getChannelName(topic);
    
    // Store handler
    this.subscriptions.set(channel, handler);

    // Subscribe to channel or pattern
    if (channel.includes('*')) {
      await this.subscriber.psubscribe(channel);
      logger.info(`Subscribed to Redis pattern: ${channel}`);
    } else {
      await this.subscriber.subscribe(channel);
      logger.info(`Subscribed to Redis channel: ${channel}`);
    }
  }

  async unsubscribe(topic: string): Promise<void> {
    const channel = this.getChannelName(topic);
    
    if (this.subscriptions.has(channel)) {
      this.subscriptions.delete(channel);
      
      if (channel.includes('*')) {
        await this.subscriber.punsubscribe(channel);
      } else {
        await this.subscriber.unsubscribe(channel);
      }
      
      logger.info(`Unsubscribed from Redis channel: ${channel}`);
    }
  }

  isConnected(): boolean {
    return this.connected && 
           this.publisher.status === 'ready' && 
           this.subscriber.status === 'ready';
  }

  private getChannelName(topic: string): string {
    return `${this.config.keyPrefix || ''}${topic}`;
  }

  /**
   * Get event history from Redis (if persistence is enabled)
   */
  async getEventHistory(
    aggregateId: string,
    limit = 100
  ): Promise<DomainEvent[]> {
    if (!this.config.keyPrefix) {
      return [];
    }

    const pattern = `${this.config.keyPrefix}events:*`;
    const keys = await this.publisher.keys(pattern);
    
    const events: DomainEvent[] = [];
    
    for (const key of keys.slice(0, limit)) {
      const data = await this.publisher.get(key);
      if (data) {
        try {
          const envelope: EventEnvelope = JSON.parse(data);
          if (envelope.event.aggregateId === aggregateId) {
            events.push(envelope.event);
          }
        } catch (error) {
          logger.error(`Failed to parse event from Redis:`, error);
        }
      }
    }

    return events.sort((a, b) => 
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    );
  }

  /**
   * Get metrics about Redis pub/sub
   */
  async getMetrics() {
    const info = await this.publisher.info('stats');
    const clients = await this.publisher.client('list');
    const channels = await this.publisher.pubsub('channels');
    
    return {
      connected: this.isConnected(),
      subscriptions: this.subscriptions.size,
      activeChannels: channels.length,
      clientCount: clients.split('\n').length - 1,
      redisInfo: info,
    };
  }
}

/**
 * Factory function for creating Redis adapter
 */
export function createRedisAdapter(config?: RedisAdapterConfig): RedisAdapter {
  return new RedisAdapter(config);
}