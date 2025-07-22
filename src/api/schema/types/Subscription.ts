/**
 * GraphQL Subscription Types
 * Real-time subscriptions for todos, todo lists, and user presence
 */

import { builder } from '../builder.js';
import { subscriptionManager } from '../../../lib/subscriptions/manager.js';
import type { Context } from '../builder.js';
import { TodoType } from './Todo.js';
import { TodoListType } from './TodoList.js';
import { UserType } from './User.js';

// Event payload types
interface TodoEventPayloadShape {
  todo: any; // Replace 'any' with the actual type if available
  action: string;
  userId?: string;
  timestamp: Date;
}

interface TodoListEventPayloadShape {
  todoList: any; // Replace 'any' with the actual type if available
  action: string;
  userId?: string;
  timestamp: Date;
}

interface UserPresencePayloadShape {
  userId: string;
  isOnline: boolean;
  timestamp: Date;
}


class TodoEventPayloadClass {
  public readonly name: string = 'TodoEventPayload';
  public readonly todo: any = null; // Changed from typeof TodoType = TodoType
  public readonly todoList: any = null; // Changed from typeof TodoListType = TodoListType
  public readonly action: string = '';
  public readonly userId: string | null = null;
  public readonly timestamp: Date = new Date();
  public readonly resolve = (payload: TodoEventPayloadShape) => payload;
}

class TodoListEventPayloadClass {
  public readonly name: string = 'TodoListEventPayload';
  public readonly todoList: any = null; // Changed from typeof TodoListType = TodoListType
  public readonly action: string = '';
  public readonly userId: string | null = null;
  public readonly timestamp: Date = new Date();
  public readonly resolve = (payload: TodoListEventPayloadShape) => payload;
  }

  
  class UserPresencePayloadClass {
    public readonly name: string = 'UserPresencePayload';
    public readonly userId: string = '';
    public readonly isOnline: boolean = false;
    public readonly timestamp: Date = new Date();
    public readonly resolve = (payload: UserPresencePayloadShape) => payload;
  }



      const TodoEventPayload = builder.objectType(TodoEventPayloadClass, {
  name: 'TodoEventPayload',
  fields: (t) => ({ 
    todo: t.field({ type: TodoType, resolve: (payload) => payload.todo, nullable: true, description: 'The todo item that was created, updated, or deleted' }),
    todoList: t.field({ type: TodoListType, resolve: (payload) => payload.todoList, nullable: true, description: 'The todo list that was created, updated, or deleted' }),
    action: t.string({ resolve: (payload) => payload.action, description: 'The action that was performed on the todo item or todo list' }),
    userId: t.string({ nullable: true, resolve: (payload) => payload.userId, description: 'The user ID of the user who performed the action' }),
    timestamp: t.field({ type: 'DateTime', resolve: (payload) => payload.timestamp, description: 'The timestamp of the event' }),
  }),
});

const TodoListEventPayload = builder.objectType(TodoListEventPayloadClass, {
  name: 'TodoListEventPayload',
  fields: (t) => ({
    todoList: t.field({ type: TodoListType, resolve: (payload) => payload.todoList, nullable: true, description: 'The todo list that was created, updated, or deleted' }),
            action: t.string({ resolve: (payload) => payload.action, description: 'The action that was performed on the todo list' }),
    userId: t.string({ nullable: true, resolve: (payload) => payload.userId, description: 'The user ID of the user who performed the action' }),
    timestamp: t.field({ type: 'DateTime', resolve: (payload) => payload.timestamp, description: 'The timestamp of the event' }),
  }),
});

const UserPresencePayload = builder.objectType(UserPresencePayloadClass, {
  name: 'UserPresencePayload',
  fields: (t) => ({
        userId: t.string({ resolve: (payload) => payload.userId, description: 'The user ID of the user who is online or offline' }),
    isOnline: t.boolean({ resolve: (payload) => payload.isOnline, description: 'Whether the user is online or offline' }),
    timestamp: t.field({ type: 'DateTime', resolve: (payload) => payload.timestamp }),
  }),
});

// Subscription root type
builder.subscriptionType({
  fields: (t) => ({
    // Todo-related subscriptions
    todoUpdates: t.field({
      type: TodoEventPayload,
      args: {
        todoListId: t.arg.string({ required: true }),
      },
      authScopes: { authenticated: true },
      subscribe: async (root, args, context: Context) => {
        const { todoListId } = args;
        const userId = context.user?.id;

        if (!userId) {
          throw new Error('Authentication required for subscriptions');
        }

        // Verify user has access to this todo list
        // This would typically check permissions, but for now we'll trust the auth
        const topic = `todo-list:${todoListId}`;
        
        return {
          [Symbol.asyncIterator](): AsyncIterator<TodoEventPayloadShape> {
            const subscriptionId = `todo-${userId}-${Date.now()}`;
            let isActive = true;
            
            // Subscribe to the topic
            subscriptionManager.subscribe(subscriptionId, topic, userId);

            const eventQueue: TodoEventPayloadShape[] = [];
            let resolveNext: ((value: IteratorResult<TodoEventPayloadShape>) => void) | null = null;

            // Event handler
            // IMPORTANT: event.payload must be the actual todo object, not a type reference
            const handleEvent = (event: any) => {
              const payload = {
                todo: event.payload, // event.payload should be the actual todo object
                todoList: null, // Only set if you have a todoList object
                action: event.type,
                userId: event.userId,
                timestamp: event.timestamp,
              };

              if (resolveNext) {
                resolveNext({ value: payload, done: false });
                resolveNext = null;
              } else {
                eventQueue.push(payload);
              }
            };

            // Listen for events
            subscriptionManager.on(topic, handleEvent);
            subscriptionManager.on(`${topic}:TODO_CREATED`, handleEvent);
            subscriptionManager.on(`${topic}:TODO_UPDATED`, handleEvent);
            subscriptionManager.on(`${topic}:TODO_DELETED`, handleEvent);

            return {
              async next(): Promise<IteratorResult<TodoEventPayloadShape>> {
                if (!isActive) {
                  return { done: true, value: undefined as any };
                }

                if (eventQueue.length > 0) {
                  // The eventQueue is not empty, so eventQueue.shift() will not be undefined
                  return { value: eventQueue.shift() as TodoEventPayloadShape, done: false };
                }

                return new Promise<IteratorResult<TodoEventPayloadShape>>((resolve) => {
                  resolveNext = resolve;
                });
              },

              async return(): Promise<IteratorResult<TodoEventPayloadShape>> {
                isActive = false;
                
                // Clean up subscription
                subscriptionManager.unsubscribe(subscriptionId, topic, userId);
                subscriptionManager.off(topic, handleEvent);
                subscriptionManager.off(`${topic}:TODO_CREATED`, handleEvent);
                subscriptionManager.off(`${topic}:TODO_UPDATED`, handleEvent);
                subscriptionManager.off(`${topic}:TODO_DELETED`, handleEvent);

                return { done: true, value: undefined };
              },

              async throw(error?: any): Promise<IteratorResult<TodoEventPayloadShape>> {
                isActive = false;
                throw error;
              },
            };
          },
        };
      },
      resolve: (payload) => Object.assign(new TodoEventPayloadClass(), payload),
    }),

    // Todo list subscriptions
    todoListUpdates: t.field({
      type: TodoListEventPayload,
      args: {
        todoListId: t.arg.string({ required: true }),
      },
      authScopes: { authenticated: true },
      subscribe: async (root, args, context: Context) => {
        const { todoListId } = args;
        const userId = context.user?.id;

        if (!userId) {
          throw new Error('Authentication required for subscriptions');
        }

        const topic = `todo-list:${todoListId}`;
        
        return {
          [Symbol.asyncIterator](): AsyncIterator<TodoListEventPayloadShape> {
            const subscriptionId = `todolist-${userId}-${Date.now()}`;
            let isActive = true;
            
            subscriptionManager.subscribe(subscriptionId, topic, userId);

            const eventQueue: TodoListEventPayloadShape[] = [];
            let resolveNext: ((value: IteratorResult<TodoListEventPayloadShape>) => void) | null = null;

            // Event handler
            // IMPORTANT: event.payload must be the actual todoList object, not a type reference
            const handleEvent = (event: any) => {
              const payload = {
                todoList: event.payload, // event.payload should be the actual todoList object
                action: event.type,
                userId: event.userId,
                timestamp: event.timestamp,
              };

              if (resolveNext) {
                resolveNext({ value: payload, done: false });
                resolveNext = null;
              } else {
                eventQueue.push(payload);
              }
            };

            subscriptionManager.on(`${topic}:TODO_LIST_UPDATED`, handleEvent);

            return {
              async next(): Promise<IteratorResult<TodoListEventPayloadShape>> {
                if (!isActive) {
                  return { done: true, value: undefined as any };
                }

                if (eventQueue.length > 0) {
                  return { value: eventQueue.shift() as TodoListEventPayloadShape, done: false };
                }

                return new Promise<IteratorResult<TodoListEventPayloadShape>>((resolve) => {
                  resolveNext = resolve;
                });
              },

                async return(): Promise<IteratorResult<TodoListEventPayloadShape>> {
                isActive = false;
                subscriptionManager.unsubscribe(subscriptionId, topic, userId);
                subscriptionManager.off(`${topic}:TODO_LIST_UPDATED`, handleEvent);
                return { done: true, value: undefined };
              },

              async throw(error?: any): Promise<IteratorResult<TodoListEventPayloadShape>> {
                isActive = false;
                throw error;
              },
            };
          },
        };
      },  
      resolve: (payload) => Object.assign(new TodoListEventPayloadClass(), payload),
    }),

    // User presence subscription
    userPresence: t.field({
      type: UserPresencePayload,
      authScopes: { authenticated: true },
      subscribe: async (root, args, context: Context) => {
        const userId = context.user?.id;

        if (!userId) {
          throw new Error('Authentication required for subscriptions');
        }

        const topic = 'user-presence';
        
        return {
          [Symbol.asyncIterator](): AsyncIterator<UserPresencePayloadShape> {
            const subscriptionId = `presence-${userId}-${Date.now()}`;
            let isActive = true;
            
            subscriptionManager.subscribe(subscriptionId, topic, userId);

            const eventQueue: UserPresencePayloadShape[] = [];
            let resolveNext: ((value: IteratorResult<UserPresencePayloadShape>) => void) | null = null;

            const handleEvent = (event: any) => {
              const payload = {
                userId: event.payload.userId,
                isOnline: event.payload.isOnline,
                timestamp: event.timestamp,
              };

              if (resolveNext) {
                resolveNext({ value: payload, done: false });
                resolveNext = null;
              } else {
                eventQueue.push(payload);
              }
            };

            subscriptionManager.on(`${topic}:USER_ONLINE_STATUS`, handleEvent);

            return {
              async next(): Promise<IteratorResult<UserPresencePayloadShape>> {
                if (!isActive) {
                  return { done: true, value: undefined as any };
                }

                if (eventQueue.length > 0) {
                  return { value: eventQueue.shift() as UserPresencePayloadShape, done: false };
                }

                return new Promise<IteratorResult<UserPresencePayloadShape>>((resolve) => {
                  resolveNext = resolve;
                });
              },

              async return(): Promise<IteratorResult<UserPresencePayloadShape>> {
                isActive = false;
                subscriptionManager.unsubscribe(subscriptionId, topic, userId);
                subscriptionManager.off(`${topic}:USER_ONLINE_STATUS`, handleEvent);
                return { done: true, value: undefined };
              },

                    async throw(error?: any): Promise<IteratorResult<UserPresencePayloadShape>> {
                isActive = false;
                throw error;
              },
            };
          },
        };
      },
      resolve: (payload) => Object.assign(new UserPresencePayloadClass(), payload),
    }),
  }),
});

export { TodoEventPayload, TodoListEventPayload, UserPresencePayload };