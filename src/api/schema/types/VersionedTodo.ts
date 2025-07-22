/**
 * Versioned Todo Types
 * Demonstrates API evolution and backward compatibility
 */

import { builder } from '../builder.js';
import { deprecatedField } from '../../../lib/versioning/plugin.js';
import type { VersionedGraphQLContext } from '../../../lib/versioning/types.js';

// ================================
// Versioned Todo Type
// ================================

export const VersionedTodo = builder.objectType('VersionedTodo', {
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true }),
    
    // Current fields (v3)
    status: t.field({
      type: 'String',
      resolve: (todo: any, args, context: VersionedGraphQLContext) => {
        // Map internal status to appropriate version
        if (context.version === 'v1') {
          // v1 clients expect boolean completed field
          return todo.status === 'COMPLETED' ? 'true' : 'false';
        }
        return todo.status || 'TODO';
      },
    }),
    
    priority: t.field({
      type: 'String',
      resolve: (todo: any, args, context: VersionedGraphQLContext) => {
        if (context.version === 'v1') {
          // v1 didn't have priority, default to MEDIUM
          return 'MEDIUM';
        }
        return todo.priority || 'MEDIUM';
      },
    }),
    
    // Deprecated field (v1 compatibility)
    completed: t.field({
      type: 'Boolean',
      deprecationReason: 'Use status field instead. This field maps true/false to COMPLETED/TODO status values. Will be removed in v4.',
      resolve: (todo: any, args, context: VersionedGraphQLContext) => {
        // Track deprecation usage
        if (context.deprecationTracker) {
          context.deprecationTracker.trackUsage('Todo.completed', 'high');
        }
        
        // Convert status to boolean for backward compatibility
        return todo.status === 'COMPLETED';
      },
    }),

    // Version-aware fields
    createdAt: t.field({
      type: 'String', // DateTime scalar would be better
      resolve: (todo: any, args, context: VersionedGraphQLContext) => {
        if (context.version === 'v1') {
          // v1 format: simple ISO string
          return todo.createdAt?.toISOString();
        }
        // v2+ format: ISO string with timezone
        return todo.createdAt?.toISOString();
      },
    }),

    updatedAt: t.field({
      type: 'String',
      resolve: (todo: any, args, context: VersionedGraphQLContext) => {
        return todo.updatedAt?.toISOString();
      },
    }),

    dueDate: t.field({
      type: 'String',
      nullable: true,
      resolve: (todo: any, args, context: VersionedGraphQLContext) => {
        if (context.version === 'v1') {
          // v1 didn't have due dates
          return null;
        }
        return todo.dueDate?.toISOString();
      },
    }),

    // Relationship fields with version-aware loading
    user: t.field({
      type: 'VersionedUser',
      resolve: async (todo: any, args, context: VersionedGraphQLContext) => {
        // Load user with version-appropriate fields
        const { prisma } = context.container;
        return await prisma.user.findUnique({
          where: { id: todo.userId },
        });
      },
    }),

    todoList: t.field({
      type: 'VersionedTodoList',
      nullable: true,
      resolve: async (todo: any, args, context: VersionedGraphQLContext) => {
        if (!todo.todoListId) return null;
        
        const { prisma } = context.container;
        return await prisma.todoList.findUnique({
          where: { id: todo.todoListId },
        });
      },
    }),
  }),
});

// ================================
// Versioned User Type
// ================================

export const VersionedUser = builder.objectType('VersionedUser', {
  fields: (t) => ({
    id: t.exposeID('id'),
    
    // Current fields (v2+)
    firstName: t.field({
      type: 'String',
      nullable: true,
      resolve: (user: any, args, context: VersionedGraphQLContext) => {
        if (context.version === 'v1') {
          // v1 had single name field, try to split
          const fullName = user.name || user.firstName || '';
          return fullName.split(' ')[0] || fullName;
        }
        return user.firstName;
      },
    }),

    lastName: t.field({
      type: 'String',
      nullable: true,
      resolve: (user: any, args, context: VersionedGraphQLContext) => {
        if (context.version === 'v1') {
          // v1 had single name field, try to split
          const fullName = user.name || user.lastName || '';
          const parts = fullName.split(' ');
          return parts.length > 1 ? parts.slice(1).join(' ') : '';
        }
        return user.lastName;
      },
    }),

    // Deprecated field (v1 compatibility)
    name: t.field({
      type: 'String',
      deprecationReason: 'Use firstName and lastName fields instead. Will be removed in v4.',
      resolve: (user: any, args, context: VersionedGraphQLContext) => {
        // Track deprecation usage
        if (context.deprecationTracker) {
          context.deprecationTracker.trackUsage('User.name', 'medium');
        }

        if (context.version === 'v1') {
          // v1 compatibility: return stored name or construct from parts
          return user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim();
        }

        // v2+ construct from firstName/lastName
        return `${user.firstName || ''} ${user.lastName || ''}`.trim();
      },
    }),

    email: t.exposeString('email'),
    
    createdAt: t.field({
      type: 'String',
      resolve: (user: any) => user.createdAt?.toISOString(),
    }),

    // Version-specific features
    profile: t.field({
      type: 'String', // Would be a proper Profile type in real app
      nullable: true,
      resolve: (user: any, args, context: VersionedGraphQLContext) => {
        if (context.version === 'v1') {
          // v1 didn't have profiles
          return null;
        }
        return user.profile;
      },
    }),

    todos: t.field({
      type: ['VersionedTodo'],
      resolve: async (user: any, args, context: VersionedGraphQLContext) => {
        const { prisma } = context.container;
        return await prisma.todo.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),
  }),
});

// ================================
// Versioned TodoList Type
// ================================

export const VersionedTodoList = builder.objectType('VersionedTodoList', {
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true }),

    // Version-aware todo loading
    todos: t.field({
      type: ['VersionedTodo'],
      resolve: async (todoList: any, args, context: VersionedGraphQLContext) => {
        const { prisma } = context.container;
        
        let orderBy: any = { createdAt: 'desc' };
        if (context.version === 'v3') {
          // v3 supports priority ordering
          orderBy = [
            { priority: 'desc' },
            { createdAt: 'desc' }
          ];
        }

        return await prisma.todo.findMany({
          where: { todoListId: todoList.id },
          orderBy,
        });
      },
    }),

    owner: t.field({
      type: 'VersionedUser',
      resolve: async (todoList: any, args, context: VersionedGraphQLContext) => {
        const { prisma } = context.container;
        return await prisma.user.findUnique({
          where: { id: todoList.userId },
        });
      },
    }),

    createdAt: t.field({
      type: 'String',
      resolve: (todoList: any) => todoList.createdAt?.toISOString(),
    }),

    updatedAt: t.field({
      type: 'String',
      resolve: (todoList: any) => todoList.updatedAt?.toISOString(),
    }),
  }),
});

// ================================
// Version-Aware Input Types
// ================================

builder.inputType('CreateVersionedTodoInput', {
  fields: (t) => ({
    title: t.string({ required: true }),
    description: t.string(),
    
    // Version-conditional fields
    status: t.string({
      required: false,
      description: 'Todo status (v2+). For v1 compatibility, use completed field.',
    }),
    
    completed: t.boolean({
      required: false,
      description: 'Deprecated: Use status field instead. Maps to COMPLETED/TODO status values.',
    }),

    priority: t.string({
      required: false,
      description: 'Todo priority (v2+). Defaults to MEDIUM for v1 clients.',
    }),

    dueDate: t.string({
      required: false,
      description: 'Due date ISO string (v2+). Ignored in v1.',
    }),

    todoListId: t.string(),
  }),
});

builder.inputType('UpdateVersionedTodoInput', {
  fields: (t) => ({
    title: t.string(),
    description: t.string(),
    status: t.string(),
    completed: t.boolean({ 
      description: 'Deprecated: Use status field instead.' 
    }),
    priority: t.string(),
    dueDate: t.string(),
  }),
});