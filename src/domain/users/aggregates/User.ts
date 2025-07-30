import { AggregateRoot } from '../../shared/base/AggregateRoot.js';
import { DomainEvent } from '../../shared/events/DomainEvent.js';

export class UserCreated extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly email: string,
    public readonly name: string | null,
    version: number = 1
  ) {
    super(aggregateId, 'UserCreated', version);
  }

  getEventData(): Record<string, any> {
    return {
      email: this.email,
      name: this.name,
    };
  }
}

export class UserUpdated extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly email?: string,
    public readonly name?: string | null,
    version: number = 1
  ) {
    super(aggregateId, 'UserUpdated', version);
  }

  getEventData(): Record<string, any> {
    return {
      email: this.email,
      name: this.name,
    };
  }
}

export class User extends AggregateRoot {
  private _email: string;
  private _name: string | null;
  private _createdAt: Date;
  private _updatedAt: Date;

  constructor(
    id: string,
    email: string,
    name: string | null,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date()
  ) {
    super(id);
    this._email = email;
    this._name = name;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  public static create(
    id: string,
    email: string,
    name: string | null = null
  ): User {
    const user = new User(id, email, name);

    user.addDomainEvent(
      new UserCreated(
        id,
        email,
        name,
        user.version
      )
    );

    return user;
  }

  get email(): string {
    return this._email;
  }

  get name(): string | null {
    return this._name;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  public update(
    email?: string,
    name?: string | null
  ): void {
    let hasChanges = false;

    if (email && email !== this._email) {
      this._email = email;
      hasChanges = true;
    }

    if (name !== undefined && name !== this._name) {
      this._name = name;
      hasChanges = true;
    }

    if (hasChanges) {
      this._updatedAt = new Date();
      this.addDomainEvent(
        new UserUpdated(
          this.id,
          email,
          name,
          this.version
        )
      );
    }
  }

  public isValidEmail(): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(this._email);
  }
}