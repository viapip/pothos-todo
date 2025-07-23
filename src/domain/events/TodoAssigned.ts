import { DomainEvent } from './DomainEvent.js';

export class TodoAssigned extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly assignedTo: string,
    public readonly assignedBy: string,
    public readonly todoListId: string | null,
    public readonly tags: string[],
    version: number = 1
  ) {
    super(aggregateId, 'TodoAssigned', version);
  }

  getEventData(): Record<string, any> {
    return {
      assignedTo: this.assignedTo,
      assignedBy: this.assignedBy,
      todoListId: this.todoListId,
      tags: this.tags,
    };
  }
}