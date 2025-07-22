import type { DomainEvent } from '../../domain/events/DomainEvent.js';

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
}