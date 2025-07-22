import type { PrismaClient, Todo as PrismaTodo } from '@prisma/client';
import type { TodoRepository } from '../../domain/repositories/TodoRepository.js';
import { Todo } from '../../domain/aggregates/Todo.js';
import { TodoStatus, type TodoStatusEnum } from '../../domain/value-objects/TodoStatus.js';
import { Priority, type PriorityEnum } from '../../domain/value-objects/Priority.js';
import { DueDate } from '../../domain/value-objects/DueDate.js';

export class PrismaTodoRepository implements TodoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Todo | null> {
    const todoData = await this.prisma.todo.findUnique({
      where: { id },
    });

    if (!todoData) return null;

    return this.mapToDomainEntity(todoData);
  }

  async findByUserId(userId: string): Promise<Todo[]> {
    const todosData = await this.prisma.todo.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return todosData.map(this.mapToDomainEntity);
  }

  async findByTodoListId(todoListId: string): Promise<Todo[]> {
    const todosData = await this.prisma.todo.findMany({
      where: { todoListId },
      orderBy: { createdAt: 'desc' },
    });

    return todosData.map(this.mapToDomainEntity);
  }

  async save(todo: Todo): Promise<void> {
    const data = {
      title: todo.title,
      description: todo.description,
      status: todo.status.value,
      priority: todo.priority.value,
      dueDate: todo.dueDate?.value || null,
      completedAt: todo.completedAt,
      userId: todo.userId,
      todoListId: todo.todoListId,
    };

    await this.prisma.todo.upsert({
      where: { id: todo.id },
      update: data,
      create: {
        id: todo.id,
        ...data,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.todo.delete({
      where: { id },
    });
  }

  private mapToDomainEntity(todoData: PrismaTodo): Todo {
    const status = new TodoStatus(todoData.status as TodoStatusEnum);
    const priority = new Priority(todoData.priority as PriorityEnum);
    const dueDate = todoData.dueDate ? new DueDate(todoData.dueDate) : null;

    return new Todo(
      todoData.id,
      todoData.title,
      todoData.description,
      todoData.userId,
      todoData.todoListId,
      status,
      priority,
      dueDate,
      todoData.completedAt,
      todoData.createdAt,
      todoData.updatedAt
    );
  }
}