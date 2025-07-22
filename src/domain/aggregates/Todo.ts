import { AggregateRoot } from './base/AggregateRoot.js';
import { TodoStatus } from '../value-objects/TodoStatus.js';
import { Priority } from '../value-objects/Priority.js';
import type { DueDate } from '../value-objects/DueDate.js';
import { TodoCreated } from '../events/TodoCreated.js';
import { TodoCompleted } from '../events/TodoCompleted.js';
import { TodoDeleted } from '../events/TodoDeleted.js';
import { TodoAssigned } from '../events/TodoAssigned.js';
import { TodoUpdated } from '../events/TodoUpdated.js';

export class Todo extends AggregateRoot {
  private _title: string;
  private _description: string | null;
  private _status: TodoStatus;
  private _priority: Priority;
  private _dueDate: DueDate | null;
  private _completedAt: Date | null;
  private _userId: string;
  private _todoListId: string | null;
  private _createdAt: Date;
  private _updatedAt: Date;

  constructor(
    id: string,
    title: string,
    description: string | null,
    userId: string,
    todoListId: string | null = null,
    status: TodoStatus = TodoStatus.pending(),
    priority: Priority = Priority.medium(),
    dueDate: DueDate | null = null,
    completedAt: Date | null = null,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date()
  ) {
    super(id);
    this._title = title;
    this._description = description;
    this._status = status;
    this._priority = priority;
    this._dueDate = dueDate;
    this._completedAt = completedAt;
    this._userId = userId;
    this._todoListId = todoListId;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  public static create(
    id: string,
    title: string,
    description: string | null,
    userId: string,
    todoListId: string | null = null,
    priority: Priority = Priority.medium(),
    dueDate: DueDate | null = null
  ): Todo {
    const todo = new Todo(
      id,
      title,
      description,
      userId,
      todoListId,
      TodoStatus.pending(),
      priority,
      dueDate
    );

    todo.addDomainEvent(
      new TodoCreated(
        id,
        title,
        description,
        userId,
        todoListId,
        todo._status,
        priority,
        dueDate?.value || null,
        todo.version
      )
    );

    return todo;
  }

  get title(): string {
    return this._title;
  }

  get description(): string | null {
    return this._description;
  }

  get status(): TodoStatus {
    return this._status;
  }

  get priority(): Priority {
    return this._priority;
  }

  get dueDate(): DueDate | null {
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

  public update(
    title?: string,
    description?: string | null,
    priority?: Priority,
    dueDate?: DueDate | null,
    updatedBy?: string
  ): void {
    const updatedFields: Record<string, any> = {};
    let hasChanges = false;

    if (title && title !== this._title) {
      this._title = title;
      updatedFields.title = title;
      hasChanges = true;
    }

    if (description !== undefined && description !== this._description) {
      this._description = description;
      updatedFields.description = description;
      hasChanges = true;
    }

    if (priority && !priority.equals(this._priority)) {
      this._priority = priority;
      updatedFields.priority = priority;
      hasChanges = true;
    }

    if (dueDate !== undefined && (!dueDate || !this._dueDate || !dueDate.equals(this._dueDate))) {
      this._dueDate = dueDate;
      updatedFields.dueDate = dueDate?.value || null;
      hasChanges = true;
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

  public complete(userId: string): void {
    if (this._status.isCompleted()) {
      throw new Error('Todo is already completed');
    }

    if (!this._status.canTransitionTo(TodoStatus.completed())) {
      throw new Error(`Cannot complete todo from ${this._status.value} status`);
    }

    this._status = TodoStatus.completed();
    this._completedAt = new Date();
    this._updatedAt = new Date();

    this.addDomainEvent(
      new TodoCompleted(
        this.id,
        this._completedAt,
        userId,
        this.version
      )
    );
  }

  public cancel(): void {
    if (this._status.isCompleted()) {
      throw new Error('Cannot cancel completed todo');
    }

    if (!this._status.canTransitionTo(TodoStatus.cancelled())) {
      throw new Error(`Cannot cancel todo from ${this._status.value} status`);
    }

    this._status = TodoStatus.cancelled();
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
    return this._dueDate ? this._dueDate.isOverdue() : false;
  }

  public isDueToday(): boolean {
    return this._dueDate ? this._dueDate.isDueToday() : false;
  }

  public isDueSoon(daysThreshold: number = 3): boolean {
    return this._dueDate ? this._dueDate.isDueSoon(daysThreshold) : false;
  }
}