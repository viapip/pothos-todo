
import { Priority as PrismaPriority } from '@prisma/client';
import { TodoStatus as PrismaTodoStatus } from '@prisma/client';
import { DueDate } from '../../domain/value-objects/DueDate.js';

export class UpdateTodoCommand {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly title?: string,
    public readonly priority?: PrismaPriority,
    public readonly dueDate?: DueDate,
    public readonly todoListId?: string | null,
    public readonly status?: PrismaTodoStatus,
    public readonly tags?: string[],
    public readonly description?: string | null,
    public readonly completedAt?: Date | null,
    public readonly updatedBy?: string,
  ) { }

  public static create(
    id: string,
    userId: string,
    updates: {
      title?: string;
      priority?: PrismaPriority | null;
      dueDate?: Date;
      todoListId?: string | null;
      tags?: string[];
      status?: PrismaTodoStatus | null;
      description?: string | null;
      completedAt?: Date | null;
      updatedBy?: string;
    }
  ): UpdateTodoCommand {
    if (!id) {
      throw new Error('Todo ID is required');
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    if (updates.title !== undefined && (!updates.title || updates.title.trim().length === 0)) {
      throw new Error('Title cannot be empty');
    }

    return new UpdateTodoCommand(
      id,
      userId,
      updates.title?.trim(),
      updates.priority ?? undefined,
      updates.dueDate ? new DueDate(updates.dueDate) : undefined,
      updates.todoListId,
      updates.status ?? undefined,
      updates.tags ?? undefined,
      updates.description ?? undefined,
      updates.completedAt ?? undefined,
      updates.updatedBy ?? undefined,
    );
  }

  public validateDueDate(): void {
    if (this.dueDate && this.dueDate.value <= new Date()) {
      throw new Error('Due date cannot be in the past');
    }
  }

  public hasChanges(): boolean {
    return !!(
      this.title !== undefined ||
      this.priority !== undefined ||
      this.dueDate !== undefined ||
      this.todoListId !== undefined ||
      this.status !== undefined ||
      this.description !== undefined ||
      this.completedAt !== undefined ||
      this.updatedBy !== undefined
    );
  }
}