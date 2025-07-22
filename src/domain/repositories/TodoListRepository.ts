import type { TodoList } from '../aggregates/TodoList.js';

export interface TodoListRepository {
  findById(id: string): Promise<TodoList | null>;
  findByUserId(userId: string): Promise<TodoList[]>;
  save(todoList: TodoList): Promise<void>;
  delete(id: string): Promise<void>;
}