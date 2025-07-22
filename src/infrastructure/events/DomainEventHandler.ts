import { DomainEvent } from '../../domain/events/DomainEvent.js';

export interface DomainEventHandler {
  handle(event: DomainEvent): Promise<void>;
}