import { InMemoryEventPublisher } from './InMemoryEventPublisher.js';
import { TodoCreatedHandler } from './handlers/TodoCreatedHandler.js';
import { TodoCompletedHandler } from './handlers/TodoCompletedHandler.js';
import { TodoUpdatedHandler } from './handlers/TodoUpdatedHandler.js';
import { TodoCreated } from '../../domain/events/TodoCreated.js';
import { TodoCompleted } from '../../domain/events/TodoCompleted.js';
import { TodoUpdated } from '../../domain/events/TodoUpdated.js';
import { TodoDeleted } from '../../domain/events/TodoDeleted.js';
import { DomainEvent } from '../../domain/events/DomainEvent.js';
import { TodoDeletedHandler } from './handlers/TodoDeletedHandler.js';
import type { DomainEventHandler } from './EventHandler.js';

export class EventHandlerRegistry {
  private readonly todoCreatedHandler = new TodoCreatedHandler();
  private readonly todoCompletedHandler = new TodoCompletedHandler();
  private readonly todoUpdatedHandler = new TodoUpdatedHandler();
  private readonly todoDeletedHandler = new TodoDeletedHandler();
  private todoEmbeddingHandler: DomainEventHandler<TodoCreated | TodoUpdated | TodoDeleted> | null = null;

  constructor(private readonly eventPublisher: InMemoryEventPublisher) {
    this.registerHandlers();
  }

  setEmbeddingHandler(handler: DomainEventHandler<TodoCreated | TodoUpdated | TodoDeleted>) {
    this.todoEmbeddingHandler = handler;
  }

  private registerHandlers(): void {
    this.eventPublisher.onEventType('TodoCreated', async (event: DomainEvent) => {
      await this.todoCreatedHandler.handle(event as TodoCreated);
      if (this.todoEmbeddingHandler) {
        await this.todoEmbeddingHandler.handle(event as TodoCreated);
      }
    });

    this.eventPublisher.onEventType('TodoCompleted', async (event: DomainEvent) => {
      await this.todoCompletedHandler.handle(event as TodoCompleted);
    });

    this.eventPublisher.onEventType('TodoUpdated', async (event: DomainEvent) => {
      await this.todoUpdatedHandler.handle(event as TodoUpdated);
      if (this.todoEmbeddingHandler) {
        await this.todoEmbeddingHandler.handle(event as TodoUpdated);
      }
    });

    this.eventPublisher.onEventType('TodoDeleted', async (event: DomainEvent) => {
      await this.todoDeletedHandler.handle(event as TodoDeleted);
      if (this.todoEmbeddingHandler) {
        await this.todoEmbeddingHandler.handle(event as TodoDeleted);
      }
    });

    this.eventPublisher.onDomainEvent(async (event) => {
      console.log(`Domain event published: ${event.eventType} for aggregate ${event.aggregateId}`);
    });
  }
}