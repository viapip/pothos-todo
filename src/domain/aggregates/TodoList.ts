import { AggregateRoot } from './base/AggregateRoot.js';
import { DomainEvent } from '../events/DomainEvent.js';

export class TodoListCreated extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly title: string,
    public readonly description: string | null,
    public readonly userId: string,
    version: number = 1
  ) {
    super(aggregateId, 'TodoListCreated', version);
  }

  getEventData(): Record<string, any> {
    return {
      title: this.title,
      description: this.description,
      userId: this.userId,
    };
  }
}

export class TodoListUpdated extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly title?: string,
    public readonly description?: string | null,
    public readonly updatedBy?: string,
    version: number = 1
  ) {
    super(aggregateId, 'TodoListUpdated', version);
  }

  getEventData(): Record<string, any> {
    return {
      title: this.title,
      description: this.description,
      updatedBy: this.updatedBy,
    };
  }
}

export class TodoListDeleted extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly deletedBy: string,
    version: number = 1
  ) {
    super(aggregateId, 'TodoListDeleted', version);
  }

  getEventData(): Record<string, any> {
    return {
      deletedBy: this.deletedBy,
    };
  }
}

export class TodoList extends AggregateRoot {
  private _title: string;
  private _description: string | null;
  private _userId: string;
  private _createdAt: Date;
  private _updatedAt: Date;

  constructor(
    id: string,
    title: string,
    description: string | null,
    userId: string,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date()
  ) {
    super(id);
    this._title = title;
    this._description = description;
    this._userId = userId;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  public static create(
    id: string,
    title: string,
    description: string | null,
    userId: string
  ): TodoList {
    const todoList = new TodoList(id, title, description, userId);

    todoList.addDomainEvent(
      new TodoListCreated(
        id,
        title,
        description,
        userId,
        todoList.version
      )
    );

    return todoList;
  }

  get title(): string {
    return this._title;
  }

  get description(): string | null {
    return this._description;
  }

  get userId(): string {
    return this._userId;
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
    updatedBy?: string
  ): void {
    let hasChanges = false;

    if (title && title !== this._title) {
      this._title = title;
      hasChanges = true;
    }

    if (description !== undefined && description !== this._description) {
      this._description = description;
      hasChanges = true;
    }

    if (hasChanges) {
      this._updatedAt = new Date();
      this.addDomainEvent(
        new TodoListUpdated(
          this.id,
          title,
          description,
          updatedBy || this._userId,
          this.version
        )
      );
    }
  }

  public delete(deletedBy: string): void {
    this.addDomainEvent(
      new TodoListDeleted(
        this.id,
        deletedBy,
        this.version
      )
    );
  }
}