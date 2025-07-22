import { TodoCreated } from '../../../domain/events/TodoCreated.js';
import { TodoUpdated } from '../../../domain/events/TodoUpdated.js';
import { TodoDeleted } from '../../../domain/events/TodoDeleted.js';
import { EmbeddingService } from '../../ai/EmbeddingService.js';
import { logger } from '@/logger';
import type { DomainEventHandler } from '../EventHandler.js';

export class TodoEmbeddingHandler implements DomainEventHandler<TodoCreated | TodoUpdated | TodoDeleted> {

  constructor(
    private embeddingService: EmbeddingService,
    private todoRepository: any
  ) {}

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
      event.description,
      event.userId,
      event.status.value,
      event.priority.value
    );
  }

  private async handleTodoUpdated(event: TodoUpdated): Promise<void> {
    // Get the latest todo data from the repository
    const todo = await this.todoRepository.findById(event.aggregateId);

    if (todo) {
      await this.embeddingService.embedTodo(
        todo.id,
        todo.title,
        todo.description || null,
        todo.userId,
        todo.status.value,
        todo.priority.value
      );
    }
  }

  private async handleTodoDeleted(event: TodoDeleted): Promise<void> {
    await this.embeddingService.deleteEmbedding('todo', event.aggregateId);
  }
}