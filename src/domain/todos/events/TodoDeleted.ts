import { DomainEvent } from '../../shared/events/DomainEvent.js';

export class TodoDeleted extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly deletedBy: string,
    version: number = 1
  ) {
    super(aggregateId, 'TodoDeleted', version);
  }

  getEventData(): Record<string, any> {
    return {
      deletedBy: this.deletedBy,
    };
  }
}