import { DomainEvent } from './DomainEvent.js';
import { Priority as PrismaPriority, TodoStatus as PrismaTodoStatus } from '@prisma/client';
import { DueDate } from '../value-objects/DueDate.js';

export class TodoCreated extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly title: string,
    public readonly userId: string,
    public readonly todoListId: string | null,
    public readonly status: PrismaTodoStatus,
    public readonly priority: PrismaPriority | null = null,
    public readonly tags: string[],
    public readonly dueDate: Date,
    public readonly description: string | null,
    public readonly completedAt: Date | null,
    occurredAt: Date,
    createdAt: Date,
    updatedAt: Date,
    version: number,
  ) {
    const eventId = crypto.randomUUID();
    super(
      aggregateId,
      'TodoCreated',
      version,
      eventId,
      occurredAt,
      createdAt,
      updatedAt
    );
  }

  getEventData(): Record<string, any> {
    return {
      title: this.title,
      userId: this.userId,
      todoListId: this.todoListId,
      status: this.status,
      priority: this.priority,
      tags: this.tags,
      dueDate: this.dueDate,
      description: this.description,
      completedAt: this.completedAt?.toISOString() || null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}