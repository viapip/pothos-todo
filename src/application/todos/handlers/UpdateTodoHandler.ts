import { UpdateTodoCommand } from '../commands/UpdateTodoCommand.js';
import { Todo } from '../../../domain/todos/aggregates/Todo.js';
import { Priority } from '../../../domain/todos/value-objects/Priority.js';
import { DueDate } from '../../../domain/todos/value-objects/DueDate.js';
import type { TodoRepository } from '../../../domain/todos/repositories/TodoRepository.js';
import type { EventPublisher } from '../../../infrastructure/events/core/EventPublisher.js';

export class UpdateTodoHandler {
  constructor(
    private readonly todoRepository: TodoRepository,
    private readonly eventPublisher: EventPublisher
  ) {}

  async handle(command: UpdateTodoCommand): Promise<Todo> {
    if (!command.hasChanges()) {
      throw new Error('No changes provided');
    }

    command.validateDueDate();

    const todo = await this.todoRepository.findById(command.id);
    if (!todo) {
      throw new Error('Todo not found');
    }

    if (todo.userId !== command.userId) {
      throw new Error('Unauthorized to update this todo');
    }

    const priority = command.priority ? new Priority(command.priority) : undefined;
    const dueDate = command.dueDate !== undefined 
      ? (command.dueDate ? new DueDate(command.dueDate) : null)
      : undefined;

    todo.update(
      command.title,
      command.description,
      priority,
      dueDate,
      command.userId
    );

    await this.todoRepository.save(todo);

    await this.eventPublisher.publishAll(todo.domainEvents);
    todo.markEventsAsCommitted();

    return todo;
  }
}