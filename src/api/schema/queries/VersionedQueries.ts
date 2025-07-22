/**
 * Versioned Query Fields
 * Demonstrates API evolution in query layer with backward compatibility
 */

import { builder } from '../builder.js';
import type { VersionedGraphQLContext } from '../../../lib/versioning/types.js';

builder.queryFields((t) => ({
  // ================================
  // Legacy Query (v1) - Deprecated
  // ================================
  
  allTodos: t.field({
    type: ['Todo'],
    deprecationReason: 'Use todos query with pagination instead. This query may timeout with large datasets. Will be removed in v4.',
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      // Track deprecation usage
      if (context.deprecationTracker) {
        context.deprecationTracker.trackUsage('Query.allTodos', 'high');
      }

      const { prisma } = context.container; 
      
      // Add limit for safety, even for deprecated endpoint
      const limit = context.version === 'v1' ? 100 : 50;
      
      return await prisma.todo.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
    },
  }),

  // ================================
  // Current Paginated Query (v2+)
  // ================================
  
  todos: t.field({
    type: ['Todo'],
    args: {
      first: t.arg.int({ 
        description: 'Number of todos to return (default: 10, max: 100)',
        defaultValue: 10 
      }),
      after: t.arg.string({ 
        description: 'Cursor for pagination',
        required: false 
      }),
      status: t.arg.string({
        description: 'Filter by todo status (v2+)',
        required: false,
      }),
      priority: t.arg.string({
        description: 'Filter by priority (v3+)',
        required: false,
      }),
      completed: t.arg.boolean({
        description: 'Deprecated: Use status filter instead. Maps to COMPLETED/TODO status.',
        required: false,
      }),
    },
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      const { prisma } = context.container;
      
      // Handle deprecated completed argument
      const statusFilter: any = {};
      if (args.completed !== undefined && context.deprecationTracker) {
        context.deprecationTracker.trackUsage('Query.todos.completed', 'medium');
        statusFilter.status = args.completed ? 'COMPLETED' : 'TODO';
      } else if (args.status) {
        statusFilter.status = args.status;
      }

      // Version-specific filtering
      const priorityFilter: any = {};
      if (args.priority && context.version !== 'v1') {
        priorityFilter.priority = args.priority;
      }

      // Cursor pagination
      const cursorCondition: any = {};
      if (args.after) {
        cursorCondition.id = { gt: args.after };
      }

      // Limit validation
      const limit = Math.min(args.first || 10, 100);

      const todos = await prisma.todo.findMany({
        where: {
          ...statusFilter,
          ...priorityFilter,
          ...cursorCondition,
        },
        take: limit,
        orderBy: context.version === 'v3' 
          ? [{ priority: 'desc' }, { createdAt: 'desc' }]
          : { createdAt: 'desc' },
      });

      return todos;
    },
  }),

  // ================================
  // User Queries with Version Support
  // ================================
  
  user: t.field({
    type: 'User',
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      const { prisma } = context.container;
      return await prisma.user.findUnique({
        where: { id: args.id },
      });
    },
  }),

  users: t.field({
    type: ['User'],
    args: {
      first: t.arg.int({ defaultValue: 20 }),
      after: t.arg.string({ required: false }),
      search: t.arg.string({ 
        required: false,
        description: 'Search by name or email (v2+)' 
      }),
    },
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      const { prisma } = context.container;
      
      let searchCondition: any = {};
      if (args.search && context.version !== 'v1') {
        searchCondition = {
          OR: [
            { firstName: { contains: args.search, mode: 'insensitive' } },
            { lastName: { contains: args.search, mode: 'insensitive' } },
            { email: { contains: args.search, mode: 'insensitive' } },
          ],
        };
      }

      const cursorCondition: any = {};
      if (args.after) {
        cursorCondition.id = { gt: args.after };
      }

      const limit = Math.min(args.first || 20, 100);

      return await prisma.user.findMany({
        where: {
          ...searchCondition,
          ...cursorCondition,
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
    },
  }),

  // ================================
  // TodoList Queries
  // ================================
  
  todoLists: t.field({
    type: ['TodoList'],
    args: {
      first: t.arg.int({ defaultValue: 10 }),
      after: t.arg.string({ required: false }),
      userId: t.arg.string({ 
        required: false,
        description: 'Filter by owner user ID' 
      }),
    },
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      const { prisma } = context.container;

      const userFilter: any = {};
      if (args.userId) {
        userFilter.userId = args.userId;
      }

      const cursorCondition: any = {};
      if (args.after) {
        cursorCondition.id = { gt: args.after };
      }

      const limit = Math.min(args.first || 10, 100);

      return await prisma.todoList.findMany({
        where: {
          ...userFilter,
          ...cursorCondition,
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
    },
  }),

  todoList: t.field({
    type: 'TodoList',
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      const { prisma } = context.container;
      return await prisma.todoList.findUnique({
        where: { id: args.id },
      });
    },
  }),

  // ================================
  // Version Information Query
  // ================================
  
  apiVersion: t.field({
    type: 'String',
    description: 'Get current API version information',
    resolve: (parent, args, context: VersionedGraphQLContext) => {
      return `Current: ${context.version}, Latest: v3, Supported: v1,v2,v3, Deprecated: v1`;
    },
  }),
}));