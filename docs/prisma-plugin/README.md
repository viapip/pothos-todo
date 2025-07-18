# @pothos/plugin-prisma

Плагин Prisma для Pothos обеспечивает глубокую интеграцию между Prisma ORM и Pothos GraphQL, позволяя автоматически генерировать типы GraphQL на основе моделей Prisma.

## Установка

```bash
bun add @pothos/plugin-prisma
```

## Настройка

### 1. Генерация типов Pothos

Добавьте генератор в `schema.prisma`:

```prisma
generator pothos {
  provider = "prisma-pothos-types"
}
```

### 2. Конфигурация SchemaBuilder

```typescript
import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import type PrismaTypes from '@pothos/plugin-prisma/generated';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
}>({
  plugins: [PrismaPlugin],
  prisma: {
    client: prisma,
    // Показывать описания из схемы Prisma
    exposeDescriptions: true,
    // Фильтровать totalCount в connections
    filterConnectionTotalCount: true,
    // Предупреждать о неиспользуемых query параметрах
    onUnusedQuery: process.env.NODE_ENV === 'production' ? null : 'warn',
  },
});
```

## Основные концепции

### prismaObject

Создает GraphQL объект на основе модели Prisma:

```typescript
builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name', { nullable: true }),
    posts: t.relation('posts'),
    
    // Кастомное поле с оптимизированной загрузкой
    fullName: t.string({
      select: {
        firstName: true,
        lastName: true,
      },
      resolve: (user) => `${user.firstName} ${user.lastName}`,
    }),
  }),
});
```

### prismaNode (для Relay)

```typescript
builder.prismaNode('Post', {
  id: { field: 'id' },
  fields: (t) => ({
    title: t.exposeString('title'),
    content: t.exposeString('content'),
    author: t.relation('author'),
    
    // Relay connection для комментариев
    commentsConnection: t.relatedConnection('comments', {
      cursor: 'id',
    }),
  }),
});
```

### prismaField

Оптимизированные запросы к базе данных:

```typescript
builder.queryType({
  fields: (t) => ({
    me: t.prismaField({
      type: 'User',
      resolve: async (query, root, args, ctx, info) =>
        prisma.user.findUniqueOrThrow({
          ...query, // Автоматически включает необходимые поля
          where: { id: ctx.userId },
        }),
    }),
  }),
});
```

## Работа с отношениями

### Простые отношения

```typescript
builder.prismaObject('User', {
  fields: (t) => ({
    // Один ко многим
    posts: t.relation('posts'),
    
    // Один к одному
    profile: t.relation('profile'),
    
    // С фильтрацией
    publishedPosts: t.relation('posts', {
      query: {
        where: {
          published: true,
        },
      },
    }),
  }),
});
```

### Отношения с аргументами

```typescript
builder.prismaObject('User', {
  fields: (t) => ({
    posts: t.relation('posts', {
      args: {
        orderBy: t.arg.string(),
        take: t.arg.int(),
      },
      query: (args) => ({
        orderBy: args.orderBy ? { createdAt: args.orderBy } : undefined,
        take: args.take ?? 10,
      }),
    }),
  }),
});
```

### Relay Connections

```typescript
builder.prismaObject('User', {
  fields: (t) => ({
    postsConnection: t.relatedConnection('posts', {
      cursor: 'id',
      args: {
        filter: t.arg.string(),
      },
      query: (args) => ({
        where: args.filter
          ? {
              title: { contains: args.filter },
            }
          : undefined,
      }),
      totalCount: (parent, args, ctx) =>
        prisma.post.count({
          where: {
            authorId: parent.id,
            title: args.filter ? { contains: args.filter } : undefined,
          },
        }),
    }),
  }),
});
```

## Оптимизация N+1 запросов

### Использование select

```typescript
builder.prismaObject('Post', {
  fields: (t) => ({
    // Автоматически загружает данные автора
    authorName: t.string({
      select: {
        author: {
          select: {
            name: true,
          },
        },
      },
      resolve: (post) => post.author.name,
    }),
  }),
});
```

### Использование include

```typescript
builder.queryField('posts', (t) =>
  t.prismaField({
    type: ['Post'],
    resolve: async (query) =>
      prisma.post.findMany({
        ...query,
        include: {
          author: true,
          _count: {
            select: { comments: true },
          },
        },
      }),
  }),
);
```

## Интерфейсы и варианты

```typescript
// Определение интерфейса
const UserInterface = builder.prismaInterface('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
  }),
  resolveType: (user) => (user.role === 'ADMIN' ? 'Admin' : 'Member'),
});

// Варианты интерфейса
builder.prismaObject('User', {
  variant: 'Admin',
  interfaces: [UserInterface],
  fields: (t) => ({
    permissions: t.stringList({
      resolve: () => ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    }),
  }),
});

builder.prismaObject('User', {
  variant: 'Member',
  interfaces: [UserInterface],
  fields: (t) => ({
    memberSince: t.expose('createdAt', { type: 'DateTime' }),
  }),
});
```

## Обработка null значений

```typescript
builder.prismaObject('User', {
  fields: (t) => ({
    // Строковое поле, которое может быть null
    bio: t.exposeString('bio', { nullable: true }),
    
    // Отношение, которое может быть null
    profile: t.relation('profile', { nullable: true }),
    
    // Кастомное поле с обработкой null
    displayName: t.string({
      nullable: true,
      resolve: (user) => user.name || user.email,
    }),
  }),
});
```

## Мутации

```typescript
builder.mutationType({
  fields: (t) => ({
    createPost: t.prismaField({
      type: 'Post',
      args: {
        title: t.arg.string({ required: true }),
        content: t.arg.string({ required: true }),
      },
      resolve: async (query, _, args, ctx) => {
        return prisma.post.create({
          ...query,
          data: {
            title: args.title,
            content: args.content,
            author: {
              connect: { id: ctx.userId },
            },
          },
        });
      },
    }),
    
    updatePost: t.prismaField({
      type: 'Post',
      args: {
        id: t.arg.id({ required: true }),
        title: t.arg.string(),
        content: t.arg.string(),
      },
      resolve: async (query, _, args) => {
        return prisma.post.update({
          ...query,
          where: { id: args.id },
          data: {
            title: args.title ?? undefined,
            content: args.content ?? undefined,
          },
        });
      },
    }),
  }),
});
```

## Динамическая загрузка клиента

```typescript
const builder = new SchemaBuilder<{
  Context: { isAdmin: boolean };
  PrismaTypes: PrismaTypes;
}>({
  plugins: [PrismaPlugin],
  prisma: {
    client: (ctx) => (ctx.isAdmin ? adminPrisma : readOnlyPrisma),
    dmmf: Prisma.dmmf,
  },
});
```

## Лучшие практики

1. **Используйте select для оптимизации** - загружайте только необходимые поля
2. **Используйте prismaField для корневых запросов** - автоматическая оптимизация
3. **Настройте правильные индексы** в Prisma схеме для cursor пагинации
4. **Используйте filterConnectionTotalCount** для оптимизации count запросов
5. **Группируйте связанные поля** в объектные типы

## Полный пример

```typescript
import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import RelayPlugin from '@pothos/plugin-relay';
import type PrismaTypes from '@pothos/plugin-prisma/generated';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
}>({
  plugins: [PrismaPlugin, RelayPlugin],
  relay: {},
  prisma: {
    client: prisma,
    exposeDescriptions: true,
    filterConnectionTotalCount: true,
  },
});

// User тип с оптимизациями
builder.prismaNode('User', {
  id: { field: 'id' },
  fields: (t) => ({
    email: t.exposeString('email'),
    name: t.exposeString('name', { nullable: true }),
    
    // Оптимизированное поле
    postCount: t.int({
      select: {
        _count: {
          select: { posts: true },
        },
      },
      resolve: (user) => user._count.posts,
    }),
    
    // Relay connection
    postsConnection: t.relatedConnection('posts', {
      cursor: 'id',
      query: () => ({
        orderBy: { createdAt: 'desc' },
      }),
    }),
  }),
});

// Корневые запросы
builder.queryType({
  fields: (t) => ({
    user: t.prismaField({
      type: 'User',
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      resolve: (query, _, args) =>
        prisma.user.findUnique({
          ...query,
          where: { id: args.id },
        }),
    }),
    
    users: t.prismaConnection({
      type: 'User',
      cursor: 'id',
      resolve: (query) => prisma.user.findMany({ ...query }),
    }),
  }),
});

export const schema = builder.toSchema();
```