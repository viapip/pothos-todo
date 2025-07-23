import DataLoader from 'dataloader';
import type { User, Todo, TodoList } from '@prisma/client';
import prisma from '@/lib/prisma';
import { logger } from '@/logger';

export interface DataLoaders {
  users: DataLoader<string, User | null>;
  todos: DataLoader<string, Todo | null>;
  todoLists: DataLoader<string, TodoList | null>;
  userTodos: DataLoader<string, Todo[]>;
  todoListTodos: DataLoader<string, Todo[]>;
  userTodoLists: DataLoader<string, TodoList[]>;
}

/**
 * Create DataLoaders for efficient batched database queries
 */
export function createDataLoaders(): DataLoaders {
  return {
    // User loader - batch load users by ID
    users: new DataLoader<string, User | null>(async (userIds) => {
      logger.debug('DataLoader: Loading users', { count: userIds.length });
      
      const users = await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
      });

      const userMap = new Map(users.map(user => [user.id, user]));
      return userIds.map(id => userMap.get(id) || null);
    }),

    // Todo loader - batch load todos by ID
    todos: new DataLoader<string, Todo | null>(async (todoIds) => {
      logger.debug('DataLoader: Loading todos', { count: todoIds.length });
      
      const todos = await prisma.todo.findMany({
        where: { id: { in: [...todoIds] } },
      });

      const todoMap = new Map(todos.map(todo => [todo.id, todo]));
      return todoIds.map(id => todoMap.get(id) || null);
    }),

    // TodoList loader - batch load todo lists by ID
    todoLists: new DataLoader<string, TodoList | null>(async (listIds) => {
      logger.debug('DataLoader: Loading todo lists', { count: listIds.length });
      
      const lists = await prisma.todoList.findMany({
        where: { id: { in: [...listIds] } },
      });

      const listMap = new Map(lists.map(list => [list.id, list]));
      return listIds.map(id => listMap.get(id) || null);
    }),

    // User's todos loader - batch load todos by user ID
    userTodos: new DataLoader<string, Todo[]>(async (userIds) => {
      logger.debug('DataLoader: Loading todos by user', { count: userIds.length });
      
      const todos = await prisma.todo.findMany({
        where: { userId: { in: [...userIds] } },
        orderBy: { createdAt: 'desc' },
      });

      const todosByUser = new Map<string, Todo[]>();
      todos.forEach(todo => {
        const userTodos = todosByUser.get(todo.userId) || [];
        userTodos.push(todo);
        todosByUser.set(todo.userId, userTodos);
      });

      return userIds.map(userId => todosByUser.get(userId) || []);
    }),

    // TodoList's todos loader - batch load todos by list ID
    todoListTodos: new DataLoader<string, Todo[]>(async (listIds) => {
      logger.debug('DataLoader: Loading todos by list', { count: listIds.length });
      
      const todos = await prisma.todo.findMany({
        where: { 
          todoListId: { in: [...listIds], not: null },
        },
        orderBy: { createdAt: 'desc' },
      });

      const todosByList = new Map<string, Todo[]>();
      todos.forEach(todo => {
        if (todo.todoListId) {
          const listTodos = todosByList.get(todo.todoListId) || [];
          listTodos.push(todo);
          todosByList.set(todo.todoListId, listTodos);
        }
      });

      return listIds.map(listId => todosByList.get(listId) || []);
    }),

    // User's todo lists loader - batch load lists by user ID
    userTodoLists: new DataLoader<string, TodoList[]>(async (userIds) => {
      logger.debug('DataLoader: Loading todo lists by user', { count: userIds.length });
      
      const lists = await prisma.todoList.findMany({
        where: { userId: { in: [...userIds] } },
        orderBy: { createdAt: 'desc' },
      });

      const listsByUser = new Map<string, TodoList[]>();
      lists.forEach(list => {
        const userLists = listsByUser.get(list.userId) || [];
        userLists.push(list);
        listsByUser.set(list.userId, userLists);
      });

      return userIds.map(userId => listsByUser.get(userId) || []);
    }),
  };
}

/**
 * Clear all DataLoader caches
 */
export function clearDataLoaderCaches(loaders: DataLoaders): void {
  Object.values(loaders).forEach(loader => loader.clearAll());
}

/**
 * Clear specific DataLoader caches by key
 */
export function clearDataLoaderCache(loaders: DataLoaders, type: keyof DataLoaders, key: string): void {
  loaders[type].clear(key);
}