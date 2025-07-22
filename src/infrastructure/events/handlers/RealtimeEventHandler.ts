import { TodoCreated } from '../../../domain/events/TodoCreated.js';
import { TodoUpdated } from '../../../domain/events/TodoUpdated.js';
import { TodoDeleted } from '../../../domain/events/TodoDeleted.js';
import { TodoCompleted } from '../../../domain/events/TodoCompleted.js';
import { PubSubManager } from '../../realtime/PubSubManager.js';
import { logger } from '@/logger';
import type { DomainEventHandler } from '../EventHandler.js';
import type { PrismaClient } from '@prisma/client';

export class RealtimeEventHandler implements DomainEventHandler<TodoCreated | TodoUpdated | TodoDeleted | TodoCompleted> {
  private pubsubManager: PubSubManager;
  
  constructor(
    private prisma: PrismaClient
  ) {
    this.pubsubManager = PubSubManager.getInstance();
  }
  
  async handle(event: TodoCreated | TodoUpdated | TodoDeleted | TodoCompleted): Promise<void> {
    try {
      if (event instanceof TodoCreated) {
        await this.handleTodoCreated(event);
      } else if (event instanceof TodoUpdated) {
        await this.handleTodoUpdated(event);
      } else if (event instanceof TodoDeleted) {
        await this.handleTodoDeleted(event);
      } else if (event instanceof TodoCompleted) {
        await this.handleTodoCompleted(event);
      }
    } catch (error) {
      logger.error('Error handling realtime event:', error);
      // Don't throw - we don't want to break the main flow if realtime fails
    }
  }
  
  private async handleTodoCreated(event: TodoCreated): Promise<void> {
    const todo = await this.prisma.todo.findUnique({
      where: { id: event.aggregateId }
    });
    
    if (todo) {
      await this.pubsubManager.publishTodoCreated(todo, event.userId);
      
      // Also check for AI suggestions
      this.triggerAISuggestions(event.userId);
    }
  }
  
  private async handleTodoUpdated(event: TodoUpdated): Promise<void> {
    const todo = await this.prisma.todo.findUnique({
      where: { id: event.aggregateId }
    });
    
    if (todo) {
      // Determine what changed
      const changes: any = {};
      if (event.title) changes.title = event.title;
      if (event.description !== undefined) changes.description = event.description;
      if (event.priority) changes.priority = event.priority.value;
      if (event.status) changes.status = event.status.value;
      
      await this.pubsubManager.publishTodoUpdated(todo, event.userId, changes);
    }
  }
  
  private async handleTodoDeleted(event: TodoDeleted): Promise<void> {
    await this.pubsubManager.publishTodoDeleted(event.aggregateId, event.userId);
  }
  
  private async handleTodoCompleted(event: TodoCompleted): Promise<void> {
    const todo = await this.prisma.todo.findUnique({
      where: { id: event.aggregateId }
    });
    
    if (todo) {
      await this.pubsubManager.publishTodoCompleted(todo, event.userId);
      
      // Trigger AI analysis for productivity insights
      this.triggerProductivityAnalysis(event.userId);
    }
  }
  
  private async triggerAISuggestions(userId: string): Promise<void> {
    // This would trigger AI suggestion generation asynchronously
    // For now, we'll just log it
    logger.info('Triggering AI suggestions for user', { userId });
  }
  
  private async triggerProductivityAnalysis(userId: string): Promise<void> {
    // This would trigger productivity analysis asynchronously
    // For now, we'll just log it
    logger.info('Triggering productivity analysis for user', { userId });
  }
}