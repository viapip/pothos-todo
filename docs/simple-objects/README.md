# @pothos/plugin-simple-objects

Плагин Simple Objects для Pothos позволяет создавать GraphQL объектные типы из простых JavaScript/TypeScript объектов без необходимости определения классов.

## Установка

```bash
bun add @pothos/plugin-simple-objects
```

## Конфигурация

```typescript
import SchemaBuilder from '@pothos/core';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';

const builder = new SchemaBuilder({
  plugins: [SimpleObjectsPlugin],
});
```

## Основные концепции

### Создание простых объектов

```typescript
// Определяем интерфейс
interface UserShape {
  id: string;
  name: string;
  email: string;
  age: number;
}

// Создаем простой объект
const User = builder.simpleObject('User', {
  description: 'Пользователь системы',
  fields: (t) => ({
    id: t.id(),
    name: t.string(),
    email: t.string(),
    age: t.int(),
  }),
});
```

### Использование в резолверах

```typescript
builder.queryType({
  fields: (t) => ({
    me: t.field({
      type: User,
      resolve: () => ({
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      }),
    }),
    
    users: t.field({
      type: [User],
      resolve: async () => {
        const users = await getUsersFromDatabase();
        return users;
      },
    }),
  }),
});
```

## Работа с интерфейсами

### Определение интерфейса

```typescript
interface NodeShape {
  id: string;
}

const Node = builder.simpleInterface('Node', {
  fields: (t) => ({
    id: t.id(),
  }),
});
```

### Реализация интерфейса

```typescript
interface ProductShape extends NodeShape {
  name: string;
  price: number;
}

const Product = builder.simpleObject('Product', {
  interfaces: [Node],
  fields: (t) => ({
    id: t.id(),
    name: t.string(),
    price: t.float(),
  }),
});
```

## Вложенные объекты

```typescript
interface AddressShape {
  street: string;
  city: string;
  country: string;
}

interface UserWithAddressShape {
  id: string;
  name: string;
  address: AddressShape;
}

// Адрес как простой объект
const Address = builder.simpleObject('Address', {
  fields: (t) => ({
    street: t.string(),
    city: t.string(),
    country: t.string(),
  }),
});

// Пользователь с адресом
const UserWithAddress = builder.simpleObject('UserWithAddress', {
  fields: (t) => ({
    id: t.id(),
    name: t.string(),
    address: t.field({
      type: Address,
      resolve: (user) => user.address,
    }),
  }),
});
```

## Динамические поля

```typescript
interface PostShape {
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: Date;
}

const Post = builder.simpleObject('Post', {
  fields: (t) => ({
    id: t.id(),
    title: t.string(),
    content: t.string(),
    
    // Вычисляемое поле
    excerpt: t.string({
      resolve: (post) => post.content.slice(0, 100) + '...',
    }),
    
    // Форматированная дата
    createdAt: t.string({
      resolve: (post) => post.createdAt.toISOString(),
    }),
    
    // Связанный объект
    author: t.field({
      type: User,
      resolve: async (post) => {
        return getUserById(post.authorId);
      },
    }),
  }),
});
```

## Union типы

```typescript
// Интерфейсы для разных типов результатов
interface SuccessShape {
  success: true;
  data: string;
}

interface ErrorShape {
  success: false;
  error: string;
}

type ResultShape = SuccessShape | ErrorShape;

// Определяем объекты
const Success = builder.simpleObject('Success', {
  fields: (t) => ({
    success: t.boolean(),
    data: t.string(),
  }),
});

const Error = builder.simpleObject('Error', {
  fields: (t) => ({
    success: t.boolean(),
    error: t.string(),
  }),
});

// Union тип
const Result = builder.unionType('Result', {
  types: [Success, Error],
  resolveType: (value) => {
    return value.success ? 'Success' : 'Error';
  },
});
```

## Использование с аргументами

```typescript
interface PageInfoShape {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

interface ConnectionShape<T> {
  edges: Array<{
    node: T;
    cursor: string;
  }>;
  pageInfo: PageInfoShape;
}

// PageInfo объект
const PageInfo = builder.simpleObject('PageInfo', {
  fields: (t) => ({
    hasNextPage: t.boolean(),
    hasPreviousPage: t.boolean(),
    startCursor: t.string({ nullable: true }),
    endCursor: t.string({ nullable: true }),
  }),
});

// Generic функция для создания connections
function createConnection<T>(
  name: string,
  nodeType: any,
) {
  const Edge = builder.simpleObject(`${name}Edge`, {
    fields: (t) => ({
      node: t.field({
        type: nodeType,
        resolve: (edge) => edge.node,
      }),
      cursor: t.string(),
    }),
  });

  return builder.simpleObject(`${name}Connection`, {
    fields: (t) => ({
      edges: t.field({
        type: [Edge],
        resolve: (connection) => connection.edges,
      }),
      pageInfo: t.field({
        type: PageInfo,
        resolve: (connection) => connection.pageInfo,
      }),
    }),
  });
}

// Использование
const UserConnection = createConnection<UserShape>('User', User);
```

## Циклические зависимости

```typescript
// Используем refs для циклических зависимостей
const CommentRef = builder.objectRef<CommentShape>('Comment');
const PostWithCommentsRef = builder.objectRef<PostWithCommentsShape>('PostWithComments');

interface CommentShape {
  id: string;
  text: string;
  postId: string;
}

interface PostWithCommentsShape {
  id: string;
  title: string;
  comments: CommentShape[];
}

// Определяем Comment
builder.objectType(CommentRef, {
  fields: (t) => ({
    id: t.exposeID('id'),
    text: t.exposeString('text'),
    post: t.field({
      type: PostWithCommentsRef,
      resolve: (comment) => getPostById(comment.postId),
    }),
  }),
});

// Определяем Post
builder.objectType(PostWithCommentsRef, {
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    comments: t.field({
      type: [CommentRef],
      resolve: (post) => post.comments,
    }),
  }),
});
```

## Лучшие практики

1. **Используйте интерфейсы TypeScript** для типобезопасности
2. **Разделяйте shape интерфейсы и GraphQL объекты** для гибкости
3. **Используйте refs** для циклических зависимостей
4. **Группируйте связанные объекты** в модули
5. **Документируйте поля** с помощью description

## Полный пример

```typescript
import SchemaBuilder from '@pothos/core';
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects';

const builder = new SchemaBuilder({
  plugins: [SimpleObjectsPlugin],
});

// Интерфейсы данных
interface UserData {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

interface PostData {
  id: string;
  title: string;
  content: string;
  authorId: string;
  tags: string[];
  publishedAt: Date | null;
}

// Enum для ролей
const UserRole = builder.enumType('UserRole', {
  values: {
    USER: { value: 'USER' },
    ADMIN: { value: 'ADMIN' },
  },
});

// User объект
const User = builder.simpleObject('User', {
  description: 'Пользователь блога',
  fields: (t) => ({
    id: t.id({ description: 'Уникальный идентификатор' }),
    username: t.string({ description: 'Имя пользователя' }),
    email: t.string({ description: 'Email адрес' }),
    role: t.field({
      type: UserRole,
      description: 'Роль пользователя',
      resolve: (user) => user.role,
    }),
  }),
});

// Post объект
const Post = builder.simpleObject('Post', {
  description: 'Пост в блоге',
  fields: (t) => ({
    id: t.id(),
    title: t.string(),
    content: t.string(),
    tags: t.stringList(),
    
    isPublished: t.boolean({
      description: 'Опубликован ли пост',
      resolve: (post) => post.publishedAt !== null,
    }),
    
    publishedAt: t.string({
      nullable: true,
      description: 'Дата публикации',
      resolve: (post) => post.publishedAt?.toISOString() || null,
    }),
    
    author: t.field({
      type: User,
      description: 'Автор поста',
      resolve: async (post) => {
        return getUserById(post.authorId);
      },
    }),
  }),
});

// Query
builder.queryType({
  fields: (t) => ({
    posts: t.field({
      type: [Post],
      args: {
        published: t.arg.boolean({ defaultValue: true }),
      },
      resolve: async (_, { published }) => {
        const posts = await getPostsFromDatabase();
        return posts.filter(post => 
          published ? post.publishedAt !== null : true
        );
      },
    }),
  }),
});

export const schema = builder.toSchema();
```