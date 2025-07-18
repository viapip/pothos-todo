export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly eventType: string;
  public readonly occurredAt: Date;
  public readonly version: number;

  constructor(
    aggregateId: string,
    eventType: string,
    version: number = 1,
    eventId: string = crypto.randomUUID(),
    occurredAt: Date = new Date()
  ) {
    this.eventId = eventId;
    this.aggregateId = aggregateId;
    this.eventType = eventType;
    this.occurredAt = occurredAt;
    this.version = version;
  }

  abstract getEventData(): Record<string, any>;
}