import type { PrismaClient } from '@prisma/client';
import type { EventStore, StoredEvent } from './EventStore.js';
import type { DomainEvent } from '../../domain/events/DomainEvent.js';

export class PrismaEventStore implements EventStore {
  constructor(private readonly prisma: PrismaClient) {}

  async append(event: DomainEvent): Promise<void> {
    await this.prisma.domainEvent.create({
      data: {
        id: event.eventId,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        eventData: event.getEventData(),
        version: event.version,
        createdAt: event.occurredAt,
      },
    });
  }

  async appendAll(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    const eventData = events.map(event => ({
      id: event.eventId,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      eventData: event.getEventData(),
      version: event.version,
      createdAt: event.occurredAt,
    }));

    await this.prisma.domainEvent.createMany({
      data: eventData,
    });
  }

  async getEvents(aggregateId: string): Promise<StoredEvent[]> {
    const events = await this.prisma.domainEvent.findMany({
      where: { aggregateId },
      orderBy: { version: 'asc' },
    });

    return events.map(this.mapToStoredEvent);
  }

  async getEventsFromVersion(aggregateId: string, fromVersion: number): Promise<StoredEvent[]> {
    const events = await this.prisma.domainEvent.findMany({
      where: {
        aggregateId,
        version: { gte: fromVersion },
      },
      orderBy: { version: 'asc' },
    });

    return events.map(this.mapToStoredEvent);
  }

  async getAllEvents(): Promise<StoredEvent[]> {
    const events = await this.prisma.domainEvent.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return events.map(this.mapToStoredEvent);
  }

  async getEventsByType(eventType: string): Promise<StoredEvent[]> {
    const events = await this.prisma.domainEvent.findMany({
      where: { eventType },
      orderBy: { createdAt: 'asc' },
    });

    return events.map(this.mapToStoredEvent);
  }

  private mapToStoredEvent(event: any): StoredEvent {
    return {
      id: event.id,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      eventData: event.eventData,
      version: event.version,
      createdAt: event.createdAt,
    };
  }
}