# @pothos/plugin-scope-auth + Lucia Integration

Плагин Scope Auth для Pothos предоставляет мощную систему авторизации на основе скоупов для GraphQL схем. В этом проекте он интегрирован с Lucia Authentication для создания полноценной системы аутентификации и авторизации.

## Установка

```bash
bun add @pothos/plugin-scope-auth
```

## Интеграция с Lucia Authentication

В этом проекте Scope Auth интегрирован с Lucia для полноценной аутентификации:

```typescript
import SchemaBuilder from '@pothos/core';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import type { SessionWithUser } from '@/lib/auth';

// Расширенный контекст с Lucia сессией
export interface Context {
  user: User | null;
  container: Container;
  session: SessionWithUser | null; // Lucia сессия
}

const builder = new SchemaBuilder<{
  Context: Context;
  AuthScopes: {
    authenticated: boolean;
    admin: boolean;
  };
}>({
  plugins: [ScopeAuthPlugin],
  scopeAuth: {
    authorizeOnSubscribe: true,
    // Скоупы на основе Lucia сессий
    authScopes: async (context: Context) => ({
      authenticated: !!context.session?.user,
      admin: context.session?.user?.email === 'admin@example.com',
    }),
  },
});
```

## Базовая конфигурация (без Lucia)

Для проектов без Lucia можно использовать базовую конфигурацию:

```typescript
import SchemaBuilder from '@pothos/core';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';

type MyPerms = 'readStuff' | 'updateStuff' | 'readArticle';

const builder = new SchemaBuilder<{
  AuthScopes: {
    public: boolean;
    employee: boolean;
    deferredScope: boolean;
    customPerm: MyPerms;
  };
}>({
  plugins: [ScopeAuthPlugin],
  scopeAuth: {
    // Рекомендуется при использовании подписок
    authorizeOnSubscribe: true,
    // Инициализатор скоупов для каждого запроса
    authScopes: async (context) => ({
      public: !!context.User,
      // Немедленно вычисляемый скоуп
      employee: await context.User.isEmployee(),
      // Вычисляется при использовании
      deferredScope: () => context.User.isEmployee(),
      // Скоуп с параметром
      customPerm: (perm) => context.permissionService.hasPermission(context.User, perm),
    }),
  },
});
```

## Основные концепции

### Определение скоупов

Скоупы определяются в функции `authScopes` и могут быть:

1. **Простыми булевыми значениями**
```typescript
public: !!context.User
```

2. **Асинхронными вычислениями**
```typescript
employee: await context.User.isEmployee()
```

3. **Отложенными вычислениями**
```typescript
deferredScope: () => context.User.isEmployee()
```

4. **Функциями с параметрами**
```typescript
customPerm: (perm) => context.permissionService.hasPermission(context.User, perm)
```

### Использование скоупов

#### На уровне полей

```typescript
builder.queryType({
  fields: (t) => ({
    adminData: t.string({
      authScopes: {
        employee: true,
      },
      resolve: () => 'Секретные данные',
    }),
  }),
});
```

#### На уровне типов

```typescript
builder.objectType(Article, {
  authScopes: {
    readArticle: true,
  },
  fields: (t) => ({
    title: t.exposeString('title'),
    content: t.exposeString('content'),
  }),
});
```

#### С использованием authField

```typescript
type Context = {
  user: User | null;
};

const builder = new SchemaBuilder<{
  Context: Context;
  AuthScopes: {
    loggedIn: boolean;
  };
  AuthContexts: {
    loggedIn: Context & { user: User };
  };
}>({
  plugins: [ScopeAuthPlugin],
  authScopes: async (context) => ({
    loggedIn: !!context.user,
  }),
});

builder.queryField('currentId', (t) =>
  t.authField({
    type: 'ID',
    authScopes: {
      loggedIn: true,
    },
    resolve: (parent, args, context) => context.user.id, // user гарантированно не null
  }),
);
```

### Комбинирование скоупов

```typescript
builder.queryType({
  fields: (t) => ({
    complexField: t.string({
      authScopes: {
        // $all - все скоупы должны быть true (по умолчанию)
        $all: {
          employee: true,
          customPerm: 'readStuff',
        },
      },
      resolve: () => 'data',
    }),
    eitherOrField: t.string({
      authScopes: {
        // $any - хотя бы один скоуп должен быть true
        $any: {
          employee: true,
          customPerm: 'readStuff',
        },
      },
      resolve: () => 'data',
    }),
  }),
});
```

## Обработка ошибок

### Глобальная обработка

```typescript
const builder = new SchemaBuilder({
  scopeAuth: {
    unauthorizedError: (parent, context, info, result) => 
      new Error(`Недостаточно прав для доступа к ${info.fieldName}`),
    treatErrorsAsUnauthorized: true,
  },
  plugins: [ScopeAuthPlugin],
});
```

### Переброс оригинальных ошибок

```typescript
function throwFirstError(failure: AuthFailure) {
  if ('error' in failure && failure.error) {
    throw failure.error;
  }

  if (
    failure.kind === AuthScopeFailureType.AnyAuthScopes ||
    failure.kind === AuthScopeFailureType.AllAuthScopes
  ) {
    for (const child of failure.failures) {
      throwFirstError(child);
    }
  }
}

const builder = new SchemaBuilder({
  scopeAuth: {
    treatErrorsAsUnauthorized: true,
    unauthorizedError: (parent, context, info, result) => {
      throwFirstError(result.failure);
      return new Error(`Доступ запрещен`);
    },
  },
  plugins: [ScopeAuthPlugin],
});
```

## Производительность

### Кэширование скоупов

```typescript
const builder = new SchemaBuilder({
  scopeAuth: {
    // Функция для генерации ключа кэша
    cacheKey: (val) => JSON.stringify(val),
    authScopes: async (context) => ({
      loggedIn: !!context.User,
    }),
  },
  plugins: [ScopeAuthPlugin],
});
```

### Оптимизация для не-человеческих пользователей

```typescript
const builder = new SchemaBuilder({
  authScopes: async (context) => ({
    humanPermission: context.user.isHuman() 
      ? (perm) => context.user.hasPermission(perm) 
      : false,
  }),
});
```

### Выполнение скоупов на уровне типов

```typescript
const builder = new SchemaBuilder({
  scopeAuth: {
    // Влияет на все объектные типы (кроме Query, Mutation, Subscription)
    runScopesOnType: true,
  },
  plugins: [ScopeAuthPlugin],
});
```

## Лучшие практики

1. **Используйте отложенные скоупы** для дорогих вычислений
2. **Кэшируйте результаты** для сложных скоупов
3. **Группируйте связанные проверки** в один скоуп
4. **Используйте authField** для типобезопасного доступа к контексту
5. **Настройте authorizeOnSubscribe** для подписок

## Примеры использования

### Полная настройка с различными типами скоупов

```typescript
const builder = new SchemaBuilder<{
  Context: {
    user: User | null;
    permissionService: PermissionService;
  };
  AuthScopes: {
    isLoggedIn: boolean;
    isAdmin: boolean;
    hasRole: string;
    hasPermission: string;
  };
}>({
  plugins: [ScopeAuthPlugin],
  scopeAuth: {
    authorizeOnSubscribe: true,
    authScopes: async (context) => ({
      isLoggedIn: !!context.user,
      isAdmin: context.user?.role === 'admin',
      hasRole: (role) => context.user?.role === role,
      hasPermission: (perm) => 
        context.permissionService.check(context.user, perm),
    }),
  },
});

// Использование в схеме
builder.queryType({
  fields: (t) => ({
    publicData: t.string({
      resolve: () => 'Публичные данные',
    }),
    privateData: t.string({
      authScopes: {
        isLoggedIn: true,
      },
      resolve: () => 'Приватные данные',
    }),
    adminPanel: t.field({
      type: 'String',
      authScopes: {
        $all: {
          isLoggedIn: true,
          isAdmin: true,
        },
      },
      resolve: () => 'Админ панель',
    }),
    resourceAccess: t.string({
      authScopes: {
        hasPermission: 'read:resources',
      },
      resolve: () => 'Защищенный ресурс',
    }),
  }),
});
```

## Примеры использования с Lucia

### Защищенные queries с Lucia сессиями

```typescript
// Получение текущего пользователя
builder.queryField('currentUser', (t) =>
  t.prismaField({
    type: 'User',
    nullable: true,
    authScopes: {
      authenticated: true, // Требует активную Lucia сессию
    },
    resolve: async (query, root, args, context) => {
      // context.session гарантированно существует благодаря authScopes
      return context.session!.user;
    },
  }),
);

// Админская информация
builder.queryField('adminStats', (t) =>
  t.field({
    type: 'String',
    authScopes: {
      admin: true, // Требует admin права
    },
    resolve: () => 'Секретная админская информация',
  }),
);
```

### Защищенные mutations с Lucia

```typescript
builder.mutationField('createTodo', (t) =>
  t.prismaField({
    type: 'Todo',
    authScopes: {
      authenticated: true,
    },
    args: {
      title: t.arg.string({ required: true }),
    },
    resolve: async (query, root, args, context) => {
      const userId = context.session!.user.id;
      
      return prisma.todo.create({
        ...query,
        data: {
          title: args.title,
          userId,
        },
      });
    },
  }),
);
```

### Миграция с базовой авторизации на Lucia

```typescript
// БЫЛО:
authScopes: async (context) => ({
  authenticated: !!context.user,
  admin: context.user?.role === 'admin',
}),

// СТАЛО:
authScopes: async (context: Context) => ({
  authenticated: !!context.session?.user,
  admin: context.session?.user?.email === 'admin@example.com',
}),
```

## См. также

- [Lucia Authentication Guide](../lucia/README.md) - Полная документация по Lucia
- [OAuth Setup Guide](../oauth/README.md) - Настройка Google и GitHub OAuth
- [Migration Guide](../auth-migration/README.md) - Миграция с базовой авторизации