import { DomainEvent } from './DomainEvent.js';
import { TodoStatus } from '../value-objects/TodoStatus.js';
import { Priority } from '../value-objects/Priority.js';

export class TodoUpdated extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly updatedFields: {
      title?: string;
      description?: string | null;
      status?: TodoStatus;
      priority?: Priority;
      dueDate?: Date | null;
    },
    public readonly updatedBy: string,
    version: number = 1
  ) {
    super(aggregateId, 'TodoUpdated', version);
  }

  getEventData(): Record<string, any> {
    const eventData: Record<string, any> = {
      updatedBy: this.updatedBy,
    };

    if (this.updatedFields.title) {
      eventData.title = this.updatedFields.title;
    }
    if (this.updatedFields.description !== undefined) {
      eventData.description = this.updatedFields.description;
    }
    if (this.updatedFields.status) {
      eventData.status = this.updatedFields.status.value;
    }
    if (this.updatedFields.priority) {
      eventData.priority = this.updatedFields.priority.value;
    }
    if (this.updatedFields.dueDate !== undefined) {
      eventData.dueDate = this.updatedFields.dueDate?.toISOString();
    }

    return eventData;
  }
}