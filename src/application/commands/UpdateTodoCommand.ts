import type { PriorityEnum } from '../../domain/value-objects/Priority.js';

export class UpdateTodoCommand {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly title?: string,
    public readonly description?: string | null,
    public readonly priority?: PriorityEnum,
    public readonly dueDate?: Date | null,
    public readonly todoListId?: string | null
  ) {}

  public static create(
    id: string,
    userId: string,
    updates: {
      title?: string;
      description?: string | null;
      priority?: PriorityEnum;
      dueDate?: Date | null;
      todoListId?: string | null;
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
      updates.description?.trim(),
      updates.priority,
      updates.dueDate,
      updates.todoListId
    );
  }

  public validateDueDate(): void {
    if (this.dueDate && this.dueDate <= new Date()) {
      throw new Error('Due date cannot be in the past');
    }
  }

  public hasChanges(): boolean {
    return !!(
      this.title !== undefined ||
      this.description !== undefined ||
      this.priority !== undefined ||
      this.dueDate !== undefined ||
      this.todoListId !== undefined
    );
  }
}