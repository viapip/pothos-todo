import { DomainEvent } from './DomainEvent.js';
import { Priority as PrismaPriority, TodoStatus as PrismaTodoStatus } from '@prisma/client';

export class TodoUpdated extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly updatedFields: {
      title?: string | null;
      status?: PrismaTodoStatus | null;
      priority?: PrismaPriority | null;
      dueDate?: Date | null;
      tags?: string[] | null;
    },
    public readonly updatedBy: string,
    version: number = 1
  ) {
    const eventId = crypto.randomUUID();
    super(aggregateId, 'TodoUpdated', version, eventId);
  }

  getEventData(): Record<string, any> {
    const eventData: Record<string, any> = {
      updatedBy: this.updatedBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };

    if (this.updatedFields.title) {
      eventData.title = this.updatedFields.title;
    }
    if (this.updatedFields.status) {
      eventData.status = this.updatedFields.status;
    }
    if (this.updatedFields.priority) {
      eventData.priority = this.updatedFields.priority;
    }
    if (this.updatedFields.dueDate !== undefined) {
      eventData.dueDate = this.updatedFields.dueDate?.toISOString();
    }
    if (this.updatedFields.tags) {
      eventData.tags = this.updatedFields.tags;
    }

    return eventData;
  }
}