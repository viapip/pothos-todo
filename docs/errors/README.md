# @pothos/plugin-errors

Плагин Errors для Pothos предоставляет удобный способ обработки ошибок в GraphQL, позволяя возвращать ошибки как часть ответа вместо выбрасывания исключений.

## Установка

```bash
bun add @pothos/plugin-errors
```

## Конфигурация

```typescript
import SchemaBuilder from '@pothos/core';
import ErrorsPlugin from '@pothos/plugin-errors';

const builder = new SchemaBuilder({
  plugins: [ErrorsPlugin],
  errors: {
    defaultTypes: [], // Типы ошибок по умолчанию для всех полей
  },
});
```

## Основные концепции

### Определение типов ошибок

```typescript
// Базовый тип ошибки
builder.objectType(Error, {
  name: 'BaseError',
  fields: (t) => ({
    message: t.exposeString('message'),
  }),
});

// Кастомные типы ошибок
class ValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
  }
}

builder.objectType(ValidationError, {
  name: 'ValidationError',
  interfaces: [BaseError],
  fields: (t) => ({
    message: t.exposeString('message'),
    field: t.exposeString('field'),
  }),
});

class NotFoundError extends Error {
  constructor(public resource: string, public id: string) {
    super(`${resource} with id ${id} not found`);
  }
}

builder.objectType(NotFoundError, {
  name: 'NotFoundError',
  interfaces: [BaseError],
  fields: (t) => ({
    message: t.exposeString('message'),
    resource: t.exposeString('resource'),
    id: t.exposeString('id'),
  }),
});
```

### Использование в полях

```typescript
builder.queryType({
  fields: (t) => ({
    user: t.field({
      type: User,
      errors: {
        types: [NotFoundError, ValidationError],
      },
      args: {
        id: t.arg.id({ required: true }),
      },
      resolve: async (_, { id }) => {
        if (!isValidId(id)) {
          throw new ValidationError('Invalid ID format', 'id');
        }
        
        const user = await getUserById(id);
        
        if (!user) {
          throw new NotFoundError('User', id);
        }
        
        return user;
      },
    }),
  }),
});
```

### Результат с ошибками

GraphQL схема автоматически создает union тип:

```graphql
type Query {
  user(id: ID!): UserResult!
}

union UserResult = User | NotFoundError | ValidationError

type User {
  id: ID!
  name: String!
}

type NotFoundError {
  message: String!
  resource: String!
  id: String!
}

type ValidationError {
  message: String!
  field: String!
}
```

## Интеграция с Zod

```typescript
import { ZodError } from 'zod';

// Утилита для преобразования Zod ошибок
function flattenErrors(
  error: ZodFormattedError<unknown>,
  path: string[],
): { path: string[]; message: string }[] {
  const errors = error._errors.map((message) => ({
    path,
    message,
  }));

  Object.keys(error).forEach((key) => {
    if (key !== '_errors') {
      errors.push(
        ...flattenErrors(
          (error as Record<string, unknown>)[key] as ZodFormattedError<unknown>,
          [...path, key],
        ),
      );
    }
  });

  return errors;
}

// Типы для Zod ошибок
const ZodFieldError = builder
  .objectRef<{
    message: string;
    path: string[];
  }>('ZodFieldError')
  .implement({
    fields: (t) => ({
      message: t.exposeString('message'),
      path: t.exposeStringList('path'),
    }),
  });

builder.objectType(ZodError, {
  name: 'ZodValidationError',
  interfaces: [BaseError],
  fields: (t) => ({
    fieldErrors: t.field({
      type: [ZodFieldError],
      resolve: (err) => flattenErrors(err.format(), []),
    }),
  }),
});
```

### Использование с валидацией

```typescript
builder.mutationType({
  fields: (t) => ({
    createUser: t.field({
      type: User,
      errors: {
        types: [ZodError, Error],
      },
      args: {
        input: t.arg({
          type: CreateUserInput,
          required: true,
        }),
      },
      resolve: async (_, { input }) => {
        // Валидация будет выбрасывать ZodError автоматически
        const validatedInput = createUserSchema.parse(input);
        
        return createUser(validatedInput);
      },
    }),
  }),
});
```

## Продвинутые возможности

### Общие типы ошибок

```typescript
const builder = new SchemaBuilder({
  plugins: [ErrorsPlugin],
  errors: {
    defaultTypes: [Error], // Все поля могут возвращать Error
  },
});

// Теперь не нужно указывать Error в каждом поле
builder.queryField('example', (t) =>
  t.field({
    type: 'String',
    // errors.types автоматически включает Error
    resolve: () => {
      if (Math.random() > 0.5) {
        throw new Error('Random error');
      }
      return 'Success';
    },
  }),
);
```

### Директивные ошибки

```typescript
// Создаем директиву для ошибок
const DirectiveError = builder.objectRef<{
  message: string;
  path: string[];
}>('DirectiveError').implement({
  fields: (t) => ({
    message: t.exposeString('message'),
    path: t.field({
      type: ['String'],
      resolve: (error) => error.path,
    }),
  }),
});

// Используем в поле
builder.queryField('protectedData', (t) =>
  t.field({
    type: 'String',
    errors: {
      types: [DirectiveError],
      directResult: {
        name: 'ProtectedDataResult',
      },
    },
    resolve: (_, __, ctx) => {
      if (!ctx.user) {
        throw new DirectiveError({
          message: 'Authentication required',
          path: ['protectedData'],
        });
      }
      return 'Secret data';
    },
  }),
);
```

### Обработка nullable полей

```typescript
builder.queryField('optionalUser', (t) =>
  t.field({
    type: User,
    nullable: true,
    errors: {
      types: [NotFoundError],
    },
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_, { id }) => {
      const user = await getUserById(id);
      
      if (!user) {
        // Можем вернуть null или выбросить ошибку
        if (shouldReturnNull) {
          return null;
        }
        throw new NotFoundError('User', id);
      }
      
      return user;
    },
  }),
);
```

## Клиентская обработка

```typescript
// GraphQL запрос
const USER_QUERY = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      __typename
      ... on User {
        id
        name
        email
      }
      ... on NotFoundError {
        message
        resource
        id
      }
      ... on ValidationError {
        message
        field
      }
    }
  }
`;

// Обработка на клиенте
const { data } = await client.query({
  query: USER_QUERY,
  variables: { id: '123' },
});

switch (data.user.__typename) {
  case 'User':
    console.log('User found:', data.user.name);
    break;
  case 'NotFoundError':
    console.error('User not found:', data.user.message);
    break;
  case 'ValidationError':
    console.error('Validation error:', data.user.field, data.user.message);
    break;
}
```

## Лучшие практики

1. **Используйте типизированные ошибки** вместо общих Error
2. **Группируйте связанные ошибки** в интерфейсы
3. **Документируйте возможные ошибки** в описаниях полей
4. **Используйте consistent naming** для типов ошибок
5. **Обрабатывайте ошибки на клиенте** явно

## Полный пример

```typescript
import SchemaBuilder from '@pothos/core';
import ErrorsPlugin from '@pothos/plugin-errors';
import { GraphQLError } from 'graphql';

// Базовые классы ошибок
class AppError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Not authenticated') {
    super(message, 'UNAUTHENTICATED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Not authorized') {
    super(message, 'FORBIDDEN');
  }
}

// Настройка builder
const builder = new SchemaBuilder({
  plugins: [ErrorsPlugin],
  errors: {
    defaultTypes: [AppError],
  },
});

// Определение типов ошибок
const ErrorInterface = builder.interfaceRef<AppError>('Error').implement({
  fields: (t) => ({
    message: t.exposeString('message'),
    code: t.exposeString('code'),
  }),
});

builder.objectType(AppError, {
  name: 'AppError',
  interfaces: [ErrorInterface],
});

builder.objectType(AuthenticationError, {
  name: 'AuthenticationError',
  interfaces: [ErrorInterface],
});

builder.objectType(ForbiddenError, {
  name: 'ForbiddenError',
  interfaces: [ErrorInterface],
});

// Использование в схеме
builder.queryType({
  fields: (t) => ({
    me: t.field({
      type: User,
      errors: {
        types: [AuthenticationError],
      },
      resolve: (_, __, ctx) => {
        if (!ctx.user) {
          throw new AuthenticationError();
        }
        return ctx.user;
      },
    }),
    
    adminData: t.field({
      type: 'String',
      errors: {
        types: [AuthenticationError, ForbiddenError],
      },
      resolve: (_, __, ctx) => {
        if (!ctx.user) {
          throw new AuthenticationError();
        }
        if (ctx.user.role !== 'ADMIN') {
          throw new ForbiddenError('Admin access required');
        }
        return 'Secret admin data';
      },
    }),
  }),
});
```