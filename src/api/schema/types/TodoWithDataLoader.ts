import { builder } from '@/api/schema/builder.js';
import { UserType } from './User.js';
import { TodoListType } from './TodoList.js';
import { TodoType } from './Todo.js';

// Extend the Todo type with DataLoader-optimized fields
builder.prismaObjectField('Todo', 'user', (t) =>
  t.field({
    type: UserType,
    nullable: true,
    resolve: async (todo, args, context) => {
      // Use DataLoader to batch load users
      if (!todo.userId) return null;
      return context.loaders.users.load(todo.userId);
    },
  })
);

builder.prismaObjectField('Todo', 'list', (t) =>
  t.field({
    type: TodoListType,
    nullable: true,
    resolve: async (todo, args, context) => {
      // Use DataLoader to batch load todo lists
      if (!todo.todoListId) return null;
      return context.loaders.todoLists.load(todo.todoListId);
    },
  })
);

// Extend the User type with DataLoader-optimized fields
// Remove the conflicting User.todos field definition
// The User type already has a todos field defined in User.ts with filtering support

builder.prismaObjectField('User', 'todoLists', (t) =>
  t.field({
    type: [TodoListType],
    resolve: async (user, args, context) => {
      // Use DataLoader to batch load user's todo lists
      return context.loaders.userTodoLists.load(user.id);
    },
  })
);

// Extend the TodoList type with DataLoader-optimized fields
builder.prismaObjectField('TodoList', 'todos', (t) =>
  t.field({
    type: [TodoType],
    resolve: async (list, args, context) => {
      // Use DataLoader to batch load list's todos
      return context.loaders.todoListTodos.load(list.id);
    },
  })
);

builder.prismaObjectField('TodoList', 'user', (t) =>
  t.field({
    type: UserType,
    nullable: true,
    resolve: async (list, args, context) => {
      // Use DataLoader to batch load user
      return context.loaders.users.load(list.userId);
    },
  })
);