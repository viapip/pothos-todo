import { TodoCreated } from '../../../domain/events/TodoCreated.js';

export class TodoCreatedHandler {
  constructor() { }

  async handle(event: TodoCreated): Promise<void> {
    console.log(`Todo created: ${event.title} (${event.aggregateId})`);

    // Here you would typically:    
    // 1. Update read model projections
    // 2. Send notifications
    // 3. Update search indexes
    // 4. Sync with Qdrant for vector search

    // For now, just log the event
    console.log('Event data:', event.getEventData());
  }
}