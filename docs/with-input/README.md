# @pothos/plugin-with-input

Плагин With Input для Pothos упрощает создание полей с input объектами, автоматически генерируя input типы на основе предоставленной конфигурации.

## Установка

```bash
bun add @pothos/plugin-with-input
```

## Конфигурация

```typescript
import SchemaBuilder from '@pothos/core';
import WithInputPlugin from '@pothos/plugin-with-input';

const builder = new SchemaBuilder({
  plugins: [WithInputPlugin],
});
```

## Основные концепции

### fieldWithInput

Создает поле с автоматически сгенерированным input типом:

```typescript
builder.queryType({
  fields: (t) => ({
    hello: t.fieldWithInput({
      type: 'String',
      input: {
        name: t.input.string({ required: true }),
      },
      resolve: (parent, args) => `Hello, ${args.input.name}!`,
    }),
  }),
});
```

Это сгенерирует следующую схему:
```graphql
type Query {
  hello(input: QueryHelloInput!): String!
}

input QueryHelloInput {
  name: String!
}
```

### Кастомизация имени input типа

```typescript
builder.queryType({
  fields: (t) => ({
    search: t.fieldWithInput({
      type: 'String',
      typeOptions: {
        name: 'SearchInput', // Кастомное имя для input типа
      },
      input: {
        query: t.input.string({ required: true }),
        limit: t.input.int({ defaultValue: 10 }),
      },
      resolve: (parent, args) => {
        // args.input.query и args.input.limit доступны здесь
        return `Searching for: ${args.input.query}`;
      },
    }),
  }),
});
```

### Интеграция с Prisma

При использовании с `@pothos/plugin-prisma`:

```typescript
builder.queryField('user', (t) =>
  t.prismaFieldWithInput({
    type: 'User',
    input: {
      id: t.input.id({ required: true }),
    },
    resolve: (query, _, args) =>
      prisma.user.findUnique({
        where: {
          id: Number.parseInt(args.input.id, 10),
        },
        ...query,
      }),
  }),
);
```

### Mutation с input

```typescript
builder.mutationType({
  fields: (t) => ({
    createPost: t.fieldWithInput({
      type: Post,
      input: {
        title: t.input.string({ required: true }),
        content: t.input.string({ required: true }),
        authorId: t.input.id({ required: true }),
      },
      resolve: async (_, args) => {
        return prisma.post.create({
          data: {
            title: args.input.title,
            content: args.input.content,
            authorId: Number(args.input.authorId),
          },
        });
      },
    }),
  }),
});
```

## Продвинутые возможности

### Вложенные input объекты

```typescript
const AddressInput = builder.inputType('AddressInput', {
  fields: (t) => ({
    street: t.string({ required: true }),
    city: t.string({ required: true }),
    country: t.string({ required: true }),
  }),
});

builder.mutationType({
  fields: (t) => ({
    updateUser: t.fieldWithInput({
      type: User,
      input: {
        id: t.input.id({ required: true }),
        name: t.input.string(),
        email: t.input.string(),
        address: t.input.field({ type: AddressInput }),
      },
      resolve: async (_, args) => {
        // Обновление пользователя
      },
    }),
  }),
});
```

### Переиспользование input типов

```typescript
// Создаем переиспользуемый input тип
const PaginationInput = builder.inputType('PaginationInput', {
  fields: (t) => ({
    limit: t.int({ defaultValue: 20 }),
    offset: t.int({ defaultValue: 0 }),
  }),
});

// Используем в нескольких местах
builder.queryType({
  fields: (t) => ({
    posts: t.fieldWithInput({
      type: [Post],
      input: {
        pagination: t.input.field({ type: PaginationInput }),
        filter: t.input.string(),
      },
      resolve: async (_, args) => {
        // Логика с пагинацией
      },
    }),
    users: t.fieldWithInput({
      type: [User],
      input: {
        pagination: t.input.field({ type: PaginationInput }),
        role: t.input.string(),
      },
      resolve: async (_, args) => {
        // Логика с пагинацией
      },
    }),
  }),
});
```

### Валидация с Zod

При использовании с `@pothos/plugin-zod`:

```typescript
builder.mutationType({
  fields: (t) => ({
    register: t.fieldWithInput({
      type: User,
      input: {
        email: t.input.string({
          required: true,
          validate: {
            email: true,
          },
        }),
        password: t.input.string({
          required: true,
          validate: {
            minLength: 8,
          },
        }),
        age: t.input.int({
          required: true,
          validate: {
            min: 18,
          },
        }),
      },
      resolve: async (_, args) => {
        // Регистрация пользователя
      },
    }),
  }),
});
```

## Лучшие практики

1. **Используйте описательные имена** для input типов
2. **Группируйте связанные поля** в отдельные input объекты
3. **Переиспользуйте общие input типы** (пагинация, фильтры)
4. **Добавляйте описания** к input полям для документации
5. **Валидируйте данные** на уровне схемы

## Примеры использования

### Комплексный поиск с фильтрами

```typescript
const SearchFiltersInput = builder.inputType('SearchFiltersInput', {
  fields: (t) => ({
    categories: t.idList(),
    priceRange: t.field({
      type: builder.inputType('PriceRangeInput', {
        fields: (t) => ({
          min: t.float(),
          max: t.float(),
        }),
      }),
    }),
    inStock: t.boolean({ defaultValue: true }),
  }),
});

builder.queryType({
  fields: (t) => ({
    searchProducts: t.fieldWithInput({
      type: [Product],
      typeOptions: {
        name: 'ProductSearchInput',
      },
      input: {
        query: t.input.string({ required: true }),
        filters: t.input.field({ type: SearchFiltersInput }),
        sort: t.input.string({
          defaultValue: 'relevance',
          description: 'Сортировка: relevance, price_asc, price_desc',
        }),
        pagination: t.input.field({
          type: PaginationInput,
          defaultValue: { limit: 20, offset: 0 },
        }),
      },
      resolve: async (_, args) => {
        const { query, filters, sort, pagination } = args.input;
        
        // Сложная логика поиска с учетом всех параметров
        return searchProducts({
          query,
          filters,
          sort,
          ...pagination,
        });
      },
    }),
  }),
});
```

### CRUD операции

```typescript
// Общий input для создания и обновления
const PostDataInput = builder.inputType('PostDataInput', {
  fields: (t) => ({
    title: t.string({ required: true }),
    content: t.string({ required: true }),
    published: t.boolean({ defaultValue: false }),
    tags: t.stringList(),
  }),
});

builder.mutationType({
  fields: (t) => ({
    createPost: t.fieldWithInput({
      type: Post,
      input: {
        data: t.input.field({ type: PostDataInput }),
        authorId: t.input.id({ required: true }),
      },
      resolve: async (_, args) => {
        return prisma.post.create({
          data: {
            ...args.input.data,
            authorId: args.input.authorId,
          },
        });
      },
    }),
    updatePost: t.fieldWithInput({
      type: Post,
      input: {
        id: t.input.id({ required: true }),
        data: t.input.field({ type: PostDataInput }),
      },
      resolve: async (_, args) => {
        return prisma.post.update({
          where: { id: args.input.id },
          data: args.input.data,
        });
      },
    }),
  }),
});
```