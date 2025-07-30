import { Todo } from '../aggregates/Todo.js';

export interface TodoRepository {
  findById(id: string): Promise<Todo | null>;
  findByUserId(userId: string): Promise<Todo[]>;
  findByTodoListId(todoListId: string): Promise<Todo[]>;
  save(todo: Todo): Promise<void>;
  delete(id: string): Promise<void>;
}