import { CompleteTodoCommand } from '../commands/CompleteTodoCommand.js';
import { Todo } from '../../../domain/todos/aggregates/Todo.js';
import type { TodoRepository } from '../../../domain/todos/repositories/TodoRepository.js';
import type { EventPublisher } from '../../../infrastructure/events/core/EventPublisher.js';

export class CompleteTodoHandler {
  constructor(
    private readonly todoRepository: TodoRepository,
    private readonly eventPublisher: EventPublisher
  ) {}

  async handle(command: CompleteTodoCommand): Promise<Todo> {
    const todo = await this.todoRepository.findById(command.id);
    if (!todo) {
      throw new Error('Todo not found');
    }

    if (todo.userId !== command.userId) {
      throw new Error('Unauthorized to complete this todo');
    }

    todo.complete(command.userId);

    await this.todoRepository.save(todo);

    await this.eventPublisher.publishAll(todo.domainEvents);
    todo.markEventsAsCommitted();

    return todo;
  }
}