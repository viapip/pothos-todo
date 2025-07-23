import { Entity } from './Entity.js';

export abstract class AggregateRoot<T = string> extends Entity<T> {
  private _version: number = 0;

  constructor(id: T) {
    super(id);
  }

  get version(): number {
    return this._version;
  }

  protected incrementVersion(): void {
    this._version++;
  }

  public markEventsAsCommitted(): void {
    this.clearEvents();
    this.incrementVersion();
  }

  public getUncommittedEvents() {
    return this.domainEvents;
  }
}