import type { JsonObject } from "@prisma/client/runtime/library";
import { nanoid } from 'nanoid';

export interface Metadata extends Partial<Record<string, unknown>> {
  title?: string;
  userId?: string;
  assigneeIds?: string[];
  requiresNotification?: boolean;
}

export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly aggregateType?: string;
  public readonly eventType: string;
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
    eventId: string = nanoid(),
    metadata: Metadata = {
      title: '',
      userId: '',
      assigneeIds: [],
      requiresNotification: false
    },
    occurredAt: Date = new Date(),
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
  ) {
    this.eventId = eventId;
    this.aggregateId = aggregateId;
    this.eventType = eventType;
    this.occurredAt = occurredAt;
    this.version = version;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.metadata = metadata;
  }

  abstract getEventData(): JsonObject;
}