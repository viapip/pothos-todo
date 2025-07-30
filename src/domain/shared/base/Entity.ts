import { DomainEvent } from '../events/DomainEvent.js';

export abstract class Entity<T = string> {
  protected _id: T;
  private _domainEvents: DomainEvent[] = [];

  constructor(id: T) {
    this._id = id;
  }

  get id(): T {
    return this._id;
  }

  get domainEvents(): DomainEvent[] {
    return this._domainEvents;
  }

  public clearEvents(): void {
    this._domainEvents = [];
  }

  protected addDomainEvent(domainEvent: DomainEvent): void {
    this._domainEvents.push(domainEvent);
  }

  public equals(other: Entity<T>): boolean {
    if (!(other instanceof Entity)) return false;
    return this._id === other._id;
  }
}