import { TodoCreated } from '../../../domain/events/TodoCreated.js';
import { TodoUpdated } from '../../../domain/events/TodoUpdated.js';
import { TodoDeleted } from '../../../domain/events/TodoDeleted.js';
import { EmbeddingService } from '../../ai/EmbeddingService.js';
import { Container } from '../../container/Container.js';
import { logger } from '@/logger';
import type { DomainEventHandler } from '../EventHandler.js';
import type { Hooks } from 'crossws';
import type { EventHandlerResolver } from 'h3';

export class TodoEmbeddingHandler implements DomainEventHandler<TodoCreated | TodoUpdated | TodoDeleted> {

  private embeddingService: EmbeddingService;

  constructor() {
    this.embeddingService = Container.getInstance().embeddingService;
  }

  async handle(event: TodoCreated | TodoUpdated | TodoDeleted): Promise<void> {
    try {
      if (event instanceof TodoCreated) {
        await this.handleTodoCreated(event);
      } else if (event instanceof TodoUpdated) {
        await this.handleTodoUpdated(event);
      } else if (event instanceof TodoDeleted) {
        await this.handleTodoDeleted(event);
      }
    } catch (error) {
      logger.error('Error handling todo embedding event:', error);
      // Don't throw - we don't want to break the main flow if embeddings fail
    }
  }

  private async handleTodoCreated(event: TodoCreated): Promise<void> {
    await this.embeddingService.embedTodo(
      event.aggregateId,
      event.title,
      event.userId,
      event.status,
      event.priority
    );
  }

  private async handleTodoUpdated(event: TodoUpdated): Promise<void> {
    // Get the latest todo data from the repository
    const todoRepo = Container.getInstance().todoRepository;
    const todo = await todoRepo.findById(event.aggregateId);

    if (todo) {
      await this.embeddingService.embedTodo(
        todo.id,
        todo.title,
        todo.userId,
        todo.status,
        todo.priority
      );
    }
  }

  private async handleTodoDeleted(event: TodoDeleted): Promise<void> {
    await this.embeddingService.deleteEmbedding('todo', event.aggregateId);
  }
}