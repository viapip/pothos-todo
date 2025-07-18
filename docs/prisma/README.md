# Prisma

Prisma - это современный ORM (Object-Relational Mapping) инструмент для Node.js и TypeScript, который упрощает работу с базами данных.

## Установка

```bash
bun add prisma @prisma/client
```

## Инициализация

```bash
bunx prisma init
```

Эта команда создает:
- `prisma/schema.prisma` - файл схемы Prisma
- `.env` - файл для переменных окружения

## Основные концепции

### Схема Prisma

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

// Генератор для Pothos типов
generator pothos {
  provider = "prisma-pothos-types"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Модели
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  posts     Post[]
  profile   Profile?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
}

model Profile {
  id     String  @id @default(cuid())
  bio    String?
  avatar String?
  userId String  @unique
  user   User    @relation(fields: [userId], references: [id])
}

model Post {
  id          String    @id @default(cuid())
  title       String
  content     String
  published   Boolean   @default(false)
  authorId    String
  author      User      @relation(fields: [authorId], references: [id])
  categories  Category[]
  comments    Comment[]
  publishedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([authorId])
  @@index([published])
}

model Category {
  id    String @id @default(cuid())
  name  String @unique
  posts Post[]
}

model Comment {
  id        String   @id @default(cuid())
  text      String
  postId    String
  post      Post     @relation(fields: [postId], references: [id])
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())

  @@index([postId])
}

enum Role {
  USER
  ADMIN
}
```

### Миграции

```bash
# Создать миграцию
bunx prisma migrate dev --name init

# Применить миграции в продакшене
bunx prisma migrate deploy

# Сбросить базу данных
bunx prisma migrate reset

# Просмотр состояния миграций
bunx prisma migrate status
```

### Prisma Client

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Или с логированием
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

## CRUD операции

### Create

```typescript
// Создание одной записи
const user = await prisma.user.create({
  data: {
    email: 'alice@example.com',
    name: 'Alice',
    profile: {
      create: {
        bio: 'Software developer',
      },
    },
  },
  include: {
    profile: true,
  },
});

// Создание нескольких записей
const users = await prisma.user.createMany({
  data: [
    { email: 'bob@example.com', name: 'Bob' },
    { email: 'charlie@example.com', name: 'Charlie' },
  ],
});
```

### Read

```typescript
// Найти одну запись
const user = await prisma.user.findUnique({
  where: { email: 'alice@example.com' },
});

// Найти первую подходящую запись
const firstAdmin = await prisma.user.findFirst({
  where: { role: 'ADMIN' },
});

// Найти все записи
const allUsers = await prisma.user.findMany({
  where: {
    email: { contains: '@example.com' },
  },
  orderBy: { createdAt: 'desc' },
  take: 10,
  skip: 0,
});

// С включением связей
const usersWithPosts = await prisma.user.findMany({
  include: {
    posts: {
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
    },
    _count: {
      select: { posts: true },
    },
  },
});
```

### Update

```typescript
// Обновить одну запись
const updatedUser = await prisma.user.update({
  where: { id: userId },
  data: {
    name: 'Alice Smith',
    profile: {
      update: {
        bio: 'Senior Software Developer',
      },
    },
  },
});

// Обновить несколько записей
const updateCount = await prisma.post.updateMany({
  where: {
    authorId: userId,
    published: false,
  },
  data: {
    published: true,
    publishedAt: new Date(),
  },
});

// Upsert (создать или обновить)
const user = await prisma.user.upsert({
  where: { email: 'alice@example.com' },
  update: { name: 'Alice' },
  create: {
    email: 'alice@example.com',
    name: 'Alice',
  },
});
```

### Delete

```typescript
// Удалить одну запись
const deletedUser = await prisma.user.delete({
  where: { id: userId },
});

// Удалить несколько записей
const deleteCount = await prisma.comment.deleteMany({
  where: {
    createdAt: {
      lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 дней назад
    },
  },
});
```

## Расширенные возможности

### Транзакции

```typescript
// Интерактивные транзакции
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { email: 'test@example.com', name: 'Test' },
  });

  const post = await tx.post.create({
    data: {
      title: 'First Post',
      content: 'Content',
      authorId: user.id,
    },
  });

  return { user, post };
});

// Batch транзакции
const [userCount, postCount] = await prisma.$transaction([
  prisma.user.count(),
  prisma.post.count(),
]);
```

### Raw SQL

```typescript
// Выполнение raw SQL
const result = await prisma.$queryRaw`
  SELECT * FROM "User" 
  WHERE email = ${email}
`;

// С типизацией
interface UserEmail {
  id: string;
  email: string;
}

const users = await prisma.$queryRaw<UserEmail[]>`
  SELECT id, email FROM "User"
`;

// Выполнение команд (не возвращает данные)
await prisma.$executeRaw`
  UPDATE "User" SET "updatedAt" = NOW() WHERE id = ${userId}
`;
```

### Агрегация

```typescript
// Count
const userCount = await prisma.user.count({
  where: { role: 'USER' },
});

// Aggregate
const postStats = await prisma.post.aggregate({
  _count: { _all: true },
  _avg: { views: true },
  _sum: { views: true },
  _min: { publishedAt: true },
  _max: { publishedAt: true },
});

// Group by
const postsByAuthor = await prisma.post.groupBy({
  by: ['authorId'],
  _count: { _all: true },
  where: { published: true },
  orderBy: {
    _count: { id: 'desc' },
  },
});
```

### Middleware

```typescript
// Логирование запросов
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();
  
  console.log(`Query ${params.model}.${params.action} took ${after - before}ms`);
  
  return result;
});

// Soft delete
prisma.$use(async (params, next) => {
  if (params.model === 'Post') {
    if (params.action === 'delete') {
      params.action = 'update';
      params.args['data'] = { deletedAt: new Date() };
    }
    
    if (params.action === 'deleteMany') {
      params.action = 'updateMany';
      params.args['data'] = { deletedAt: new Date() };
    }
  }
  
  return next(params);
});
```

## Оптимизация производительности

### Connection pooling

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Настройки пула соединений устанавливаются в URL:
  // postgresql://user:password@localhost:5432/db?connection_limit=10&pool_timeout=20
});
```

### Правильное использование include/select

```typescript
// Плохо - загружает все поля
const users = await prisma.user.findMany({
  include: {
    posts: true,
    profile: true,
  },
});

// Хорошо - загружает только нужные поля
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    posts: {
      select: {
        id: true,
        title: true,
      },
      where: { published: true },
    },
  },
});
```

### Индексы

```prisma
model User {
  id    String @id
  email String @unique
  name  String
  role  Role

  // Составной индекс
  @@index([name, role])
  
  // Индекс для полнотекстового поиска (PostgreSQL)
  @@index([name, email], type: GIN)
}
```

## Лучшие практики

1. **Используйте миграции** для изменения схемы базы данных
2. **Типизируйте raw запросы** для безопасности типов
3. **Используйте транзакции** для связанных операций
4. **Оптимизируйте запросы** с помощью select вместо include
5. **Создавайте индексы** для часто используемых полей в WHERE
6. **Используйте connection pooling** в продакшене
7. **Обрабатывайте ошибки** специфичные для Prisma

## Интеграция с Pothos

```typescript
// prisma/schema.prisma
generator pothos {
  provider = "prisma-pothos-types"
}

// В коде
import type PrismaTypes from '@pothos/plugin-prisma/generated';

const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
}>({
  plugins: [PrismaPlugin],
  prisma: {
    client: prisma,
  },
});
```