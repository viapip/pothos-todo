# @pothos/plugin-federation

Плагин Federation для Pothos обеспечивает поддержку Apollo Federation, позволяя создавать распределенные GraphQL схемы в микросервисной архитектуре.

## Установка

```bash
bun add @pothos/plugin-federation
```

## Концепция Federation

Apollo Federation позволяет разделить большую GraphQL схему на несколько независимых сервисов (subgraph), которые объединяются в единый API через Apollo Gateway.

### Основные концепции:

- **Subgraph** - отдельный GraphQL сервис, управляющий частью схемы
- **Entity** - тип, который может быть расширен другими subgraph'ами
- **External fields** - поля, определенные в других subgraph'ах
- **Reference resolver** - функция для загрузки entity по ключу

## Конфигурация

```typescript
import SchemaBuilder from '@pothos/core';
import FederationPlugin from '@pothos/plugin-federation';

const builder = new SchemaBuilder<{
  // Добавляем необходимые скаляры для Federation
  Scalars: {
    _FieldSet: {
      Input: string;
      Output: string;
    };
  };
}>({
  plugins: [FederationPlugin],
});
```

## Определение Entity

### Базовый Entity

```typescript
// User entity с ключом "id"
const User = builder.objectRef<UserType>('User').implement({
  // Указываем ключевые поля
  extensions: {
    key: builder.selection<{ id: string }>('id'),
  },
  fields: (t) => ({
    id: t.exposeID('id'),
    username: t.exposeString('username'),
    email: t.exposeString('email'),
  }),
});

// Reference resolver - как загрузить User по id
builder.objectFieldResolver(User, 'resolveReference', (parent) => {
  return getUserById(parent.id);
});
```

### Entity с составным ключом

```typescript
const Product = builder.objectRef<ProductType>('Product').implement({
  extensions: {
    // Составной ключ из нескольких полей
    key: builder.selection<{ sku: string; brand: string }>('sku brand'),
  },
  fields: (t) => ({
    sku: t.exposeString('sku'),
    brand: t.exposeString('brand'),
    name: t.exposeString('name'),
    price: t.exposeFloat('price'),
  }),
});

builder.objectFieldResolver(Product, 'resolveReference', (parent) => {
  return getProductBySkuAndBrand(parent.sku, parent.brand);
});
```

### Множественные ключи

```typescript
const Order = builder.objectRef<OrderType>('Order').implement({
  extensions: {
    // Несколько способов идентификации
    key: [
      builder.selection<{ id: string }>('id'),
      builder.selection<{ userId: string; orderNumber: number }>('userId orderNumber'),
    ],
  },
  fields: (t) => ({
    id: t.exposeID('id'),
    userId: t.exposeString('userId'),
    orderNumber: t.exposeInt('orderNumber'),
    total: t.exposeFloat('total'),
  }),
});

builder.objectFieldResolver(Order, 'resolveReference', (parent) => {
  if ('id' in parent) {
    return getOrderById(parent.id);
  }
  return getOrderByUserAndNumber(parent.userId, parent.orderNumber);
});
```

## Расширение внешних типов

### Добавление полей к внешнему типу

```typescript
// User определен в другом subgraph
const User = builder.externalRef('User', builder.selection<{ id: string }>('id'));

// Расширяем User новыми полями
builder.objectField(User, 'orders', (t) =>
  t.field({
    type: [Order],
    resolve: (user) => {
      return getOrdersByUserId(user.id);
    },
  })
);

// Добавляем вычисляемые поля
builder.objectField(User, 'totalSpent', (t) =>
  t.float({
    resolve: async (user) => {
      const orders = await getOrdersByUserId(user.id);
      return orders.reduce((sum, order) => sum + order.total, 0);
    },
  })
);
```

### Использование внешних полей

```typescript
// Product определен в catalog subgraph
const Product = builder.externalRef(
  'Product',
  builder.selection<{ sku: string }>('sku')
);

// Review entity использует Product
const Review = builder.objectRef<ReviewType>('Review').implement({
  extensions: {
    key: builder.selection<{ id: string }>('id'),
  },
  fields: (t) => ({
    id: t.exposeID('id'),
    rating: t.exposeInt('rating'),
    comment: t.exposeString('comment'),
    
    // Связь с внешним типом
    product: t.field({
      type: Product,
      // Нужны только ключевые поля
      resolve: (review) => ({ sku: review.productSku }),
    }),
  }),
});
```

## Shareable типы и поля

### Shareable типы

```typescript
// Тип, который может быть определен в нескольких subgraph'ах
const Money = builder.objectRef<MoneyType>('Money').implement({
  extensions: {
    shareable: true,
  },
  fields: (t) => ({
    amount: t.exposeFloat('amount'),
    currency: t.exposeString('currency'),
  }),
});
```

### Shareable поля

```typescript
builder.objectType('Product', {
  fields: (t) => ({
    // Поле может быть определено в нескольких subgraph'ах
    name: t.string({
      extensions: {
        shareable: true,
      },
      resolve: (product) => product.name,
    }),
  }),
});
```

## Директивы Federation

### @provides

```typescript
// Inventory subgraph может предоставить информацию о продукте
builder.objectField(InventoryItem, 'product', (t) =>
  t.field({
    type: Product,
    extensions: {
      // Указываем, какие поля мы можем предоставить
      provides: builder.selection('name price'),
    },
    resolve: (item) => ({
      sku: item.productSku,
      // Эти поля будут загружены локально, а не через reference resolver
      name: item.cachedProductName,
      price: item.cachedProductPrice,
    }),
  })
);
```

### @requires

```typescript
// Поле требует данные из другого subgraph
builder.objectField(Product, 'shippingEstimate', (t) =>
  t.string({
    extensions: {
      // Нужны weight и dimensions из catalog subgraph
      requires: builder.selection('weight dimensions { height width depth }'),
    },
    resolve: (product) => {
      return calculateShipping(product.weight, product.dimensions);
    },
  })
);
```

### @override

```typescript
// Переопределяем поле из другого subgraph
builder.objectField(User, 'email', (t) =>
  t.string({
    extensions: {
      override: 'accounts', // имя subgraph'а, который переопределяем
    },
    resolve: (user) => {
      // Наша реализация поля email
      return maskEmail(user.email);
    },
  })
);
```

## Интеграция с Prisma

```typescript
// Entity на основе Prisma модели
builder.prismaObject('User', {
  extensions: {
    key: builder.selection<{ id: string }>('id'),
  },
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    profile: t.relation('profile'),
  }),
});

// Reference resolver с Prisma
builder.prismaObjectFieldResolver('User', 'resolveReference', async (parent, context) => {
  return context.prisma.user.findUnique({
    where: { id: parent.id },
  });
});
```

## Создание subgraph сервера

```typescript
import { createYoga } from 'graphql-yoga';
import { createServer } from 'http';
import { printSubgraphSchema } from '@apollo/subgraph';

// Создаем схему
const schema = builder.toSubgraphSchema();

// Создаем Yoga сервер
const yoga = createYoga({
  schema,
  graphiql: {
    title: 'Products Subgraph',
  },
});

// HTTP сервер
const server = createServer(yoga);

server.listen(4001, () => {
  console.log('Products subgraph running on http://localhost:4001/graphql');
  
  // Выводим SDL для Federation
  console.log('\nSubgraph SDL:');
  console.log(printSubgraphSchema(schema));
});
```

## Gateway конфигурация

```typescript
import { ApolloGateway, IntrospectAndCompose } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

// Создаем Gateway
const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [
      { name: 'accounts', url: 'http://localhost:4001/graphql' },
      { name: 'products', url: 'http://localhost:4002/graphql' },
      { name: 'reviews', url: 'http://localhost:4003/graphql' },
      { name: 'inventory', url: 'http://localhost:4004/graphql' },
    ],
  }),
});

// Apollo Server с Gateway
const server = new ApolloServer({
  gateway,
});

// Запуск сервера
const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
});

console.log(`🚀 Gateway ready at ${url}`);
```

## Best Practices

### 1. Дизайн Entity

```typescript
// ✅ Хорошо: минимальные ключевые поля
const User = builder.objectRef<UserType>('User').implement({
  extensions: {
    key: builder.selection<{ id: string }>('id'),
  },
  fields: (t) => ({
    id: t.exposeID('id'),
    // Только поля, которыми владеет этот subgraph
    username: t.exposeString('username'),
    email: t.exposeString('email'),
  }),
});

// ❌ Плохо: слишком много данных в ключе
const BadUser = builder.objectRef<UserType>('User').implement({
  extensions: {
    key: builder.selection<{ id: string; email: string; username: string }>('id email username'),
  },
  // ...
});
```

### 2. Reference Resolvers

```typescript
// ✅ Хорошо: эффективная загрузка с DataLoader
builder.objectFieldResolver(User, 'resolveReference', (parent, context) => {
  return context.loaders.users.load(parent.id);
});

// ❌ Плохо: N+1 запросы
builder.objectFieldResolver(User, 'resolveReference', async (parent) => {
  return db.query(`SELECT * FROM users WHERE id = ${parent.id}`);
});
```

### 3. Расширение типов

```typescript
// ✅ Хорошо: добавляем только релевантные поля
builder.objectField(User, 'orders', (t) =>
  t.field({
    type: [Order],
    resolve: (user, _, context) => {
      return context.loaders.ordersByUser.load(user.id);
    },
  })
);

// ❌ Плохо: дублирование полей из другого subgraph
builder.objectField(User, 'email', (t) =>
  t.string({
    resolve: async (user) => {
      // Email уже определен в accounts subgraph!
      const fullUser = await loadUser(user.id);
      return fullUser.email;
    },
  })
);
```

### 4. Производительность

```typescript
// Используйте DataLoader для reference resolvers
const userLoader = new DataLoader<string, User>(async (ids) => {
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
  });
  return ids.map(id => users.find(u => u.id === id));
});

// Кэшируйте внешние данные когда возможно
builder.objectField(Product, 'reviews', (t) =>
  t.field({
    type: [Review],
    resolve: async (product, _, context) => {
      // Кэшируем на уровне запроса
      const cacheKey = `reviews:${product.sku}`;
      const cached = context.cache.get(cacheKey);
      
      if (cached) return cached;
      
      const reviews = await context.loaders.reviewsByProduct.load(product.sku);
      context.cache.set(cacheKey, reviews);
      
      return reviews;
    },
  })
);
```

## Отладка Federation

### Проверка SDL

```typescript
import { printSubgraphSchema } from '@apollo/subgraph';

const schema = builder.toSubgraphSchema();
console.log(printSubgraphSchema(schema));
```

### Валидация композиции

```bash
# Установите Rover CLI
curl -sSL https://rover.apollo.dev/nix/latest | sh

# Проверьте subgraph
rover subgraph check my-graph@current \
  --schema ./schema.graphql \
  --name products
```

### Мониторинг

```typescript
// Добавьте трейсинг для reference resolvers
builder.objectFieldResolver(User, 'resolveReference', async (parent, context) => {
  const span = context.tracer.startSpan('resolveUserReference');
  
  try {
    const user = await context.loaders.users.load(parent.id);
    span.setTag('user.found', !!user);
    return user;
  } catch (error) {
    span.setTag('error', true);
    span.log({ error: error.message });
    throw error;
  } finally {
    span.finish();
  }
});
```

## Миграция на Federation

### Из монолитной схемы

1. **Идентифицируйте границы сервисов**
   - Группируйте связанные типы
   - Определите владельцев данных
   - Минимизируйте cross-service зависимости

2. **Создайте Entity типы**
   ```typescript
   // Было: обычный тип
   builder.objectType('User', { /* ... */ });
   
   // Стало: Federation entity
   builder.objectRef('User').implement({
     extensions: { key: builder.selection('id') },
     // ...
   });
   ```

3. **Разделите резолверы**
   - Переместите резолверы в соответствующие subgraph'ы
   - Добавьте reference resolvers
   - Настройте cross-service коммуникацию

## Примеры использования

### E-commerce система

```typescript
// Accounts subgraph
const User = builder.objectRef<UserType>('User').implement({
  extensions: { key: builder.selection('id') },
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    name: t.exposeString('name'),
  }),
});

// Products subgraph
const Product = builder.objectRef<ProductType>('Product').implement({
  extensions: { key: builder.selection('sku') },
  fields: (t) => ({
    sku: t.exposeString('sku'),
    name: t.exposeString('name'),
    price: t.exposeFloat('price'),
  }),
});

// Orders subgraph
const Order = builder.objectRef<OrderType>('Order').implement({
  extensions: { key: builder.selection('id') },
  fields: (t) => ({
    id: t.exposeID('id'),
    user: t.field({
      type: User,
      resolve: (order) => ({ id: order.userId }),
    }),
    items: t.field({
      type: [OrderItem],
      resolve: (order) => getOrderItems(order.id),
    }),
  }),
});

// Reviews subgraph расширяет Product
builder.objectField(Product, 'reviews', (t) =>
  t.field({
    type: [Review],
    resolve: (product) => getReviewsByProduct(product.sku),
  })
);
```

## Заключение

Federation с Pothos позволяет создавать масштабируемые GraphQL API, разделенные на независимые сервисы. Ключевые преимущества:

- **Независимая разработка**: Команды могут работать автономно
- **Постепенная миграция**: Переходите от монолита постепенно
- **Типобезопасность**: Полная типизация между subgraph'ами
- **Производительность**: Оптимизация на уровне Gateway

Следуйте best practices, используйте DataLoader для reference resolvers, и тщательно проектируйте границы сервисов для успешной Federation архитектуры.