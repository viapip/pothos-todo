import { PrismaClient, type TodoList as PrismaTodoList } from '@prisma/client';
import type { TodoListRepository } from '../../../domain/todos/repositories/TodoListRepository.js';
import { TodoList } from '../../../domain/todos/aggregates/TodoList.js';

export class PrismaTodoListRepository implements TodoListRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<TodoList | null> {
    const todoListData = await this.prisma.todoList.findUnique({
      where: { id },
    });

    if (!todoListData) return null;

    return this.mapToDomainEntity(todoListData);
  }

  async findByUserId(userId: string): Promise<TodoList[]> {
    const todoListsData = await this.prisma.todoList.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return todoListsData.map(this.mapToDomainEntity);
  }

  async save(todoList: TodoList): Promise<void> {
    const data = {
      title: todoList.title,
      description: todoList.description,
      userId: todoList.userId,
    };

    await this.prisma.todoList.upsert({
      where: { id: todoList.id },
      update: data,
      create: {
        id: todoList.id,
        ...data,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.todoList.delete({
      where: { id },
    });
  }

  private mapToDomainEntity(todoListData: PrismaTodoList): TodoList {
    return new TodoList(
      todoListData.id,
      todoListData.title,
      todoListData.description,
      todoListData.userId,
      todoListData.createdAt,
      todoListData.updatedAt
    );
  }
}