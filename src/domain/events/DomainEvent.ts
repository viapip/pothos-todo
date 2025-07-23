export interface Metadata extends Record<string, unknown> {
  title: string;
  assigneeIds: string[];
  requiresNotification: boolean;
}

export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly aggregateType?: string;
  public readonly eventType: string;
  public readonly userId: string;
  public readonly occurredAt: Date;
  public readonly version: number;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly metadata: Metadata;
  public readonly position?: number;
  public readonly payload?: Record<string, unknown>;
  public readonly recordedAt?: Date;
  constructor(
    aggregateId: string,
    eventType: string,
    version: number = 1,
    eventId: string = crypto.randomUUID(),
    userId: string = '',
    occurredAt: Date = new Date(),
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    metadata: Metadata = {
      title: '',
      assigneeIds: [],
      requiresNotification: false
    }
  ) {
    this.eventId = eventId;
    this.aggregateId = aggregateId;
    this.eventType = eventType;
    this.userId = userId;
    this.occurredAt = occurredAt;
    this.version = version;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.metadata = metadata;
  }

  abstract getEventData(): Record<string, unknown>;
}