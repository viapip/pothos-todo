import { CreateTodoCommand } from '../commands/CreateTodoCommand.js';
import { Todo } from '../../domain/aggregates/Todo.js';
import type { TodoRepository } from '../../domain/repositories/TodoRepository.js';
import type { EventPublisher } from '../../infrastructure/events/EventPublisher.js';

export class CreateTodoHandler {
  constructor(
    private readonly todoRepository: TodoRepository,
    private readonly eventPublisher: EventPublisher
  ) { }

  async handle(command: CreateTodoCommand): Promise<Todo> {
    CreateTodoCommand.validateDueDate(command.dueDate);

    const todo = Todo.create(
      command.id,
      command.title,
      command.userId,
      command.todoListId,
      command.priority,
      command.dueDate,
      command.description,
      command.tags,
      command.status,
      command.completedAt,
      command.createdAt,
      command.updatedAt,
    );

    await this.todoRepository.save(todo);

    await this.eventPublisher.publishAll(todo.domainEvents);
    todo.markEventsAsCommitted();

    return todo;
  }
}