/**
 * Test data factories using Faker
 */

import { faker } from '@faker-js/faker';
import type { User, Todo, TodoList } from '@prisma/client';
import { getTestDatabase } from './database.js';

export interface CreateUserData {
  email?: string;
  name?: string;
  password?: string;
  googleId?: string;
  githubId?: string;
}

export interface CreateTodoListData {
  title?: string;
  description?: string;
  userId?: string;
}

export interface CreateTodoData {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate?: Date;
  todoListId?: string;
  userId?: string;
}

/**
 * Create a test user
 */
export async function createTestUser(data: CreateUserData = {}): Promise<User> {
  const prisma = getTestDatabase();
  
  return await prisma.user.create({
    data: {
      email: data.email || faker.internet.email(),
      name: data.name || faker.person.fullName(),
      password: data.password || null,
      googleId: data.googleId || null,
      githubId: data.githubId || null,
    }
  });
}

/**
 * Create a test todo list
 */
export async function createTestTodoList(data: CreateTodoListData = {}): Promise<TodoList> {
  const prisma = getTestDatabase();
  
  let userId = data.userId;
  if (!userId) {
    const user = await createTestUser();
    userId = user.id;
  }
  
  return await prisma.todoList.create({
    data: {
      title: data.title || faker.lorem.words(3),
      description: data.description || faker.lorem.sentence(),
      userId
    }
  });
}

/**
 * Create a test todo
 */
export async function createTestTodo(data: CreateTodoData = {}): Promise<Todo> {
  const prisma = getTestDatabase();
  
  let todoListId = data.todoListId;
  let userId = data.userId;
  
  if (!todoListId) {
    const todoList = await createTestTodoList({ userId });
    todoListId = todoList.id;
    userId = todoList.userId;
  } else if (!userId) {
    const user = await createTestUser();
    userId = user.id;
  }
  
  return await prisma.todo.create({
    data: {
      title: data.title || faker.lorem.words(2),
      description: data.description || faker.lorem.sentence(),
      completedAt: data.completed ? new Date() : null,
      priority: data.priority || faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH']),
      dueDate: data.dueDate || (faker.datatype.boolean() ? faker.date.future() : null),
      todoListId,
      userId
    }
  });
}

/**
 * Create multiple test users
 */
export async function createTestUsers(count: number, data: CreateUserData = {}): Promise<User[]> {
  return await Promise.all(
    Array.from({ length: count }, () => createTestUser(data))
  );
}

/**
 * Create realistic test data set
 */
export async function createTestDataSet(): Promise<{
  users: User[];
  todoLists: TodoList[];
  todos: Todo[];
}> {
  const users = await createTestUsers(3);
  
  const todoLists = await Promise.all(
    users.flatMap(user => [
      createTestTodoList({ userId: user.id, title: 'Work Tasks' }),
      createTestTodoList({ userId: user.id, title: 'Personal' }),
    ])
  );
  
  const todos = await Promise.all(
    todoLists.flatMap(todoList => [
      createTestTodo({ 
        todoListId: todoList.id, 
        title: 'Complete project',
        priority: 'HIGH'
      }),
      createTestTodo({ 
        todoListId: todoList.id, 
        title: 'Review code',
        completed: true
      }),
      createTestTodo({ 
        todoListId: todoList.id, 
        title: 'Write documentation'
      }),
    ])
  );
  
  return { users, todoLists, todos };
}