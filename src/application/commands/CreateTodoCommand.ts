import { Priority as PrismaPriority, TodoStatus as PrismaTodoStatus } from '@prisma/client';
import { DueDate } from '../../domain/value-objects/DueDate.js';



export class CreateTodoCommand {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly userId: string,
    public readonly todoListId: string | null = null,
    public readonly priority: PrismaPriority = PrismaPriority.MEDIUM,
    public readonly dueDate: DueDate,
    public readonly tags: string[] = [],
    public readonly description: string | null = null,
    public readonly status: PrismaTodoStatus = PrismaTodoStatus.PENDING,
    public readonly completedAt: Date | null = null,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date(),
    public readonly version: number = 1,
  ) { }

  public static create(
    id: string,
    title: string,
    userId: string,
    todoListId: string | null = null,
    priority: PrismaPriority = PrismaPriority.MEDIUM,
    dueDate: Date,
    tags: string[] = [],
    description: string | null = null,
    status: PrismaTodoStatus = PrismaTodoStatus.PENDING,
    completedAt: Date | null = null,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    version: number = 1,
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
      userId,
      todoListId,
      priority,
      new DueDate(dueDate),
      tags,
      description,
      status,
      completedAt,
      createdAt,
      updatedAt,
      version,
    );
  }

  public static validateDueDate(dueDate: DueDate): void {
    if (dueDate && dueDate.value < new Date()) {
      throw new Error('Due date cannot be in the past');
    }
  }
}