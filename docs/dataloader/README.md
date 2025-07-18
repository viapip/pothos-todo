# @pothos/plugin-dataloader

Плагин Dataloader для Pothos предоставляет интеграцию с библиотекой DataLoader для решения проблемы N+1 запросов в GraphQL.

## Установка

```bash
bun add @pothos/plugin-dataloader
```

## Конфигурация

```typescript
import SchemaBuilder from '@pothos/core';
import DataloaderPlugin from '@pothos/plugin-dataloader';

const builder = new SchemaBuilder({
  plugins: [DataloaderPlugin],
});
```

## Основные концепции

### Создание loadable объектов

```typescript
import DataLoader from 'dataloader';

const UserType = builder.loadableObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
  }),
});

// Определяем функцию загрузки
UserType.getDataloader = (context: Context) => {
  return new DataLoader<string, User>(async (ids) => {
    const users = await context.prisma.user.findMany({
      where: { id: { in: ids as string[] } },
    });
    
    // Важно вернуть массив в том же порядке, что и ids
    return ids.map(id => users.find(user => user.id === id) || null);
  });
};
```

### loadableNode для Relay

```typescript
const UserNode = builder.loadableNode('UserNode', {
  id: {
    resolve: (user) => user.id,
  },
  load: (ids: string[], context: Context) => 
    context.loaders.users.loadMany(ids),
  fields: (t) => ({
    name: t.exposeString('name'),
    email: t.exposeString('email'),
  }),
});
```

### Использование в резолверах

```typescript
builder.queryType({
  fields: (t) => ({
    user: t.field({
      type: UserType,
      args: {
        id: t.arg.id({ required: true }),
      },
      resolve: async (_, { id }, context) => {
        const loader = UserType.getDataloader(context);
        return loader.load(id);
      },
    }),
    
    users: t.field({
      type: [UserType],
      args: {
        ids: t.arg.idList({ required: true }),
      },
      resolve: async (_, { ids }, context) => {
        const loader = UserType.getDataloader(context);
        return loader.loadMany(ids);
      },
    }),
  }),
});
```

## Работа с отношениями

### Загрузка связанных данных

```typescript
const PostType = builder.loadableObject('Post', {
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    
    // Автор загружается через DataLoader
    author: t.field({
      type: UserType,
      resolve: async (post, _, context) => {
        const loader = UserType.getDataloader(context);
        return loader.load(post.authorId);
      },
    }),
  }),
});

PostType.getDataloader = (context: Context) => {
  return new DataLoader<string, Post>(async (ids) => {
    const posts = await context.prisma.post.findMany({
      where: { id: { in: ids as string[] } },
    });
    
    return ids.map(id => posts.find(post => post.id === id) || null);
  });
};
```

### Загрузка один-ко-многим

```typescript
// DataLoader для постов пользователя
const createUserPostsLoader = (context: Context) => {
  return new DataLoader<string, Post[]>(async (userIds) => {
    const posts = await context.prisma.post.findMany({
      where: { authorId: { in: userIds as string[] } },
    });
    
    // Группируем посты по userId
    const postsByUser = posts.reduce((acc, post) => {
      if (!acc[post.authorId]) {
        acc[post.authorId] = [];
      }
      acc[post.authorId].push(post);
      return acc;
    }, {} as Record<string, Post[]>);
    
    // Возвращаем массив массивов в правильном порядке
    return userIds.map(id => postsByUser[id] || []);
  });
};

// Использование в User типе
builder.objectType(UserType, {
  fields: (t) => ({
    posts: t.field({
      type: [PostType],
      resolve: async (user, _, context) => {
        const loader = context.loaders.userPosts;
        return loader.load(user.id);
      },
    }),
  }),
});
```

## Обработка ошибок

### rejectErrors helper

```typescript
import { rejectErrors } from '@pothos/plugin-dataloader';

builder.queryField('users', (t) =>
  t.field({
    type: [UserType],
    args: {
      ids: t.arg.idList({ required: true }),
    },
    resolve: async (_, { ids }, context) => {
      const loader = UserType.getDataloader(context);
      
      // rejectErrors преобразует Error объекты в rejected promises
      return rejectErrors(loader.loadMany(ids));
    },
  }),
);
```

## Кэширование и очистка

### Управление кэшем

```typescript
// Создаем DataLoader с кастомными опциями
const createUserLoader = (context: Context) => {
  return new DataLoader<string, User>(
    async (ids) => {
      // загрузка данных
    },
    {
      // Отключить кэширование
      cache: false,
      
      // Или использовать кастомный кэш
      cacheMap: new Map(),
      
      // Батчинг
      batch: true,
      maxBatchSize: 100,
      batchScheduleFn: (callback) => setTimeout(callback, 10),
    }
  );
};

// Очистка кэша
builder.mutationField('updateUser', (t) =>
  t.field({
    type: UserType,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateUserInput }),
    },
    resolve: async (_, { id, input }, context) => {
      const user = await context.prisma.user.update({
        where: { id },
        data: input,
      });
      
      // Очищаем кэш для этого пользователя
      const loader = UserType.getDataloader(context);
      loader.clear(id);
      
      return user;
    },
  }),
);
```

## Контекст и DataLoaders

### Организация loaders в контексте

```typescript
interface Context {
  prisma: PrismaClient;
  loaders: {
    users: DataLoader<string, User>;
    posts: DataLoader<string, Post>;
    userPosts: DataLoader<string, Post[]>;
    postComments: DataLoader<string, Comment[]>;
  };
}

// Создание контекста с loaders
export function createContext({ req }: { req: Request }): Context {
  return {
    prisma,
    loaders: {
      users: createUserLoader({ prisma }),
      posts: createPostLoader({ prisma }),
      userPosts: createUserPostsLoader({ prisma }),
      postComments: createPostCommentsLoader({ prisma }),
    },
  };
}
```

## Лучшие практики

1. **Всегда возвращайте правильный порядок** - DataLoader ожидает результаты в том же порядке, что и входные ID
2. **Обрабатывайте null значения** - Возвращайте null для несуществующих записей
3. **Используйте rejectErrors** для правильной обработки ошибок
4. **Очищайте кэш после мутаций** для консистентности данных
5. **Группируйте связанные loaders** в контексте

## Полный пример

```typescript
import SchemaBuilder from '@pothos/core';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import RelayPlugin from '@pothos/plugin-relay';
import DataLoader from 'dataloader';
import { rejectErrors } from '@pothos/plugin-dataloader';

const builder = new SchemaBuilder<{
  Context: Context;
}>({
  plugins: [DataloaderPlugin, RelayPlugin],
  relay: {},
});

// User тип с DataLoader
const UserNode = builder.loadableNode('User', {
  id: {
    resolve: (user) => user.id,
  },
  load: async (ids: string[], context: Context) => {
    const users = await context.prisma.user.findMany({
      where: { id: { in: ids } },
    });
    
    return ids.map(id => 
      users.find(user => user.id === id) || 
      new Error(`User ${id} not found`)
    );
  },
  fields: (t) => ({
    name: t.exposeString('name'),
    email: t.exposeString('email'),
    
    posts: t.field({
      type: [PostNode],
      resolve: async (user, _, context) => {
        const posts = await context.loaders.userPosts.load(user.id);
        return posts;
      },
    }),
  }),
});

// Post тип
const PostNode = builder.loadableNode('Post', {
  id: {
    resolve: (post) => post.id,
  },
  load: async (ids: string[], context: Context) => {
    const posts = await context.prisma.post.findMany({
      where: { id: { in: ids } },
    });
    
    return ids.map(id => 
      posts.find(post => post.id === id) || 
      new Error(`Post ${id} not found`)
    );
  },
  fields: (t) => ({
    title: t.exposeString('title'),
    content: t.exposeString('content'),
    
    author: t.field({
      type: UserNode,
      resolve: (post) => ({ id: post.authorId } as any),
    }),
  }),
});

// Создание loaders
function createUserPostsLoader(context: { prisma: PrismaClient }) {
  return new DataLoader<string, Post[]>(async (userIds) => {
    const posts = await context.prisma.post.findMany({
      where: { authorId: { in: userIds as string[] } },
      orderBy: { createdAt: 'desc' },
    });
    
    const grouped = posts.reduce((acc, post) => {
      if (!acc[post.authorId]) acc[post.authorId] = [];
      acc[post.authorId].push(post);
      return acc;
    }, {} as Record<string, Post[]>);
    
    return userIds.map(id => grouped[id] || []);
  });
}

// Query
builder.queryType({
  fields: (t) => ({
    user: t.field({
      type: UserNode,
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      resolve: (_, { id }) => ({ id } as any),
    }),
    
    users: t.field({
      type: [UserNode],
      args: {
        ids: t.arg.idList({ required: true }),
      },
      resolve: (_, { ids }) => ids.map(id => ({ id } as any)),
    }),
  }),
});

export const schema = builder.toSchema();
```