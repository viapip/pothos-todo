import { InMemoryEventPublisher } from './InMemoryEventPublisher.js';
import { TodoCreatedHandler } from '../handlers/todos/TodoCreatedHandler.js';
import { TodoCompletedHandler } from '../handlers/todos/TodoCompletedHandler.js';
import { TodoUpdatedHandler } from '../handlers/todos/TodoUpdatedHandler.js';
import { TodoCreated } from '../../../domain/todos/events/TodoCreated.js';
import { TodoCompleted } from '../../../domain/todos/events/TodoCompleted.js';
import { TodoUpdated } from '../../../domain/todos/events/TodoUpdated.js';
import { DomainEvent } from '../../../domain/shared/events/DomainEvent.js';

export class EventHandlerRegistry {
  private readonly todoCreatedHandler = new TodoCreatedHandler();
  private readonly todoCompletedHandler = new TodoCompletedHandler();
  private readonly todoUpdatedHandler = new TodoUpdatedHandler();

  constructor(private readonly eventPublisher: InMemoryEventPublisher) {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.eventPublisher.onEventType('TodoCreated', async (event: DomainEvent) => {
      await this.todoCreatedHandler.handle(event as TodoCreated);
    });

    this.eventPublisher.onEventType('TodoCompleted', async (event: DomainEvent) => {
      await this.todoCompletedHandler.handle(event as TodoCompleted);
    });

    this.eventPublisher.onEventType('TodoUpdated', async (event: DomainEvent) => {
      await this.todoUpdatedHandler.handle(event as TodoUpdated);
    });

    this.eventPublisher.onDomainEvent(async (event) => {
      console.log(`Domain event published: ${event.eventType} for aggregate ${event.aggregateId}`);
    });
  }
}