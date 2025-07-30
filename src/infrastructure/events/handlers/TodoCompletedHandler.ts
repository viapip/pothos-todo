import { TodoCompleted } from '../../../domain/events/TodoCompleted.js';

export class TodoCompletedHandler {
  constructor() {}

  async handle(event: TodoCompleted): Promise<void> {
    console.log(`Todo completed: ${event.aggregateId} at ${event.completedAt}`);
    
    // Here you would typically:
    // 1. Update completion statistics
    // 2. Send completion notifications
    // 3. Update read model projections
    // 4. Trigger any completion-based workflows
    
    console.log('Event data:', event.getEventData());
  }
}