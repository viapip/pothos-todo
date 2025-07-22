import type { DomainEvent } from '../../domain/events/DomainEvent.js';

export interface DomainEventHandler<T extends DomainEvent> {
    handle(event: T): Promise<void>;
}
