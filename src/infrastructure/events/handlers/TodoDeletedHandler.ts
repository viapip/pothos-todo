import { TodoDeleted } from '../../../domain/events/TodoDeleted.js';

export class TodoDeletedHandler {
    constructor() { }

    async handle(event: TodoDeleted): Promise<void> {
        console.log(`Todo deleted: ${event.aggregateId}`);
    }
}       