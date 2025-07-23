import { DomainEvent } from './DomainEvent.js';

export class TodoDeleted extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly deletedBy: string,
    version: number = 1
  ) {
    const eventId = crypto.randomUUID();
    super(aggregateId, 'TodoDeleted', version, eventId);
  }

  getEventData(): Record<string, any> {
    return {
      deletedBy: this.deletedBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}