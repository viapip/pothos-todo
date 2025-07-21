# prisma-generator-pothos-codegen

Генератор Prisma для автоматического создания CRUD GraphQL операций и input типов для Pothos.

## Обзор

`prisma-generator-pothos-codegen` — это генератор кода, который автоматически создает полнофункциональный GraphQL CRUD API на основе Prisma схемы. В отличие от `@pothos/plugin-prisma`, который предоставляет runtime API для создания типов, этот генератор создает готовые файлы с GraphQL типами, запросами и мутациями.

### Отличия от @pothos/plugin-prisma

| Аспект | @pothos/plugin-prisma | prisma-generator-pothos-codegen |
|--------|----------------------|--------------------------------|
| **Тип** | Runtime плагин | Генератор кода |
| **Создание типов** | Ручное с помощью API | Автоматическое |
| **CRUD операции** | Требует написания | Генерируются автоматически |
| **Кастомизация** | Полная во время выполнения | Через конфигурацию и расширение |
| **Обслуживание** | Больше кода | Меньше boilerplate |

## Установка

```bash
bun add -D prisma-generator-pothos-codegen
```

### Peer Dependencies

```bash
bun add @pothos/core @pothos/plugin-prisma @prisma/client prisma
```

## Настройка в проекте

### 1. Генератор в Prisma схеме

В файле `prisma/schema.prisma`:

```prisma
generator pothosCrud {
  provider = "prisma-generator-pothos-codegen"
  generatorConfigPath = "../pothos.config.cjs"
}
```

### 2. Конфигурационный файл

Файл `pothos.config.cjs` в корне проекта:

```javascript
// ./pothos.config.js

/** @type {import('prisma-generator-pothos-codegen').Config} */
module.exports = {
  inputs: {
    outputFilePath: './src/graphql/__generated__/inputs.ts',
  },
  crud: {
    outputDir: './src/graphql/__generated__/',
    inputsImporter: `import * as Inputs from '@/graphql/__generated__/inputs';`,
    resolverImports: `\\nimport prisma from '@/lib/prisma';`,
    prismaCaller: 'prisma',
  },
  global: {
    builderLocation: './src/api/schema/builder.ts',
  },
};
```

### 3. Запуск генерации

```bash
bun run db:generate
# или
bunx prisma generate
```

## Структура генерируемых файлов

После запуска генератора создается следующая структура:

```
src/graphql/__generated__/
├── inputs.ts                    # Input типы для всех моделей
├── objects.ts                   # Объектные типы
├── autocrud.ts                  # CRUD операции
├── utils.ts                     # Утилиты
├── User/
│   ├── index.ts
│   ├── object.base.ts           # Базовый объект User
│   ├── queries/
│   │   ├── index.ts
│   │   ├── findFirst.base.ts    # Запрос findFirst
│   │   ├── findMany.base.ts     # Запрос findMany
│   │   ├── findUnique.base.ts   # Запрос findUnique
│   │   └── count.base.ts        # Запрос count
│   └── mutations/
│       ├── index.ts
│       ├── createOne.base.ts    # Мутация создания
│       ├── createMany.base.ts   # Мутация массового создания
│       ├── updateOne.base.ts    # Мутация обновления
│       ├── updateMany.base.ts   # Мутация массового обновления
│       ├── deleteOne.base.ts    # Мутация удаления
│       ├── deleteMany.base.ts   # Мутация массового удаления
│       └── upsertOne.base.ts    # Мутация upsert
├── Todo/
│   └── ... (аналогичная структура)
├── TodoList/
│   └── ... (аналогичная структура)
└── DomainEvent/
    └── ... (аналогичная структура)
```

## Использование генерируемого кода

### Input типы

Файл `inputs.ts` содержит все необходимые GraphQL input типы:

```typescript
// Автоматически генерируемые типы
export const UserWhereInput = builder.inputType('UserWhereInput', {
  fields: (t) => ({
    id: t.field({ type: StringFilter, required: false }),
    email: t.field({ type: StringFilter, required: false }),
    name: t.field({ type: StringFilter, required: false }),
    // ... другие поля
  }),
});

export const UserCreateInput = builder.inputType('UserCreateInput', {
  fields: (t) => ({
    email: t.string({ required: true }),
    name: t.string({ required: false }),
    // ... отношения
  }),
});
```

### Объектные типы

```typescript
// src/graphql/__generated__/User/object.base.ts
export const UserObject = defineObject('User', {
  description: undefined,
  findUnique: (fields) => ({ id: fields.id }),
  fields: (t) => ({
    id: t.exposeID('id', { nullable: false }),
    email: t.exposeString('email', { nullable: false }),
    name: t.exposeString('name', { nullable: true }),
    createdAt: t.expose('createdAt', { type: DateTime, nullable: false }),
    updatedAt: t.expose('updatedAt', { type: DateTime, nullable: false }),
  }),
});
```

### Запросы

```typescript
// src/graphql/__generated__/User/queries/findMany.base.ts
export const findManyUserQueryObject = defineQueryFunction((t) =>
  defineQueryPrismaObject({
    type: ['User'],
    nullable: false,
    args: findManyUserQueryArgs,
    resolve: async (query, _root, args, _context, _info) =>
      await prisma.user.findMany({
        where: args.where || undefined,
        cursor: args.cursor || undefined,
        take: args.take || undefined,
        distinct: args.distinct || undefined,
        skip: args.skip || undefined,
        orderBy: args.orderBy || undefined,
        ...query,
      }),
  }),
);
```

### Мутации

```typescript
// src/graphql/__generated__/User/mutations/createOne.base.ts
export const createOneUserMutationObject = defineMutationFunction((t) =>
  defineMutationPrismaObject({
    type: 'User',
    nullable: false,
    args: createOneUserMutationArgs,
    resolve: async (query, _root, args, _context, _info) =>
      await prisma.user.create({ data: args.data, ...query }),
  }),
);
```

## Интеграция в схему

Чтобы использовать сгенерированные типы, импортируйте их в основную схему:

```typescript
// src/api/schema/schema.ts
import { builder } from './builder';

// Импорт сгенерированных объектов
import '../../../graphql/__generated__/User';
import '../../../graphql/__generated__/Todo';
import '../../../graphql/__generated__/TodoList';

// Импорт и использование запросов/мутаций
import { findManyUserQueryObject } from '../../graphql/__generated__/User/queries';
import { createOneUserMutationObject } from '../../graphql/__generated__/User/mutations';

builder.queryType({
  fields: (t) => ({
    users: findManyUserQueryObject(t),
    // ... другие запросы
  }),
});

builder.mutationType({
  fields: (t) => ({
    createUser: createOneUserMutationObject(t),
    // ... другие мутации
  }),
});

export const schema = builder.toSchema();
```

## Кастомизация

### 1. Исключение полей из input типов

Используйте аннотацию `@Pothos.omit()` в Prisma схеме:

```prisma
model User {
  id        String   @id @default(cuid()) /// @Pothos.omit(create, update)
  email     String   @unique
  password  String   /// @Pothos.omit(output)
  createdAt DateTime @default(now()) /// @Pothos.omit(create, update)
  updatedAt DateTime @updatedAt /// @Pothos.omit(create, update)
}
```

### 2. Расширение сгенерированных типов

Создайте кастомные файлы рядом с базовыми:

```typescript
// src/graphql/User/queries/findMany.ts
import { findManyUserQueryObject as baseFindMany } from '../__generated__/User/queries/findMany.base';

export const findManyUserQueryObject = defineQueryFunction((t) =>
  baseFindMany(t).extend({
    // Добавьте кастомную логику
    resolve: async (query, root, args, context, info) => {
      // Проверка авторизации
      if (!context.user) {
        throw new Error('Unauthorized');
      }
      
      // Вызов базового resolver
      return baseFindMany.resolve(query, root, args, context, info);
    },
  }),
);
```

### 3. Добавление кастомных полей

```typescript
// src/api/schema/types/User.ts
import { UserObject as BaseUserObject } from '../../../graphql/__generated__/User/object.base';

builder.prismaObjectFields(BaseUserObject, (t) => ({
  // Добавляем кастомное поле
  fullName: t.string({
    select: {
      name: true,
      email: true,
    },
    resolve: (user) => user.name || user.email.split('@')[0],
  }),
  
  // Кастомное отношение с фильтрацией
  activeTodos: t.relation('todos', {
    query: {
      where: {
        status: { not: 'COMPLETED' },
      },
    },
  }),
}));
```

## Конфигурационные опции

### inputs

```javascript
inputs: {
  outputFilePath: './src/graphql/__generated__/inputs.ts',
  // Путь для генерации input типов
}
```

### crud

```javascript
crud: {
  outputDir: './src/graphql/__generated__/',     // Директория для CRUD файлов
  inputsImporter: `import * as Inputs from '@/graphql/__generated__/inputs';`, // Импорт input типов
  resolverImports: `\\nimport prisma from '@/lib/prisma';`, // Дополнительные импорты
  prismaCaller: 'prisma',                        // Имя Prisma клиента
  
  // Опциональные настройки:
  disabled: false,                               // Отключить генерацию CRUD
  includeResolvers: ['User', 'Todo'],           // Генерировать только для указанных моделей
  excludeResolvers: ['DomainEvent'],            // Исключить указанные модели
  
  // Кастомизация отдельных операций:
  excludeOperations: ['deleteMany'],            // Исключить операции
  onlyOperations: ['create', 'read'],           // Только указанные операции
}
```

### global

```javascript
global: {
  builderLocation: './src/api/schema/builder.ts', // Путь к builder
  // Другие глобальные настройки
}
```

## Рабочий процесс

1. **Модификация Prisma схемы** — добавляете/изменяете модели
2. **Запуск генерации** — `bun run db:generate`
3. **Обновление схемы** — добавляете новые типы в основную GraphQL схему
4. **Кастомизация** — расширяете сгенерированные типы при необходимости

## Лучшие практики

1. **Не редактируйте базовые файлы** — они перезаписываются при каждой генерации
2. **Используйте расширения** — создавайте кастомные файлы для дополнительной логики
3. **Группируйте импорты** — организуйте импорты сгенерированных типов
4. **Применяйте аннотации** — используйте `@Pothos.omit()` для точного контроля
5. **Версионирование** — фиксируйте сгенерированные файлы в git для прозрачности

## Интеграция с существующим кодом

В этом проекте генератор интегрирован с:

- **@pothos/plugin-prisma** — для дополнительных возможностей
- **GraphQL Yoga** — в качестве сервера
- **Federation** — для микросервисной архитектуры
- **Relay** — для пагинации и connections

## Примеры использования

### Базовый CRUD API

```typescript
// Импорт всех сгенерированных операций
import './graphql/__generated__/autocrud';

// Или выборочный импорт
import { findManyUserQueryObject } from './graphql/__generated__/User/queries';
import { createOneUserMutationObject } from './graphql/__generated__/User/mutations';

builder.queryType({
  fields: (t) => ({
    users: findManyUserQueryObject(t),
  }),
});

builder.mutationType({
  fields: (t) => ({
    createUser: createOneUserMutationObject(t),
  }),
});
```

### Кастомизированный API

```typescript
// Расширение с авторизацией и валидацией
export const secureCreateUserMutation = defineMutationFunction((t) =>
  createOneUserMutationObject(t).extend({
    args: (t) => ({
      ...createOneUserMutationArgs(t),
      // Дополнительные аргументы
      agreeToTerms: t.boolean({ required: true }),
    }),
    resolve: async (query, root, args, context, info) => {
      // Проверка авторизации
      if (!context.isAdmin) {
        throw new Error('Only admins can create users');
      }
      
      // Валидация
      if (!args.agreeToTerms) {
        throw new Error('Must agree to terms');
      }
      
      // Вызов базового resolver
      return createOneUserMutationObject.resolve(query, root, args, context, info);
    },
  }),
);
```

## Обновление и миграции

При обновлении версии генератора:

1. Проверьте changelog для breaking changes
2. Обновите конфигурацию при необходимости
3. Перегенерируйте код: `bunx prisma generate`
4. Проверьте кастомные расширения на совместимость
5. Обновите импорты в основной схеме

## Отладка

### Проверка конфигурации

```bash
# Проверка корректности настроек
bunx prisma generate --schema=./prisma/schema.prisma
```

### Общие проблемы

1. **"Generator not found"** — проверьте установку пакета
2. **"Config file not found"** — проверьте путь в `generatorConfigPath`
3. **Ошибки импорта** — проверьте пути в `inputsImporter` и `resolverImports`
4. **Типы не генерируются** — проверьте конфигурацию `crud` секции

## Заключение

`prisma-generator-pothos-codegen` значительно ускоряет разработку GraphQL API, автоматизируя создание boilerplate кода. В сочетании с `@pothos/plugin-prisma` обеспечивает мощную и гибкую основу для создания type-safe GraphQL приложений.