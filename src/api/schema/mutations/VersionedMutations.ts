/**
 * Versioned Mutation Fields
 * Demonstrates API evolution in mutation layer with input validation and transformation
 */

import { builder } from '../builder.js';
import type { VersionedGraphQLContext } from '../../../lib/versioning/types.js';
import { SubscriptionManager } from '../../../lib/subscriptions/manager.js';

builder.mutationFields((t) => ({
  // ================================
  // Todo Mutations with Version Support
  // ================================
  
  createTodo: t.field({
    type: 'VersionedTodo',
    args: {
      input: t.arg({ type: 'CreateVersionedTodoInput', required: true }),
    },
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      const { prisma } = context.container;
      
      // Version-aware input transformation
      const todoData: any = {
        title: args.input.title,
        description: args.input.description,
        todoListId: args.input.todoListId,
        userId: context.user?.id || 'anonymous-user', // In real app, require auth
      };

      // Handle version-specific field mappings
      if (args.input.completed !== undefined) {
        // v1 compatibility: map boolean to status enum
        if (context.deprecationTracker) {
          context.deprecationTracker.trackUsage('CreateTodoInput.completed', 'high');
        }
        todoData.status = args.input.completed ? 'COMPLETED' : 'TODO';
      } else if (args.input.status) {
        todoData.status = args.input.status;
      } else {
        todoData.status = 'TODO';
      }

      // Version-conditional fields
      if (context.version !== 'v1') {
        if (args.input.priority) {
          todoData.priority = args.input.priority;
        } else {
          todoData.priority = 'MEDIUM';
        }

        if (args.input.dueDate) {
          todoData.dueDate = new Date(args.input.dueDate);
        }
      } else {
        // v1 defaults
        todoData.priority = 'MEDIUM';
      }

      const newTodo = await prisma.todo.create({
        data: todoData,
      });

      // Publish subscription event
      const event = SubscriptionManager.createTodoCreatedEvent(newTodo, context.user?.id);
      const subscriptionManager = new SubscriptionManager();
      subscriptionManager.publish(event);

      return newTodo;
    },
  }),

  updateTodo: t.field({
    type: 'VersionedTodo',
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: 'UpdateVersionedTodoInput', required: true }),
    },
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      const { prisma } = context.container;

      // Version-aware input transformation
      const updateData: any = {};
      
      if (args.input.title) updateData.title = args.input.title;
      if (args.input.description) updateData.description = args.input.description;

      // Handle deprecated completed field
      if (args.input.completed !== undefined) {
        if (context.deprecationTracker) {
          context.deprecationTracker.trackUsage('UpdateTodoInput.completed', 'high');
        }
        updateData.status = args.input.completed ? 'COMPLETED' : 'TODO';
      } else if (args.input.status) {
        updateData.status = args.input.status;
      }

      // Version-conditional fields
      if (context.version !== 'v1') {
        if (args.input.priority) {
          updateData.priority = args.input.priority;
        }
        if (args.input.dueDate) {
          updateData.dueDate = new Date(args.input.dueDate);
        }
      }

      const updatedTodo = await prisma.todo.update({
        where: { id: args.id },
        data: updateData,
      });

      // Publish subscription event
      const event = SubscriptionManager.createTodoUpdatedEvent(updatedTodo, context.user?.id);
      const subscriptionManager = new SubscriptionManager();
      subscriptionManager.publish(event);

      return updatedTodo;
    },
  }),

  deleteTodo: t.field({
    type: 'Boolean',
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      const { prisma } = context.container;

      try {
        const deletedTodo = await prisma.todo.delete({
          where: { id: args.id },
        });

        // Publish subscription event
        const event = SubscriptionManager.createTodoDeletedEvent(
          args.id,
          deletedTodo.todoListId || 'default',
          context.user?.id
        );
        const subscriptionManager = new SubscriptionManager();
        subscriptionManager.publish(event);

        return true;
      } catch (error) {
        return false;
      }
    },
  }),

  // ================================
  // Batch Operations (v2+)
  // ================================
  
  batchUpdateTodos: t.field({
    type: ['VersionedTodo'],
    args: {
      ids: t.arg.stringList({ required: true }),
      input: t.arg({ type: 'UpdateVersionedTodoInput', required: true }),
    },
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      if (context.version === 'v1') {
        throw new Error('Batch operations are not supported in API v1. Please upgrade to v2 or later.');
      }

      const { prisma } = context.container;

      // Version-aware input transformation (same as updateTodo)
      const updateData: any = {};
      
      if (args.input.title) updateData.title = args.input.title;
      if (args.input.description) updateData.description = args.input.description;
      if (args.input.status) updateData.status = args.input.status;
      if (args.input.priority) updateData.priority = args.input.priority;
      if (args.input.dueDate) updateData.dueDate = new Date(args.input.dueDate);

      // Update multiple todos
      const updatedTodos = await prisma.$transaction(
        args.ids.map(id => 
          prisma.todo.update({
            where: { id },
            data: updateData,
          })
        )
      );

      // Publish subscription events
      const subscriptionManager = new SubscriptionManager();
      for (const todo of updatedTodos) {
        const event = SubscriptionManager.createTodoUpdatedEvent(todo, context.user?.id);
        subscriptionManager.publish(event);
      }

      return updatedTodos;
    },
  }),

  // ================================
  // User Mutations with Migration Support
  // ================================
  
  updateUser: t.field({
    type: 'VersionedUser',
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: 'UpdateUserInput', required: true }),
    },
    resolve: async (parent, args, context: VersionedGraphQLContext) => {
      const { prisma } = context.container;

      const updateData: any = {};

      // Handle deprecated name field
      if (args.input.name !== undefined) {
        if (context.deprecationTracker) {
          context.deprecationTracker.trackUsage('UpdateUserInput.name', 'medium');
        }
        
        if (context.version === 'v1') {
          // v1: store as name field
          updateData.name = args.input.name;
        } else {
          // v2+: split name into firstName/lastName
          const nameParts = args.input.name.split(' ');
          updateData.firstName = nameParts[0] || '';
          updateData.lastName = nameParts.slice(1).join(' ') || '';
        }
      } else {
        // v2+ fields
        if (args.input.firstName) updateData.firstName = args.input.firstName;
        if (args.input.lastName) updateData.lastName = args.input.lastName;
      }

      if (args.input.email) updateData.email = args.input.email;

      // Version-conditional fields
      if (context.version !== 'v1' && args.input.profile) {
        updateData.profile = args.input.profile;
      }

      const updatedUser = await prisma.user.update({
        where: { id: args.id },
        data: updateData,
      });

      return updatedUser;
    },
  }),

  // ================================
  // Migration Assistance Mutations
  // ================================
  
  requestMigrationPlan: t.field({
    type: 'MigrationPlan',
    description: 'Get a migration plan to upgrade from current version to target version',
    args: {
      targetVersion: t.arg.string({ 
        required: true,
        description: 'Target API version (v1, v2, or v3)'
      }),
    },
    resolve: (parent, args, context: VersionedGraphQLContext) => {
      const migrationHelper = context.migrationHelper;
      const plan = migrationHelper.getMigrationPlan(
        context.version,
        args.targetVersion as any
      );

      return plan;
    },
  }),

  generateMigratedQuery: t.field({
    type: 'String',
    description: 'Transform a GraphQL query from current version to target version',
    args: {
      query: t.arg.string({ required: true }),
      targetVersion: t.arg.string({ required: true }),
    },
    resolve: (parent, args, context: VersionedGraphQLContext) => {
      const migrationHelper = context.migrationHelper;
      return migrationHelper.generateMigrationQuery(
        args.query,
        context.version,
        args.targetVersion as any
      );
    },
  }),
}));

// ================================
// Input Types for Mutations
// ================================

builder.inputType('UpdateUserInput', {
  fields: (t) => ({
    name: t.string({
      description: 'Deprecated: Use firstName and lastName instead.'
    }),
    firstName: t.string(),
    lastName: t.string(),
    email: t.string(),
    profile: t.string({
      description: 'User profile data (v2+)'
    }),
  }),
});

// ================================
// Migration Plan Type
// ================================

builder.objectType('MigrationPlan', {
  fields: (t) => ({
    fromVersion: t.exposeString('fromVersion'),
    toVersion: t.exposeString('toVersion'),
    estimatedDuration: t.exposeString('estimatedDuration'),
    breakingChanges: t.exposeStringList('breakingChanges'),
    steps: t.field({
      type: ['MigrationStep'],
      resolve: (plan: any) => plan.steps || [],
    }),
    testing: t.field({
      type: 'MigrationTesting',
      resolve: (plan: any) => plan.testing || { required: false, testCases: [], rollbackPlan: [] },
    }),
  }),
});

builder.objectType('MigrationStep', {
  fields: (t) => ({
    id: t.exposeString('id'),
    title: t.exposeString('title'),
    description: t.exposeString('description'),
    category: t.exposeString('category'),
    required: t.exposeBoolean('required'),
    automatable: t.exposeBoolean('automatable'),
    documentation: t.exposeString('documentation'),
  }),
});

builder.objectType('MigrationTesting', {
  fields: (t) => ({
    required: t.exposeBoolean('required'),
    testCases: t.exposeStringList('testCases'),
    rollbackPlan: t.exposeStringList('rollbackPlan'),
  }),
});