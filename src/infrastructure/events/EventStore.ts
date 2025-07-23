import { DomainEvent } from '../../domain/events/DomainEvent.js';

export interface StoredEvent {
  id: string;
  eventType: string;
  aggregateId: string;
  eventData: Record<string, unknown>;
  version: number;
  createdAt: Date;
}

export interface EventStore {
  append(event: DomainEvent): Promise<void>;
  appendAll(events: DomainEvent[]): Promise<void>;
  getEvents(aggregateId: string, fromVersion?: number, limit?: number): Promise<DomainEvent[]>;
  getEventsFromVersion(aggregateId: string, fromVersion: number): Promise<StoredEvent[]>;
  getAllEvents(): Promise<StoredEvent[]>;
  getEventsByType(eventType: string): Promise<StoredEvent[]>;
  getEventsAfterPosition(position: number, limit: number): Promise<DomainEvent[]>;
  getEventsByTimeRange(start: Date, end: Date): Promise<DomainEvent[]>;
}