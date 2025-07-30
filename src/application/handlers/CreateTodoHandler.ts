import { CreateTodoCommand } from '../commands/CreateTodoCommand.js';
import { Todo } from '../../domain/aggregates/Todo.js';
import { Priority, PriorityEnum } from '../../domain/value-objects/Priority.js';
import { DueDate } from '../../domain/value-objects/DueDate.js';
import type { TodoRepository } from '../../domain/repositories/TodoRepository.js';
import type { EventPublisher } from '../../infrastructure/events/EventPublisher.js';

export class CreateTodoHandler {
  constructor(
    private readonly todoRepository: TodoRepository,
    private readonly eventPublisher: EventPublisher
  ) {}

  async handle(command: CreateTodoCommand): Promise<Todo> {
    command.validateDueDate();

    const priority = new Priority(command.priority);
    const dueDate = command.dueDate ? new DueDate(command.dueDate) : null;

    const todo = Todo.create(
      command.id,
      command.title,
      command.description,
      command.userId,
      command.todoListId,
      priority,
      dueDate
    );

    await this.todoRepository.save(todo);

    await this.eventPublisher.publishAll(todo.domainEvents);
    todo.markEventsAsCommitted();

    return todo;
  }
}