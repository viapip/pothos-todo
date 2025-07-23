import { DomainEvent } from '@/domain/events/DomainEvent.js';
import type { Projection } from '../events/EventSourcing.js';
import { logger } from '@/logger.js';
import prisma from '@/lib/prisma';

/**
 * Base class for CQRS Read Models
 */
export abstract class ReadModel implements Projection {
  abstract name: string;
  
  /**
   * Event handlers mapping
   */
  protected abstract eventHandlers: Record<string, (event: DomainEvent) => Promise<void>>;
  
  /**
   * Handle incoming events
   */
  async handle(event: DomainEvent): Promise<void> {
    const handler = this.eventHandlers[event.eventType];
    if (handler) {
      await handler.call(this, event);
      logger.debug(`Handled event ${event.eventType} in read model ${this.name}`);
    }
  }
  
  /**
   * Initialize the read model (clear and rebuild if needed)
   */
  abstract initialize(): Promise<void>;
}

/**
 * Todo List Read Model - Optimized for list views
 */
export class TodoListReadModel extends ReadModel {
  name = 'TodoListReadModel';
  
  protected eventHandlers = {
    TodoCreated: this.handleTodoCreated.bind(this),
    TodoUpdated: this.handleTodoUpdated.bind(this),
    TodoCompleted: this.handleTodoCompleted.bind(this),
    TodoDeleted: this.handleTodoDeleted.bind(this),
    TodoAssigned: this.handleTodoAssigned.bind(this),
  };
  
  async initialize(): Promise<void> {
    // In production, this would clear the read model tables
    logger.info('Initializing TodoListReadModel');
  }
  
  private async handleTodoCreated(event: DomainEvent): Promise<void> {
    // Update denormalized todo list view
    await prisma.$executeRaw`
      INSERT INTO todo_list_view (
        todo_id, user_id, title, status, priority, 
        created_at, updated_at, completion_rate, tags
      ) VALUES (
        ${event.aggregateId},
        ${event.metadata?.userId},
        ${event.payload.title},
        ${event.payload.status},
        ${event.payload.priority},
        ${event.occurredAt},
        ${event.occurredAt},
        0,
        ${JSON.stringify(event.payload.tags || [])}
      ) ON CONFLICT (todo_id) DO NOTHING
    `;
  }
  
  private async handleTodoUpdated(event: DomainEvent): Promise<void> {
    // Update specific fields that changed
    const updates = event.payload.changes || {};
    
    if (Object.keys(updates).length > 0) {
      await prisma.$executeRaw`
        UPDATE todo_list_view 
        SET 
          title = COALESCE(${updates.title}, title),
          status = COALESCE(${updates.status}, status),
          priority = COALESCE(${updates.priority}, priority),
          updated_at = ${event.occurredAt}
        WHERE todo_id = ${event.aggregateId}
      `;
    }
  }
  
  private async handleTodoCompleted(event: DomainEvent): Promise<void> {
    await prisma.$executeRaw`
      UPDATE todo_list_view 
      SET 
        status = 'COMPLETED',
        completed_at = ${event.occurredAt},
        completion_rate = 100,
        updated_at = ${event.occurredAt}
      WHERE todo_id = ${event.aggregateId}
    `;
  }
  
  private async handleTodoDeleted(event: DomainEvent): Promise<void> {
    await prisma.$executeRaw`
      DELETE FROM todo_list_view 
      WHERE todo_id = ${event.aggregateId}
    `;
  }
  
  private async handleTodoAssigned(event: DomainEvent): Promise<void> {
    await prisma.$executeRaw`
      UPDATE todo_list_view 
      SET 
        assignee_ids = ${JSON.stringify(event.payload.assigneeIds)},
        updated_at = ${event.occurredAt}
      WHERE todo_id = ${event.aggregateId}
    `;
  }
}

/**
 * User Statistics Read Model
 */
export class UserStatisticsReadModel extends ReadModel {
  name = 'UserStatisticsReadModel';
  
  protected eventHandlers = {
    TodoCreated: this.updateStatistics.bind(this),
    TodoCompleted: this.updateStatistics.bind(this),
    TodoDeleted: this.updateStatistics.bind(this),
  };
  
  async initialize(): Promise<void> {
    logger.info('Initializing UserStatisticsReadModel');
  }
  
  private async updateStatistics(event: DomainEvent): Promise<void> {
    const userId = event.metadata?.userId;
    if (!userId) return;
    
    // Calculate statistics from events
    const stats = await this.calculateUserStats(userId);
    
    // Upsert user statistics
    await prisma.$executeRaw`
      INSERT INTO user_statistics (
        user_id, total_todos, completed_todos, 
        completion_rate, avg_completion_time,
        last_updated
      ) VALUES (
        ${userId},
        ${stats.totalTodos},
        ${stats.completedTodos},
        ${stats.completionRate},
        ${stats.avgCompletionTime},
        ${new Date()}
      ) ON CONFLICT (user_id) DO UPDATE SET
        total_todos = EXCLUDED.total_todos,
        completed_todos = EXCLUDED.completed_todos,
        completion_rate = EXCLUDED.completion_rate,
        avg_completion_time = EXCLUDED.avg_completion_time,
        last_updated = EXCLUDED.last_updated
    `;
  }
  
  private async calculateUserStats(userId: string) {
    // This would calculate from event store or read model
    const todos = await prisma.todo.findMany({ where: { userId } });
    const completed = todos.filter(t => t.status === 'COMPLETED');
    
    return {
      totalTodos: todos.length,
      completedTodos: completed.length,
      completionRate: todos.length > 0 ? (completed.length / todos.length) * 100 : 0,
      avgCompletionTime: this.calculateAvgCompletionTime(todos),
    };
  }
  
  private calculateAvgCompletionTime(todos: any[]): number {
    const completedWithTime = todos.filter(t => 
      t.status === 'COMPLETED' && t.completedAt && t.createdAt
    );
    
    if (completedWithTime.length === 0) return 0;
    
    const totalTime = completedWithTime.reduce((sum, todo) => {
      const time = new Date(todo.completedAt).getTime() - new Date(todo.createdAt).getTime();
      return sum + time;
    }, 0);
    
    return totalTime / completedWithTime.length / (1000 * 60 * 60); // Convert to hours
  }
}

/**
 * Tag Analytics Read Model
 */
export class TagAnalyticsReadModel extends ReadModel {
  name = 'TagAnalyticsReadModel';
  
  protected eventHandlers = {
    TodoCreated: this.updateTagAnalytics.bind(this),
    TodoUpdated: this.updateTagAnalytics.bind(this),
    TodoDeleted: this.removeTagAnalytics.bind(this),
  };
  
  async initialize(): Promise<void> {
    logger.info('Initializing TagAnalyticsReadModel');
  }
  
  private async updateTagAnalytics(event: DomainEvent): Promise<void> {
    const tags = event.payload.tags || [];
    const userId = event.metadata?.userId;
    
    for (const tag of tags) {
      await prisma.$executeRaw`
        INSERT INTO tag_analytics (
          tag, user_id, usage_count, last_used
        ) VALUES (
          ${tag},
          ${userId},
          1,
          ${event.occurredAt}
        ) ON CONFLICT (tag, user_id) DO UPDATE SET
          usage_count = tag_analytics.usage_count + 1,
          last_used = EXCLUDED.last_used
      `;
    }
  }
  
  private async removeTagAnalytics(event: DomainEvent): Promise<void> {
    const tags = event.payload.tags || [];
    const userId = event.metadata?.userId;
    
    for (const tag of tags) {
      await prisma.$executeRaw`
        UPDATE tag_analytics 
        SET usage_count = GREATEST(usage_count - 1, 0)
        WHERE tag = ${tag} AND user_id = ${userId}
      `;
    }
  }
}

/**
 * Activity Timeline Read Model
 */
export class ActivityTimelineReadModel extends ReadModel {
  name = 'ActivityTimelineReadModel';
  
  protected eventHandlers = {
    TodoCreated: this.addActivity.bind(this),
    TodoUpdated: this.addActivity.bind(this),
    TodoCompleted: this.addActivity.bind(this),
    TodoDeleted: this.addActivity.bind(this),
    TodoAssigned: this.addActivity.bind(this),
  };
  
  async initialize(): Promise<void> {
    logger.info('Initializing ActivityTimelineReadModel');
  }
  
  private async addActivity(event: DomainEvent): Promise<void> {
    const activity = {
      id: `act_${event.eventId}`,
      userId: event.metadata?.userId,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      description: this.generateDescription(event),
      metadata: event.payload,
      occurredAt: event.occurredAt,
    };
    
    await prisma.$executeRaw`
      INSERT INTO activity_timeline (
        id, user_id, event_type, aggregate_id,
        aggregate_type, description, metadata, occurred_at
      ) VALUES (
        ${activity.id},
        ${activity.userId},
        ${activity.eventType},
        ${activity.aggregateId},
        ${activity.aggregateType},
        ${activity.description},
        ${JSON.stringify(activity.metadata)},
        ${activity.occurredAt}
      )
    `;
  }
  
  private generateDescription(event: DomainEvent): string {
    switch (event.eventType) {
      case 'TodoCreated':
        return `Created todo: ${event.payload.title}`;
      case 'TodoUpdated':
        return `Updated todo: ${event.payload.title || 'Todo'}`;
      case 'TodoCompleted':
        return `Completed todo: ${event.payload.title || 'Todo'}`;
      case 'TodoDeleted':
        return `Deleted todo: ${event.payload.title || 'Todo'}`;
      case 'TodoAssigned':
        return `Assigned todo to ${event.payload.assigneeIds?.length || 0} users`;
      default:
        return `${event.eventType} occurred`;
    }
  }
}

/**
 * Read Model Manager for coordinating all read models
 */
export class ReadModelManager {
  private readModels: Map<string, ReadModel> = new Map();
  
  constructor() {
    // Register default read models
    this.registerReadModel(new TodoListReadModel());
    this.registerReadModel(new UserStatisticsReadModel());
    this.registerReadModel(new TagAnalyticsReadModel());
    this.registerReadModel(new ActivityTimelineReadModel());
  }
  
  registerReadModel(readModel: ReadModel): void {
    this.readModels.set(readModel.name, readModel);
    logger.info(`Registered read model: ${readModel.name}`);
  }
  
  getReadModel<T extends ReadModel>(name: string): T | undefined {
    return this.readModels.get(name) as T;
  }
  
  getAllReadModels(): ReadModel[] {
    return Array.from(this.readModels.values());
  }
}