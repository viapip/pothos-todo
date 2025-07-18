import { DomainEvent } from './DomainEvent.js';
import { TodoStatus } from '../value-objects/TodoStatus.js';
import { Priority } from '../value-objects/Priority.js';

export class TodoCreated extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly title: string,
    public readonly description: string | null,
    public readonly userId: string,
    public readonly todoListId: string | null,
    public readonly status: TodoStatus,
    public readonly priority: Priority,
    public readonly dueDate: Date | null,
    version: number = 1
  ) {
    super(aggregateId, 'TodoCreated', version);
  }

  getEventData(): Record<string, any> {
    return {
      title: this.title,
      description: this.description,
      userId: this.userId,
      todoListId: this.todoListId,
      status: this.status.value,
      priority: this.priority.value,
      dueDate: this.dueDate?.toISOString(),
    };
  }
}