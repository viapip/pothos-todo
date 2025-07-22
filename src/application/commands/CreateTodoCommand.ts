// import { Priority } from '../../domain/value-objects/Priority.js';
// import { DueDate } from '../../domain/value-objects/DueDate.js';
import { PriorityEnum } from '../../domain/value-objects/Priority.js';

export class CreateTodoCommand {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly description: string | null,
    public readonly userId: string,
    public readonly todoListId: string | null,
    public readonly priority: PriorityEnum,
    public readonly dueDate: Date | null
  ) {}

  public static create(
    id: string,
    title: string,
    description: string | null,
    userId: string,
    todoListId: string | null = null,
    priority: PriorityEnum = PriorityEnum.MEDIUM,
    dueDate: Date | null = null
  ): CreateTodoCommand {
    if (!title || title.trim().length === 0) {
      throw new Error('Title is required');
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    return new CreateTodoCommand(
      id,
      title.trim(),
      description?.trim() || null,
      userId,
      todoListId,
      priority,
      dueDate
    );
  }

  public validateDueDate(): void {
    if (this.dueDate && this.dueDate <= new Date()) {
      throw new Error('Due date cannot be in the past');
    }
  }
}