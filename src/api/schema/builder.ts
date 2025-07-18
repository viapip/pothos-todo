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
import { PrismaClient } from '@prisma/client';
import type { User } from '../../domain/aggregates/User.js';
import type { Container } from '../../infrastructure/container/Container.js';

export interface Context {
  prisma: PrismaClient;
  user: User | null;
  container: Container;
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
    client: new PrismaClient(),
    dmmf: undefined,
  },
  scopeAuth: {
    authScopes: async (context: Context) => ({
      authenticated: !!context.user,
      admin: context.user?.email === 'admin@example.com',
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

type PrismaTypes = {
  User: {
    Name: 'User';
    Shape: {
      id: string;
      email: string;
      name: string | null;
      createdAt: Date;
      updatedAt: Date;
    };
    Include: any;
    Select: any;
    Where: any;
    Create: any;
    Update: any;
    OrderBy: any;
    ListRelations: 'todos' | 'todoLists';
    Relations: {
      todos: {
        Shape: {
          id: string;
          title: string;
          description: string | null;
          status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
          priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
          dueDate: Date | null;
          completedAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
          userId: string;
          todoListId: string | null;
        };
        Types: {
          Where: any;
          OrderBy: any;
          Create: any;
          Update: any;
        };
      };
      todoLists: {
        Shape: {
          id: string;
          title: string;
          description: string | null;
          createdAt: Date;
          updatedAt: Date;
          userId: string;
        };
        Types: {
          Where: any;
          OrderBy: any;
          Create: any;
          Update: any;
        };
      };
    };
  };
  Todo: {
    Name: 'Todo';
    Shape: {
      id: string;
      title: string;
      description: string | null;
      status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      dueDate: Date | null;
      completedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      userId: string;
      todoListId: string | null;
    };
    Include: any;
    Select: any;
    Where: any;
    Create: any;
    Update: any;
    OrderBy: any;
    ListRelations: never;
    Relations: {
      user: {
        Shape: {
          id: string;
          email: string;
          name: string | null;
          createdAt: Date;
          updatedAt: Date;
        };
        Types: {
          Where: any;
          OrderBy: any;
          Create: any;
          Update: any;
        };
      };
      todoList: {
        Shape: {
          id: string;
          title: string;
          description: string | null;
          createdAt: Date;
          updatedAt: Date;
          userId: string;
        } | null;
        Types: {
          Where: any;
          OrderBy: any;
          Create: any;
          Update: any;
        };
      };
    };
  };
  TodoList: {
    Name: 'TodoList';
    Shape: {
      id: string;
      title: string;
      description: string | null;
      createdAt: Date;
      updatedAt: Date;
      userId: string;
    };
    Include: any;
    Select: any;
    Where: any;
    Create: any;
    Update: any;
    OrderBy: any;
    ListRelations: 'todos';
    Relations: {
      user: {
        Shape: {
          id: string;
          email: string;
          name: string | null;
          createdAt: Date;
          updatedAt: Date;
        };
        Types: {
          Where: any;
          OrderBy: any;
          Create: any;
          Update: any;
        };
      };
      todos: {
        Shape: {
          id: string;
          title: string;
          description: string | null;
          status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
          priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
          dueDate: Date | null;
          completedAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
          userId: string;
          todoListId: string | null;
        };
        Types: {
          Where: any;
          OrderBy: any;
          Create: any;
          Update: any;
        };
      };
    };
  };
};

builder.scalarType('DateTime', {
  serialize: (date: unknown) => (date as Date).toISOString(),
  parseValue: (date: unknown) => new Date(date as string),
});

builder.scalarType('JSON', {
  serialize: (value: unknown) => value,
  parseValue: (value: unknown) => value,
});

builder.objectType(Error, {
  name: 'Error',
  fields: (t) => ({
    message: t.exposeString('message'),
  }),
});

export default builder;