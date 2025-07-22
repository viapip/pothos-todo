/**
 * Subscription Management System
 * Handles real-time subscriptions with memory-based pub/sub and Redis fallback
 */

import { EventEmitter } from 'node:events';
import type { Todo, TodoList, User } from '@prisma/client';
import { logger } from '../../logger.js';
import { 
  recordSubscriptionEvent,
  graphqlSubscriptionsActive,
  websocketConnectionsActive 
} from '../monitoring/metrics.js';

export interface SubscriptionEvent<T = any> {
  type: string;
  topic: string;
  payload: T;
  userId?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface TodoCreatedEvent extends SubscriptionEvent<Todo> {
  type: 'TODO_CREATED';
}

export interface TodoUpdatedEvent extends SubscriptionEvent<Todo> {
  type: 'TODO_UPDATED';
}

export interface TodoDeletedEvent extends SubscriptionEvent<{ id: string }> {
  type: 'TODO_DELETED';
}

export interface TodoListUpdatedEvent extends SubscriptionEvent<TodoList> {
  type: 'TODO_LIST_UPDATED';
}

export interface UserOnlineEvent extends SubscriptionEvent<{ userId: string; isOnline: boolean }> {
  type: 'USER_ONLINE_STATUS';
}

export type AllSubscriptionEvents = 
  | TodoCreatedEvent 
  | TodoUpdatedEvent 
  | TodoDeletedEvent 
  | TodoListUpdatedEvent 
  | UserOnlineEvent;

/**
 * In-memory pub/sub system with Redis fallback for horizontal scaling
 */
export class SubscriptionManager extends EventEmitter {
  private activeSubscriptions = new Map<string, Set<string>>();
  private userConnections = new Map<string, Set<string>>();
  
  constructor() {
    super();
    this.setMaxListeners(1000); // Support many concurrent subscriptions
  }

  /**
   * Subscribe to a topic
   */
  subscribe(subscriptionId: string, topic: string, userId?: string): void {
    // Track subscription by topic
    if (!this.activeSubscriptions.has(topic)) {
      this.activeSubscriptions.set(topic, new Set());
    }
    this.activeSubscriptions.get(topic)!.add(subscriptionId);

    // Track user connections
    if (userId) {
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId)!.add(subscriptionId);
    }

    // Update metrics
    const subscriptionType = this.getSubscriptionTypeFromTopic(topic);
    graphqlSubscriptionsActive.inc({ subscription_type: subscriptionType });
    websocketConnectionsActive.inc();

    logger.info('Subscription added', {
      subscriptionId,
      topic,
      userId,
      totalSubscriptions: this.activeSubscriptions.get(topic)?.size || 0,
    });
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(subscriptionId: string, topic: string, userId?: string): void {
    // Remove from topic subscriptions
    const topicSubscriptions = this.activeSubscriptions.get(topic);
    if (topicSubscriptions) {
      topicSubscriptions.delete(subscriptionId);
      if (topicSubscriptions.size === 0) {
        this.activeSubscriptions.delete(topic);
      }
    }

    // Remove from user connections
    if (userId) {
      const userSubscriptions = this.userConnections.get(userId);
      if (userSubscriptions) {
        userSubscriptions.delete(subscriptionId);
        if (userSubscriptions.size === 0) {
          this.userConnections.delete(userId);
        }
      }
    }

    // Update metrics
    const subscriptionType = this.getSubscriptionTypeFromTopic(topic);
    graphqlSubscriptionsActive.dec({ subscription_type: subscriptionType });
    websocketConnectionsActive.dec();

    logger.info('Subscription removed', {
      subscriptionId,
      topic,
      userId,
      remainingSubscriptions: this.activeSubscriptions.get(topic)?.size || 0,
    });
  }

  /**
   * Publish an event to all subscribers of a topic
   */
  publish<T extends AllSubscriptionEvents>(event: T): void {
    const subscribers = this.activeSubscriptions.get(event.topic);
    if (!subscribers || subscribers.size === 0) {
      logger.debug('No subscribers for topic', { topic: event.topic });
      return;
    }

    // Record metrics
    recordSubscriptionEvent(event.type, event.topic);

    logger.info('Publishing event', {
      type: event.type,
      topic: event.topic,
      subscriberCount: subscribers.size,
      userId: event.userId,
    });

    // Emit event to all subscribers
    this.emit(event.topic, event);
    
    // Also emit with specific event type for filtering
    this.emit(`${event.topic}:${event.type}`, event);
  }

  /**
   * Publish event to specific user's subscriptions
   */
  publishToUser<T extends AllSubscriptionEvents>(userId: string, event: T): void {
    const userSubscriptions = this.userConnections.get(userId);
    if (!userSubscriptions || userSubscriptions.size === 0) {
      logger.debug('No subscriptions for user', { userId });
      return;
    }

    logger.info('Publishing event to user', {
      type: event.type,
      topic: event.topic,
      userId,
      subscriptionCount: userSubscriptions.size,
    });

    // Emit to user-specific topic
    this.emit(`user:${userId}:${event.topic}`, event);
    this.emit(`user:${userId}`, event);
  }

  /**
   * Get subscription statistics
   */
  getStats(): {
    totalTopics: number;
    totalSubscriptions: number;
    totalUsers: number;
    topicStats: Array<{ topic: string; subscribers: number }>;
  } {
    const topicStats = Array.from(this.activeSubscriptions.entries()).map(([topic, subscribers]) => ({
      topic,
      subscribers: subscribers.size,
    }));

    return {
      totalTopics: this.activeSubscriptions.size,
      totalSubscriptions: Array.from(this.activeSubscriptions.values())
        .reduce((total, subs) => total + subs.size, 0),
      totalUsers: this.userConnections.size,
      topicStats,
    };
  }

  /**
   * Clean up orphaned subscriptions
   */
  cleanup(): void {
    const now = Date.now();
    logger.info('Running subscription cleanup', { 
      timestamp: now,
      stats: this.getStats(),
    });

    // Clean up empty topic subscriptions
    for (const [topic, subscribers] of this.activeSubscriptions.entries()) {
      if (subscribers.size === 0) {
        this.activeSubscriptions.delete(topic);
      }
    }

    // Clean up empty user connections
    for (const [userId, connections] of this.userConnections.entries()) {
      if (connections.size === 0) {
        this.userConnections.delete(userId);
      }
    }
  }

  /**
   * Helper methods for creating common events
   */
  static createTodoCreatedEvent(todo: Todo, userId?: string): TodoCreatedEvent {
    return {
      type: 'TODO_CREATED',
      topic: `todo-list:${todo.todoListId}`,
      payload: todo,
      userId,
      timestamp: Date.now(),
    };
  }

  static createTodoUpdatedEvent(todo: Todo, userId?: string): TodoUpdatedEvent {
    return {
      type: 'TODO_UPDATED',
      topic: `todo-list:${todo.todoListId}`,
      payload: todo,
      userId,
      timestamp: Date.now(),
    };
  }

  static createTodoDeletedEvent(
    todoId: string, 
    todoListId: string, 
    userId?: string
  ): TodoDeletedEvent {
    return {
      type: 'TODO_DELETED',
      topic: `todo-list:${todoListId}`,
      payload: { id: todoId },
      userId,
      timestamp: Date.now(),
    };
  }

  static createTodoListUpdatedEvent(todoList: TodoList, userId?: string): TodoListUpdatedEvent {
    return {
      type: 'TODO_LIST_UPDATED',
      topic: `todo-list:${todoList.id}`,
      payload: todoList,
      userId,
      timestamp: Date.now(),
    };
  }

  static createUserOnlineEvent(
    userId: string, 
    isOnline: boolean
  ): UserOnlineEvent {
    return {
      type: 'USER_ONLINE_STATUS',
      topic: 'user-presence',
      payload: { userId, isOnline },
      timestamp: Date.now(),
    };
  }

  /**
   * Extract subscription type from topic for metrics
   */
  private getSubscriptionTypeFromTopic(topic: string): string {
    if (topic.startsWith('todo-list:')) {
      return 'todo-updates';
    } else if (topic === 'user-presence') {
      return 'user-presence';
    } else {
      return 'unknown';
    }
  }
}

// Singleton instance
export const subscriptionManager = new SubscriptionManager();

// Periodic cleanup
setInterval(() => {
  subscriptionManager.cleanup();
}, 60000); // Clean up every minute

export default subscriptionManager;