import { DomainEvent } from './DomainEvent.js';

export class TodoCompleted extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly completedAt: Date,
    public readonly userId: string,
    version: number = 1
  ) {
    super(aggregateId, 'TodoCompleted', version);
  }

  getEventData(): Record<string, any> {
    return {
      completedAt: this.completedAt.toISOString(),
      userId: this.userId,
    };
  }
}