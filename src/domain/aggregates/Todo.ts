import { AggregateRoot } from './base/AggregateRoot.js';
import { TodoCreated } from '../events/TodoCreated.js';
import { TodoCompleted } from '../events/TodoCompleted.js';
import { TodoDeleted } from '../events/TodoDeleted.js';
import { TodoAssigned } from '../events/TodoAssigned.js';
import { TodoUpdated } from '../events/TodoUpdated.js';
import { Priority as PrismaPriority, TodoStatus as PrismaTodoStatus } from '@prisma/client';

export class Todo extends AggregateRoot {
  private _title: string;
  private _status: PrismaTodoStatus;
  private _priority: PrismaPriority;
  private _dueDate: Date | null;
  private _description: string | null;
  private _completedAt: Date | null;
  private _userId: string;
  private _todoListId: string | null;
  private _createdAt: Date;
  private _updatedAt: Date;
  private _tags: string[];

  constructor(
    id: string,
    title: string,
    userId: string,
    todoListId: string | null,
    status: PrismaTodoStatus = PrismaTodoStatus.PENDING,
    priority: PrismaPriority = PrismaPriority.MEDIUM,
    dueDate: Date | null = null,
    description: string | null = null,
    tags: string[] = [],
    completedAt: Date | null = null,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
  ) {
    super(id);
    this._title = title;
    this._status = status;
    this._priority = priority;
    this._dueDate = dueDate;
    this._completedAt = completedAt;
    this._userId = userId;
    this._todoListId = todoListId;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
    this._description = description;
    this._tags = tags;
  }

  public static create(
    id: string,
    title: string,
    userId: string,
    todoListId: string | null = null,
    priority: PrismaPriority = PrismaPriority.MEDIUM,
    dueDate: Date,
    description: string | null = null,
    tags: string[] = [],
    status: PrismaTodoStatus = PrismaTodoStatus.PENDING,
    completedAt: Date | null = null,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
  ): Todo {
    const todo = new Todo(
      id,
      title,
      userId,
      todoListId,
      status,
      priority,
      dueDate,
      description,
      tags,
      completedAt,
      createdAt,
      updatedAt,
    );

    todo.addDomainEvent(
      new TodoCreated(
        id,
        title,
        userId,
        todoListId,
        status,
        priority,
        tags,
        dueDate,
        description,
        completedAt,
        new Date(),
        createdAt,
        updatedAt,
        1,
      )
    );

    return todo;
  }

  get title(): string {
    return this._title;
  }

  get status(): PrismaTodoStatus {
    return this._status;
  }

  get priority(): PrismaPriority {
    return this._priority;
  }

  get dueDate(): Date | null {
    return this._dueDate;
  }

  get completedAt(): Date | null {
    return this._completedAt;
  }

  get userId(): string {
    return this._userId;
  }

  get todoListId(): string | null {
    return this._todoListId;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get description(): string | null {
    return this._description;
  }

  get tags(): string[] {
    return this._tags;
  }

  public update(
    title?: string,
    priority: PrismaPriority = PrismaPriority.MEDIUM,
    dueDate?: Date,
    description?: string | null,
    tags?: string[],
    status?: PrismaTodoStatus,
    completedAt?: Date | null,
    updatedBy?: string,
  ): void {
    const updatedFields: Record<string, any> = {};
    let hasChanges = false;

    if (title && title !== this._title) {
      this._title = title;
      updatedFields.title = title;
      hasChanges = true;
    }

    if (priority && priority !== this._priority) {
      this._priority = priority;
      updatedFields.priority = priority;
      hasChanges = true;
    }

    if (status && status !== this._status) {
      this._status = status;
      updatedFields.status = status;
      hasChanges = true;
    }

    if (dueDate !== undefined && (!dueDate || !this._dueDate || this._dueDate !== dueDate)) {
      this._dueDate = dueDate;
      updatedFields.dueDate = dueDate;
      hasChanges = true;
    }

    if (tags && tags !== this._tags) {
      this._tags = tags;
      updatedFields.tags = tags;
      hasChanges = true;
    }

    if (description && description !== this._description) {
      this._description = description;
      updatedFields.description = description;
      hasChanges = true;
    }

    if (completedAt && completedAt !== this._completedAt) {
      this._completedAt = completedAt;
      updatedFields.completedAt = completedAt;
      hasChanges = true;
    }

    if (updatedBy && updatedBy !== this._userId) {
      this._userId = updatedBy;
      updatedFields.updatedBy = updatedBy;
      hasChanges = true;
    } else if (updatedBy) {
      updatedFields.updatedBy = updatedBy;
    }

    if (hasChanges) {
      this._updatedAt = new Date();
      this.addDomainEvent(
        new TodoUpdated(
          this.id,
          updatedFields,
          updatedBy || this._userId,
          this.version
        )
      );
    }
  }

  public complete(userId: string, completedAt: Date | null = null): void {
    if (this._status === PrismaTodoStatus.COMPLETED) {
      throw new Error('Todo is already completed');
    }

    if (this._status !== PrismaTodoStatus.PENDING) {
      throw new Error(`Cannot complete todo from ${this._status} status`);
    }

    this._status = PrismaTodoStatus.COMPLETED;
    this._completedAt = completedAt || new Date();
    this._updatedAt = new Date();

    this.addDomainEvent(
      new TodoCompleted(
        this.id,
        completedAt || new Date(),
        userId,
        this.version
      )
    );
  }

  public cancel(): void {
    if (this._status === PrismaTodoStatus.COMPLETED) {
      throw new Error('Cannot cancel completed todo');
    }

    if (this._status !== PrismaTodoStatus.PENDING) {
      throw new Error(`Cannot cancel todo from ${this._status} status`);
    }

    this._status = PrismaTodoStatus.CANCELLED;
    this._updatedAt = new Date();

    this.addDomainEvent(
      new TodoUpdated(
        this.id,
        { status: this._status },
        this._userId,
        this.version
      )
    );
  }

  public assignToList(todoListId: string | null, assignedBy: string): void {
    if (this._todoListId === todoListId) {
      return;
    }

    this._todoListId = todoListId;
    this._updatedAt = new Date();

    this.addDomainEvent(
      new TodoAssigned(
        this.id,
        this._userId,
        assignedBy,
        todoListId,
        this._tags,
        this.version
      )
    );
  }

  public delete(deletedBy: string): void {
    this.addDomainEvent(
      new TodoDeleted(
        this.id,
        deletedBy,
        this.version
      )
    );
  }

  public isOverdue(): boolean {
    return this._dueDate ? new Date(this._dueDate) < new Date() : false;
  }

  public isDueToday(): boolean {
    return this._dueDate ? new Date(this._dueDate).getDate() === new Date().getDate() && new Date(this._dueDate).getMonth() === new Date().getMonth() && new Date(this._dueDate).getFullYear() === new Date().getFullYear() : false;
  }

  public isDueSoon(daysThreshold: number = 3): boolean {
    return this._dueDate ? new Date(this._dueDate).getDate() + daysThreshold >= new Date().getDate() && new Date(this._dueDate).getMonth() === new Date().getMonth() && new Date(this._dueDate).getFullYear() === new Date().getFullYear() : false;
  }
}