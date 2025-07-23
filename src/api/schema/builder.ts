import SchemaBuilder, { type SchemaTypes } from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import RelayPlugin from '@pothos/plugin-relay';
import ValidationPlugin from '@pothos/plugin-validation';
import WithInputPlugin from '@pothos/plugin-with-input';
import FederationPlugin from '@pothos/plugin-federation';
import ErrorsPlugin from '@pothos/plugin-errors';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import TracingPlugin from '@pothos/plugin-tracing';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';
import prisma from '@/lib/prisma';
import type { User } from '../../domain/aggregates/User.js';
import type { Container } from '../../infrastructure/container/Container.js';
import type PrismaTypes from '@pothos/plugin-prisma/generated';
import type { SessionWithUser } from '@/lib/auth';
import type { H3Event } from 'h3';
import PrismaUtils from '@pothos/plugin-prisma-utils';
import DirectivesPlugin from '@pothos/plugin-directives';
import type { PerformanceFieldOptions } from './plugins/performance.js';
import type { DataLoaders } from '../dataloaders/index.js';

export interface Context {
  user: User | null;
  container: Container;
  session: SessionWithUser | null;
  h3Event?: H3Event;
  loaders: DataLoaders;
}

// Extend Pothos field options with performance options
declare module '@pothos/core' {
  export interface FieldOptions<Types extends SchemaTypes, ParentShape = unknown, Type = unknown, Nullable = false, Args extends {} = {}, ResolveReturnShape = unknown> {
    performance?: PerformanceFieldOptions;
  }
}

export const builder = new SchemaBuilder<{
  Context: Context;
  PrismaTypes: PrismaTypes;
  Scalars: {
    DateTime: { Input: Date; Output: Date };
    JSON: { Input: any; Output: any };
  };
  // Temporarily removed AuthScopes to disable scopeAuth
  // AuthScopes: {
  //   authenticated: boolean;
  //   admin: boolean;
  // };
}>({
  plugins: [
    PrismaPlugin,
    RelayPlugin,
    ValidationPlugin,
    WithInputPlugin,
    FederationPlugin,
    ErrorsPlugin,
    DataloaderPlugin,
    TracingPlugin,
    ScopeAuthPlugin,
    SimpleObjectsPlugin,
    PrismaUtils,
    DirectivesPlugin,
  ],
  prisma: {
    client: prisma,
    dmmf: undefined,
  },
  validationOptions: {
    // Validation will run for all fields by default
    validationError: (errors, args, context, info) => {
      // Custom error formatting
      return new Error(`Validation failed: ${errors.issues.map(err => err.message).join(', ')}`);
    },
  },
  scopeAuth: {
    authScopes: async (context: Context) => ({
      authenticated: !!context.session?.user,
      admin: context.session?.user?.email === 'admin@example.com',
    }),
  },
  relay: {
    clientMutationId: 'omit',
    cursorType: 'String',
  },
  tracing: {
    default: (config) => {
      // Only trace root fields (Query, Mutation, Subscription) by default
      const isRootType = ['Query', 'Mutation', 'Subscription'].includes(config.parentType);
      return isRootType;
    },
    wrap: (resolver, options, fieldConfig) => {
      // Lazy load tracer to avoid circular dependencies
      const getTracerLazy = () => {
        const { getTracer } = require('@/infrastructure/telemetry/telemetry');
        return getTracer('graphql');
      };

      return async (source, args, context, info) => {
        const tracer = getTracerLazy();
        const spanName = `GraphQL.${info.parentType.name}.${info.fieldName}`;

        const span = tracer.startSpan(spanName, {
          attributes: {
            'graphql.operation.type': info.operation.operation,
            'graphql.operation.name': info.operation.name?.value,
            'graphql.field.name': info.fieldName,
            'graphql.field.type': info.returnType.toString(),
            'graphql.field.path': info.path,
          },
        });

        try {
          const result = await resolver(source, args, context, info);
          span.setStatus({ code: 1 }); // OK
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: 2, // ERROR
            message: (error as Error).message,
          });
          throw error;
        } finally {
          span.end();
        }
      };
    },
  },
});


// Remove scalar definitions - they will be defined in generated inputs.ts
// to avoid conflicts

builder.objectType(Error, {
  name: 'Error',
  fields: (t) => ({
    message: t.exposeString('message'),
  }),
});


export default builder;
export type SchemaBuilder = typeof builder;