# @pothos/plugin-relay

Плагин Relay для Pothos предоставляет полную поддержку спецификации Relay, включая Node интерфейс, cursor-based пагинацию, глобальные идентификаторы и стандартизированные mutations.

## Установка

```bash
bun add @pothos/plugin-relay
```

## Конфигурация

```typescript
import SchemaBuilder from '@pothos/core';
import RelayPlugin from '@pothos/plugin-relay';

const builder = new SchemaBuilder({
  plugins: [RelayPlugin],
  relay: {
    // Опции для кастомизации поведения
    clientMutationId: 'optional', // 'omit' | 'optional' | 'required'
    cursorType: 'String', // Тип для курсоров
    nodeQueryOptions: false, // Добавить query { node(id: ID!) }
    nodesQueryOptions: false, // Добавить query { nodes(ids: [ID!]!) }
    nodeTypeOptions: { // Опции для Node интерфейса
      idFieldOptions: {
        description: 'Глобальный уникальный идентификатор',
      },
    },
    pageInfoTypeOptions: {}, // Опции для PageInfo типа
    clientMutationIdFieldOptions: {}, // Опции для clientMutationId
    mutationInputArgOptions: {}, // Опции для mutation input аргументов
    cursorFieldOptions: {}, // Опции для cursor полей
    nodeFieldOptions: {}, // Опции для node полей в edges
    edgesFieldOptions: {}, // Опции для edges полей
    pageInfoFieldOptions: {}, // Опции для pageInfo полей
    connectionFieldOptions: {}, // Опции для connection полей
  },
});
```

## Основные концепции

### Node интерфейс

Node - это центральная концепция Relay, позволяющая глобально идентифицировать объекты:

```typescript
// Базовое определение Node
const UserNode = builder.node('User', {
  id: {
    resolve: (user) => user.id,
  },
  loadOne: (id: string, context) => context.db.user.findUnique({ where: { id } }),
  loadMany: (ids: string[], context) => context.db.user.findMany({ 
    where: { id: { in: ids } } 
  }),
  fields: (t) => ({
    name: t.exposeString('name'),
    email: t.exposeString('email'),
  }),
});

// Node с кастомным разрешением ID
const PostNode = builder.node('Post', {
  id: {
    // Кастомная логика для генерации глобального ID
    resolve: (post, context) => {
      // Можно добавить префикс или энкодинг
      return Buffer.from(`Post:${post.id}`).toString('base64');
    },
    // Парсинг ID обратно для loadOne/loadMany
    parseId: (id: string) => {
      const decoded = Buffer.from(id, 'base64').toString();
      return decoded.replace('Post:', '');
    },
  },
  loadOne: (id, context) => context.db.post.findUnique({ where: { id } }),
  fields: (t) => ({
    title: t.exposeString('title'),
    content: t.exposeString('content'),
  }),
});
```

### Global ID утилиты

```typescript
import { encodeGlobalId, decodeGlobalId } from '@pothos/plugin-relay';

// Кодирование глобального ID
const globalId = encodeGlobalId('User', '123');
// Результат: base64 encoded "User:123"

// Декодирование глобального ID
const { type, id } = decodeGlobalId(globalId);
// Результат: { type: 'User', id: '123' }

// Использование в резолверах
builder.queryField('userByGlobalId', (t) =>
  t.field({
    type: UserNode,
    args: {
      id: t.arg.globalID({ required: true }),
    },
    resolve: async (_, { id }, context) => {
      const { type, id: userId } = decodeGlobalId(id);
      
      if (type !== 'User') {
        throw new Error('Invalid ID type');
      }
      
      return context.db.user.findUnique({ where: { id: userId } });
    },
  })
);

// Хелпер для работы с глобальными ID в полях
builder.objectType('User', {
  fields: (t) => ({
    // Автоматически кодирует ID в глобальный формат
    id: t.globalID({
      resolve: (user) => user.id,
    }),
    // Альтернатива с exposeID
    globalId: t.exposeID('id', {
      // Автоматически конвертирует в глобальный ID
      encoding: 'base64',
    }),
  }),
});
```

### Connections (Пагинация)

Relay connections обеспечивают мощную, стандартизированную систему пагинации:

```typescript
// Базовая connection
builder.queryField('users', (t) =>
  t.connection({
    type: UserNode,
    resolve: async (parent, args, context) => {
      // args содержит: first, last, before, after
      const users = await context.db.user.findMany({
        take: args.first || 20,
        cursor: args.after ? { id: args.after } : undefined,
      });
      
      return {
        edges: users.map(user => ({
          cursor: user.id,
          node: user,
        })),
        pageInfo: {
          hasNextPage: users.length === (args.first || 20),
          hasPreviousPage: !!args.after,
          startCursor: users[0]?.id,
          endCursor: users[users.length - 1]?.id,
        },
      };
    },
  }),
);

// Connection с дополнительными полями и метаданными
const PostConnection = builder.connectionObject({
  type: PostNode,
  name: 'PostConnection',
  // Добавляем поля к самой connection
  fields: (t) => ({
    totalCount: t.int({
      resolve: async (_, __, context) => {
        return context.db.post.count();
      },
    }),
    statistics: t.field({
      type: PostStatistics,
      resolve: async (_, __, context) => {
        const stats = await context.db.post.aggregate({
          _avg: { views: true, likes: true },
          _count: { _all: true },
        });
        return {
          averageViews: stats._avg.views || 0,
          averageLikes: stats._avg.likes || 0,
          totalPosts: stats._count._all,
        };
      },
    }),
  }),
});

// Кастомный Edge тип с дополнительными полями
const PostEdge = builder.edgeObject({
  type: PostNode,
  name: 'PostEdge',
  fields: (t) => ({
    // Добавляем метаданные к каждому edge
    relevanceScore: t.float({
      resolve: (edge) => edge.relevanceScore,
    }),
    userInteraction: t.field({
      type: UserInteraction,
      resolve: async (edge, _, context) => {
        return context.db.userInteraction.findUnique({
          where: {
            userId_postId: {
              userId: context.currentUser.id,
              postId: edge.node.id,
            },
          },
        });
      },
    }),
  }),
});

// Использование кастомных Connection и Edge
builder.queryField('searchPosts', (t) =>
  t.field({
    type: PostConnection,
    args: {
      query: t.arg.string({ required: true }),
      first: t.arg.int(),
      after: t.arg.string(),
    },
    resolve: async (_, { query, first, after }, context) => {
      const results = await context.search.searchPosts(query, {
        limit: first || 20,
        cursor: after,
      });
      
      return {
        edges: results.hits.map(hit => ({
          cursor: hit.id,
          node: hit.post,
          relevanceScore: hit.score, // Добавляем в edge
        })),
        pageInfo: {
          hasNextPage: results.hasMore,
          hasPreviousPage: !!after,
          startCursor: results.hits[0]?.id,
          endCursor: results.hits[results.hits.length - 1]?.id,
        },
      };
    },
  })
);
```

### Продвинутые паттерны пагинации

```typescript
// Bi-directional пагинация
builder.queryField('messages', (t) =>
  t.connection({
    type: MessageNode,
    resolve: async (_, args) => {
      const { first, last, before, after } = args;
      
      // Определяем направление пагинации
      const isForward = !!first || !last;
      const limit = first || last || 20;
      
      let query: any = {
        take: isForward ? limit + 1 : -(limit + 1),
        orderBy: { createdAt: isForward ? 'asc' : 'desc' },
      };
      
      if (after) {
        query.cursor = { id: after };
        query.skip = 1;
      } else if (before) {
        query.cursor = { id: before };
        query.skip = 1;
      }
      
      const items = await context.db.message.findMany(query);
      const hasExtraItem = items.length > limit;
      
      if (hasExtraItem) {
        isForward ? items.pop() : items.shift();
      }
      
      if (!isForward) {
        items.reverse();
      }
      
      const edges = items.map(item => ({
        cursor: item.id,
        node: item,
      }));
      
      return {
        edges,
        pageInfo: {
          hasNextPage: isForward ? hasExtraItem : !!before,
          hasPreviousPage: !isForward ? hasExtraItem : !!after,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor,
        },
      };
    },
  })
);

// Offset-based пагинация с Relay connections
builder.queryField('paginatedUsers', (t) =>
  t.connection({
    type: UserNode,
    args: {
      // Добавляем поддержку offset
      offset: t.arg.int(),
    },
    resolve: async (_, { first = 20, offset = 0, after }) => {
      let skip = offset;
      
      // Если есть cursor, игнорируем offset
      if (after) {
        const afterIndex = await getUserIndexById(after);
        skip = afterIndex + 1;
      }
      
      const users = await context.db.user.findMany({
        skip,
        take: first + 1,
      });
      
      const hasNextPage = users.length > first;
      if (hasNextPage) users.pop();
      
      return {
        edges: users.map((user, index) => ({
          cursor: user.id,
          node: user,
        })),
        pageInfo: {
          hasNextPage,
          hasPreviousPage: skip > 0,
          startCursor: users[0]?.id,
          endCursor: users[users.length - 1]?.id,
        },
      };
    },
  })
);
```

### Mutations

Relay mutations следуют определенному паттерну с input и payload типами:

```typescript
const { inputType: CreateUserInput, payloadType: CreateUserPayload } = 
  builder.relayMutationField('createUser', {
    inputFields: (t) => ({
      name: t.string({ required: true }),
      email: t.string({ required: true }),
    }),
    resolve: async (parent, { input }, context) => {
      const user = await context.db.user.create({
        data: {
          name: input.name,
          email: input.email,
        },
      });
      
      return {
        user,
      };
    },
    outputFields: (t) => ({
      user: t.field({
        type: UserNode,
        resolve: (payload) => payload.user,
      }),
    }),
  });
```

## Интеграция с DataLoader

DataLoader критически важен для производительности Relay приложений:

```typescript
import DataLoader from 'dataloader';
import { dataloaderGlobalId } from '@pothos/plugin-relay';

// DataLoader для Node резолверов
const userLoader = new DataLoader<string, User>(async (ids) => {
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
  });
  return ids.map(id => users.find(u => u.id === id) || null);
});

// Node с DataLoader
const UserNode = builder.node('User', {
  id: {
    resolve: (user) => user.id,
  },
  // Используем DataLoader для loadOne
  loadOne: (id, context) => context.loaders.users.load(id),
  // И для loadMany
  loadMany: (ids, context) => context.loaders.users.loadMany(ids),
  fields: (t) => ({
    name: t.exposeString('name'),
  }),
});

// DataLoader для connection резолверов
const postsByUserLoader = new DataLoader<string, Post[]>(
  async (userIds) => {
    const posts = await prisma.post.findMany({
      where: { authorId: { in: [...userIds] } },
      orderBy: { createdAt: 'desc' },
    });
    
    // Группируем посты по userId
    const postsByUser = new Map<string, Post[]>();
    for (const post of posts) {
      const userPosts = postsByUser.get(post.authorId) || [];
      userPosts.push(post);
      postsByUser.set(post.authorId, userPosts);
    }
    
    return userIds.map(id => postsByUser.get(id) || []);
  },
  {
    // Кэшируем на время запроса
    cache: true,
    // Батчинг
    batchScheduleFn: (callback) => setTimeout(callback, 10),
  }
);

// Использование в connection
builder.objectField(User, 'postsConnection', (t) =>
  t.connection({
    type: Post,
    resolve: async (user, args, context) => {
      const posts = await context.loaders.postsByUser.load(user.id);
      
      return resolveArrayConnection({
        args,
        array: posts,
      });
    },
  })
);

// DataLoader с глобальными ID
const nodeLoader = new DataLoader<string, any>(
  async (globalIds) => {
    // Группируем ID по типам
    const idsByType = new Map<string, string[]>();
    
    for (const globalId of globalIds) {
      const { type, id } = decodeGlobalId(globalId);
      const ids = idsByType.get(type) || [];
      ids.push(id);
      idsByType.set(type, ids);
    }
    
    // Загружаем каждый тип
    const results = new Map<string, any>();
    
    for (const [type, ids] of idsByType) {
      switch (type) {
        case 'User':
          const users = await prisma.user.findMany({
            where: { id: { in: ids } },
          });
          users.forEach(u => results.set(encodeGlobalId('User', u.id), u));
          break;
        case 'Post':
          const posts = await prisma.post.findMany({
            where: { id: { in: ids } },
          });
          posts.forEach(p => results.set(encodeGlobalId('Post', p.id), p));
          break;
      }
    }
    
    return globalIds.map(id => results.get(id) || null);
  }
);
```

## Интеграция с Prisma

При использовании с `@pothos/plugin-prisma`:

```typescript
// Базовая интеграция
builder.prismaNode('User', {
  id: { field: 'id' },
  fields: (t) => ({
    name: t.exposeString('name'),
    posts: t.relation('posts'),
    postsConnection: t.relatedConnection('posts', {
      cursor: 'id',
    }),
  }),
});

// Продвинутая интеграция с фильтрацией
builder.prismaNode('User', {
  id: { field: 'id' },
  fields: (t) => ({
    // Connection с фильтрацией и сортировкой
    publishedPostsConnection: t.relatedConnection('posts', {
      cursor: 'id',
      args: {
        orderBy: t.arg({ type: PostOrderBy }),
        filter: t.arg({ type: PostFilter }),
      },
      query: (args) => ({
        where: {
          published: true,
          ...(args.filter && buildPostFilter(args.filter)),
        },
        orderBy: args.orderBy ? buildPostOrder(args.orderBy) : { createdAt: 'desc' },
      }),
      totalCount: true, // Добавляет totalCount к connection
    }),
    
    // Вложенные connections
    followersConnection: t.relatedConnection('followers', {
      cursor: 'id',
      // Кастомная connection с дополнительными полями
      type: FollowerConnection,
      edgeFields: (edge, t) => ({
        followedAt: t.expose('followedAt', { type: 'DateTime' }),
        isClose: t.boolean({
          resolve: (edge) => edge.relationship === 'CLOSE_FRIEND',
        }),
      }),
    }),
  }),
});

// Кастомные Prisma queries в connections
builder.queryField('searchUsers', (t) =>
  t.prismaConnection({
    type: 'User',
    cursor: 'id',
    args: {
      search: t.arg.string({ required: true }),
    },
    resolve: (query, _, { search }) =>
      prisma.user.findMany({
        ...query,
        where: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { bio: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    totalCount: (_, { search }) =>
      prisma.user.count({
        where: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { bio: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
  })
);
```

## Утилиты и хелперы

### resolveCursorConnection

Мощный хелпер для создания cursor-based пагинации:

```typescript
import { resolveCursorConnection, ResolveCursorConnectionArgs } from '@pothos/plugin-relay';

// Базовое использование
builder.queryField('posts', (t) =>
  t.connection({
    type: Post,
    resolve: (_, args) =>
      resolveCursorConnection(
        {
          args,
          toCursor: (post) => post.createdAt.toISOString(),
        },
        async ({ before, after, limit, inverted }) => {
          return prisma.post.findMany({
            take: limit,
            where: {
              createdAt: {
                lt: before,
                gt: after,
              },
            },
            orderBy: {
              createdAt: inverted ? 'desc' : 'asc',
            },
          });
        },
      ),
  }),
);

// Продвинутое использование с кастомной логикой
builder.queryField('filteredPosts', (t) =>
  t.connection({
    type: Post,
    args: {
      filter: t.arg({ type: PostFilter }),
      orderBy: t.arg({ type: PostOrderBy }),
    },
    resolve: async (_, { filter, orderBy, ...connectionArgs }) => {
      return resolveCursorConnection(
        {
          args: connectionArgs,
          // Кастомный курсор на основе сортировки
          toCursor: (post) => {
            switch (orderBy?.field) {
              case 'POPULARITY':
                return `${post.likes}:${post.id}`;
              case 'RECENT':
                return post.createdAt.toISOString();
              default:
                return post.id;
            }
          },
          // Парсинг курсора обратно
          parseCursor: (cursor) => {
            if (orderBy?.field === 'POPULARITY') {
              const [likes, id] = cursor.split(':');
              return { likes: parseInt(likes), id };
            }
            return cursor;
          },
          // Кастомное сравнение для курсоров
          cursorCompare: (a, b) => {
            if (orderBy?.field === 'POPULARITY') {
              const aData = parseCursor(a);
              const bData = parseCursor(b);
              return aData.likes === bData.likes 
                ? aData.id.localeCompare(bData.id)
                : aData.likes - bData.likes;
            }
            return a.localeCompare(b);
          },
        },
        async (connectionOptions) => {
          const where = buildWhereClause(filter, connectionOptions);
          const order = buildOrderClause(orderBy, connectionOptions.inverted);
          
          return prisma.post.findMany({
            where,
            orderBy: order,
            take: connectionOptions.limit,
          });
        },
      );
    },
  })
);
```

### resolveArrayConnection

Хелпер для создания connections из массивов:

```typescript
import { resolveArrayConnection } from '@pothos/plugin-relay';

builder.queryField('cachedPosts', (t) =>
  t.connection({
    type: Post,
    resolve: async (_, args, context) => {
      // Получаем все посты из кэша
      const allPosts = await context.cache.getAllPosts();
      
      // Конвертируем массив в connection
      return resolveArrayConnection(
        {
          args,
          array: allPosts,
          // Опционально: кастомный способ получения курсора
          getCursor: (post) => post.id,
        }
      );
    },
  })
);

// С фильтрацией и сортировкой
builder.objectField(User, 'favoritePostsConnection', (t) =>
  t.connection({
    type: Post,
    args: {
      orderBy: t.arg({ type: PostOrderBy }),
    },
    resolve: async (user, { orderBy, ...args }, context) => {
      let posts = await context.loaders.favoritePostsByUser.load(user.id);
      
      // Сортируем массив
      if (orderBy) {
        posts = sortPosts(posts, orderBy);
      }
      
      return resolveArrayConnection({ args, array: posts });
    },
  })
);
```

### resolveWindowedConnection

Хелпер для window-based пагинации:

```typescript
import { resolveWindowedConnection } from '@pothos/plugin-relay';

builder.queryField('timelineEvents', (t) =>
  t.connection({
    type: TimelineEvent,
    resolve: (_, args) =>
      resolveWindowedConnection(
        {
          args,
          // Размер окна для загрузки
          windowSize: 100,
          // Максимальный размер страницы
          maxPageSize: 50,
          // Функция для получения курсора
          toCursor: (event) => event.timestamp.toISOString(),
        },
        async ({ offset, limit }) => {
          // Загружаем окно данных
          const events = await prisma.timelineEvent.findMany({
            skip: offset,
            take: limit,
            orderBy: { timestamp: 'desc' },
          });
          
          const totalCount = await prisma.timelineEvent.count();
          
          return {
            items: events,
            totalCount,
          };
        },
      ),
  }),
);
```

## Best Practices

### 1. Глобальные идентификаторы

```typescript
// ✅ Хорошо: используйте глобальные ID для всех Node типов
const UserNode = builder.node('User', {
  id: {
    resolve: (user) => user.id,
  },
  // Всегда реализуйте loadOne и loadMany
  loadOne: (id, context) => context.loaders.users.load(id),
  loadMany: (ids, context) => context.loaders.users.loadMany(ids),
  fields: (t) => ({
    // ID автоматически кодируется в глобальный формат
    name: t.exposeString('name'),
  }),
});

// ❌ Плохо: прямое использование database ID
builder.objectType('User', {
  fields: (t) => ({
    id: t.exposeID('id'), // Не глобальный ID!
  }),
});
```

### 2. Консистентная пагинация

```typescript
// ✅ Хорошо: используйте connections для всех списков
builder.objectField(User, 'posts', (t) =>
  t.connection({
    type: Post,
    resolve: async (user, args, context) => {
      // Правильная реализация пагинации
      return resolveCursorConnection(
        { args, toCursor: (post) => post.id },
        () => context.loaders.postsByUser.load(user.id)
      );
    },
  })
);

// ❌ Плохо: возвращать массивы напрямую
builder.objectField(User, 'posts', (t) =>
  t.field({
    type: [Post],
    resolve: (user) => user.posts, // Нет пагинации!
  })
);
```

### 3. Оптимизация производительности

```typescript
// ✅ Хорошо: используйте DataLoader везде
const createLoaders = () => ({
  users: new DataLoader(loadUsers),
  postsByUser: new DataLoader(loadPostsByUser),
  commentsByPost: new DataLoader(loadCommentsByPost),
});

// Connection с эффективной загрузкой
builder.queryField('feed', (t) =>
  t.connection({
    type: Post,
    resolve: async (_, args, context) => {
      const { limit, cursor } = parseConnectionArgs(args);
      
      // Загружаем только нужное количество
      const posts = await context.db.post.findMany({
        take: limit + 1, // +1 для определения hasNextPage
        cursor: cursor ? { id: cursor } : undefined,
        include: {
          // Eager loading для избежания N+1
          author: true,
          _count: { select: { comments: true, likes: true } },
        },
      });
      
      return createConnection(posts, args);
    },
  })
);
```

### 4. Правильная структура mutations

```typescript
// ✅ Хорошо: следуйте Relay конвенциям
builder.relayMutationField('updateUserProfile', {
  inputFields: (t) => ({
    userId: t.globalID({ required: true }),
    name: t.string(),
    bio: t.string(),
    avatar: t.field({ type: Upload }),
  }),
  resolve: async (_, { input }, context) => {
    const { type, id } = decodeGlobalId(input.userId);
    
    if (type !== 'User') {
      throw new Error('Invalid user ID');
    }
    
    const user = await context.db.user.update({
      where: { id },
      data: {
        name: input.name,
        bio: input.bio,
        avatar: input.avatar ? await processAvatar(input.avatar) : undefined,
      },
    });
    
    return { user };
  },
  outputFields: (t) => ({
    user: t.field({
      type: UserNode,
      resolve: (payload) => payload.user,
    }),
    // Включайте измененные edges если нужно
    userEdge: t.edge({
      type: UserNode,
      resolve: (payload) => ({
        cursor: payload.user.id,
        node: payload.user,
      }),
    }),
  }),
});
```

### 5. Обработка ошибок в Relay

```typescript
// Используйте union types для ошибок
const UpdateUserResult = builder.unionType('UpdateUserResult', {
  types: [UpdateUserSuccess, UpdateUserError],
  resolveType: (value) => {
    return 'error' in value ? 'UpdateUserError' : 'UpdateUserSuccess';
  },
});

builder.relayMutationField('updateUser', {
  inputFields: (t) => ({ /* ... */ }),
  resolve: async (_, { input }, context) => {
    try {
      const user = await updateUser(input);
      return { user };
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          error: error.message,
          fieldErrors: error.fieldErrors,
        };
      }
      throw error;
    }
  },
  outputFields: (t) => ({
    result: t.field({
      type: UpdateUserResult,
      resolve: (payload) => payload,
    }),
  }),
});
```

## Примеры использования

### Полный пример production-ready схемы

```typescript
import SchemaBuilder from '@pothos/core';
import RelayPlugin from '@pothos/plugin-relay';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import PrismaPlugin from '@pothos/plugin-prisma';
import ErrorsPlugin from '@pothos/plugin-errors';
import { DateTimeResolver } from 'graphql-scalars';

// Конфигурация builder
const builder = new SchemaBuilder<{
  Context: {
    user?: User;
    loaders: ReturnType<typeof createLoaders>;
    prisma: PrismaClient;
  };
  Scalars: {
    DateTime: {
      Input: Date;
      Output: Date;
    };
  };
}>({
  plugins: [RelayPlugin, DataloaderPlugin, PrismaPlugin, ErrorsPlugin],
  relay: {
    clientMutationId: 'optional',
    cursorType: 'String',
    nodeQueryOptions: true,
    nodesQueryOptions: true,
  },
  prisma: {
    client: prisma,
  },
});

// Скаляры
builder.addScalarType('DateTime', DateTimeResolver);

// Error types
const ErrorInterface = builder.interfaceRef<Error>('Error').implement({
  fields: (t) => ({
    message: t.exposeString('message'),
  }),
});

builder.objectType(Error, {
  name: 'BaseError',
  interfaces: [ErrorInterface],
});

// Node типы
const UserNode = builder.prismaNode('User', {
  id: { field: 'id' },
  fields: (t) => ({
    email: t.exposeString('email'),
    name: t.exposeString('name'),
    avatar: t.exposeString('avatar', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    
    // Connections
    postsConnection: t.relatedConnection('posts', {
      cursor: 'id',
      args: {
        filter: t.arg({ type: PostFilterInput }),
        orderBy: t.arg({ type: PostOrderByInput }),
      },
      query: ({ filter, orderBy }) => ({
        where: filter ? buildPostFilter(filter) : undefined,
        orderBy: orderBy ? buildPostOrder(orderBy) : { createdAt: 'desc' },
      }),
      totalCount: true,
    }),
    
    followersConnection: t.relatedConnection('followers', {
      cursor: 'id',
      edgeFields: () => ({
        followedAt: t.expose('createdAt', { type: 'DateTime' }),
      }),
    }),
    
    // Computed fields
    isFollowing: t.boolean({
      args: {
        userId: t.arg.globalID({ required: true }),
      },
      resolve: async (user, { userId }, context) => {
        const { id } = decodeGlobalId(userId);
        return context.loaders.isFollowing.load({ followerId: id, followingId: user.id });
      },
    }),
  }),
});

const PostNode = builder.prismaNode('Post', {
  id: { field: 'id' },
  fields: (t) => ({
    title: t.exposeString('title'),
    content: t.exposeString('content'),
    published: t.exposeBoolean('published'),
    publishedAt: t.expose('publishedAt', { type: 'DateTime', nullable: true }),
    
    author: t.relation('author'),
    
    commentsConnection: t.relatedConnection('comments', {
      cursor: 'id',
      args: {
        orderBy: t.arg({ type: CommentOrderByInput }),
      },
      query: ({ orderBy }) => ({
        orderBy: orderBy || { createdAt: 'desc' },
      }),
    }),
    
    // Stats
    stats: t.loadable({
      type: PostStats,
      load: (ids: string[], context) => context.loaders.postStats.loadMany(ids),
      resolve: (post) => post.id,
    }),
  }),
});

// Input types
const PostFilterInput = builder.inputType('PostFilterInput', {
  fields: (t) => ({
    published: t.boolean(),
    authorId: t.globalID(),
    createdAfter: t.field({ type: 'DateTime' }),
    search: t.string(),
  }),
});

const PostOrderByInput = builder.enumType('PostOrderByInput', {
  values: {
    CREATED_AT_ASC: { value: { createdAt: 'asc' } },
    CREATED_AT_DESC: { value: { createdAt: 'desc' } },
    POPULARITY: { value: 'popularity' },
  },
});

// Query type
builder.queryType({
  fields: (t) => ({
    viewer: t.field({
      type: UserNode,
      nullable: true,
      resolve: (_, __, context) => context.user,
    }),
    
    // Relay node/nodes queries добавляются автоматически
    
    usersConnection: t.prismaConnection({
      type: 'User',
      cursor: 'id',
      args: {
        search: t.arg.string(),
      },
      resolve: (query, _, { search }) =>
        prisma.user.findMany({
          ...query,
          where: search ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          } : undefined,
        }),
    }),
    
    feedConnection: t.connection({
      type: PostNode,
      args: {
        filter: t.arg({ type: FeedFilter }),
      },
      resolve: async (_, args, context) => {
        return resolveCursorConnection(
          {
            args,
            toCursor: (post) => post.id,
          },
          async ({ limit, offset }) => {
            const posts = await context.prisma.post.findMany({
              where: {
                published: true,
                ...(args.filter && buildFeedFilter(args.filter)),
              },
              orderBy: [
                { featured: 'desc' },
                { publishedAt: 'desc' },
              ],
              skip: offset,
              take: limit,
              include: {
                author: true,
                _count: { select: { comments: true, likes: true } },
              },
            });
            
            return posts;
          }
        );
      },
    }),
  }),
});

// Mutations
builder.mutationType({
  fields: (t) => ({
    // Create post mutation
    createPost: t.relayMutationField(
      'createPost',
      {
        inputFields: (t) => ({
          title: t.string({ required: true }),
          content: t.string({ required: true }),
          published: t.boolean({ defaultValue: false }),
        }),
        resolve: async (_, { input }, context) => {
          if (!context.user) {
            throw new Error('Must be logged in to create posts');
          }
          
          const post = await context.prisma.post.create({
            data: {
              title: input.title,
              content: input.content,
              published: input.published,
              publishedAt: input.published ? new Date() : null,
              authorId: context.user.id,
            },
          });
          
          // Invalidate caches
          context.loaders.postsByUser.clear(context.user.id);
          
          return { post };
        },
        outputFields: (t) => ({
          post: t.field({
            type: PostNode,
            resolve: (payload) => payload.post,
          }),
          postEdge: t.edge({
            type: PostNode,
            resolve: (payload) => ({
              cursor: payload.post.id,
              node: payload.post,
            }),
          }),
        }),
      }
    ),
    
    // Follow user mutation
    followUser: t.relayMutationField(
      'followUser',
      {
        inputFields: (t) => ({
          userId: t.globalID({ required: true }),
        }),
        resolve: async (_, { input }, context) => {
          if (!context.user) {
            throw new Error('Must be logged in');
          }
          
          const { type, id: targetUserId } = decodeGlobalId(input.userId);
          
          if (type !== 'User') {
            throw new Error('Invalid user ID');
          }
          
          const follow = await context.prisma.follow.create({
            data: {
              followerId: context.user.id,
              followingId: targetUserId,
            },
          });
          
          // Clear relevant caches
          context.loaders.followersCount.clear(targetUserId);
          context.loaders.followingCount.clear(context.user.id);
          
          return {
            follow,
            follower: context.user,
            following: await context.prisma.user.findUnique({ 
              where: { id: targetUserId } 
            }),
          };
        },
        outputFields: (t) => ({
          follower: t.field({
            type: UserNode,
            resolve: (payload) => payload.follower,
          }),
          following: t.field({
            type: UserNode,
            resolve: (payload) => payload.following!,
          }),
        }),
        errors: {
          types: [Error],
        },
      }
    ),
  }),
});

// Subscriptions (если используете)
builder.subscriptionType({
  fields: (t) => ({
    postAdded: t.field({
      type: PostNode,
      args: {
        authorId: t.arg.globalID(),
      },
      subscribe: async function* (_, { authorId }, context) {
        const id = authorId ? decodeGlobalId(authorId).id : null;
        
        for await (const post of context.pubsub.subscribe('POST_ADDED')) {
          if (!id || post.authorId === id) {
            yield post;
          }
        }
      },
      resolve: (post) => post,
    }),
  }),
});

// Export schema
export const schema = builder.toSchema();
```

### Утилиты и хелперы

```typescript
// utils/relay.ts
import { encodeGlobalId, decodeGlobalId } from '@pothos/plugin-relay';

// Хелпер для безопасного декодирования global ID
export function safeDecodeGlobalId(globalId: string, expectedType?: string) {
  try {
    const decoded = decodeGlobalId(globalId);
    
    if (expectedType && decoded.type !== expectedType) {
      throw new Error(`Expected ${expectedType} ID, got ${decoded.type}`);
    }
    
    return decoded;
  } catch (error) {
    throw new Error('Invalid ID format');
  }
}

// Хелпер для создания connection из Prisma результатов
export function createConnection<T>(
  nodes: T[],
  args: ConnectionArgs,
  getCursor: (node: T) => string,
  hasMore: boolean = false
) {
  const edges = nodes.map(node => ({
    cursor: getCursor(node),
    node,
  }));
  
  return {
    edges,
    pageInfo: {
      hasNextPage: hasMore || nodes.length === (args.first || 0),
      hasPreviousPage: !!args.after,
      startCursor: edges[0]?.cursor || null,
      endCursor: edges[edges.length - 1]?.cursor || null,
    },
  };
}

// DataLoader factories
export function createLoaders(prisma: PrismaClient) {
  return {
    users: new DataLoader<string, User>(async (ids) => {
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
      });
      return ids.map(id => users.find(u => u.id === id) || null);
    }),
    
    postsByUser: new DataLoader<string, Post[]>(async (userIds) => {
      const posts = await prisma.post.findMany({
        where: { authorId: { in: [...userIds] } },
        orderBy: { createdAt: 'desc' },
      });
      
      const grouped = groupBy(posts, 'authorId');
      return userIds.map(id => grouped[id] || []);
    }),
    
    postStats: new DataLoader<string, PostStats>(async (postIds) => {
      const stats = await prisma.post.findMany({
        where: { id: { in: [...postIds] } },
        select: {
          id: true,
          _count: {
            select: { comments: true, likes: true },
          },
        },
      });
      
      return postIds.map(id => {
        const stat = stats.find(s => s.id === id);
        return stat ? {
          commentsCount: stat._count.comments,
          likesCount: stat._count.likes,
        } : { commentsCount: 0, likesCount: 0 };
      });
    }),
  };
}
```

## Заключение

Relay плагин для Pothos предоставляет полнофункциональную поддержку спецификации Relay с отличной производительностью и типобезопасностью. Используйте DataLoader для оптимизации, следуйте best practices для глобальных ID и connections, и ваше приложение будет готово к масштабированию с Relay.