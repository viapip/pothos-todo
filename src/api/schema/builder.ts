import SchemaBuilder from '@pothos/core';
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

export interface Context {
  user: User | null;
  container: Container;
  session: SessionWithUser | null;
  h3Event?: H3Event
}

export const builder = new SchemaBuilder<{
  Context: Context;
  PrismaTypes: PrismaTypes;
  Scalars: {
    DateTime: { Input: Date; Output: Date };
    JSON: { Input: any; Output: any };
  };
  AuthScopes: {
    authenticated: boolean;
    admin: boolean;
  };
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
  ],
  prisma: {
    client: prisma,
    dmmf: undefined,
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
    default: (config) => true,
    wrap: (resolver, options) => resolver,
  },
});


// builder.scalarType('DateTime', {
//   serialize: (date: unknown) => (date as Date).toISOString(),
//   parseValue: (date: unknown) => new Date(date as string),
// });

// builder.scalarType('JSON', {
//   serialize: (value: unknown) => value,
//   parseValue: (value: unknown) => value,
// });

builder.objectType(Error, {
  name: 'Error',
  fields: (t) => ({
    message: t.exposeString('message'),
  }),
});

export default builder;