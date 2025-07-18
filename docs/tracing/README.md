# @pothos/plugin-tracing

Плагин Tracing для Pothos предоставляет инструменты для отслеживания производительности и отладки GraphQL резолверов.

## Установка

```bash
bun add @pothos/plugin-tracing
```

Для интеграции с Sentry:
```bash
bun add @pothos/tracing-sentry
```

## Конфигурация

### Базовая настройка

```typescript
import SchemaBuilder from '@pothos/core';
import TracingPlugin, { isRootField } from '@pothos/plugin-tracing';

const builder = new SchemaBuilder({
  plugins: [TracingPlugin],
  tracing: {
    default: (config) => isRootField(config),
    wrap: (resolver, options, fieldConfig) => {
      return (source, args, ctx, info) => {
        const start = Date.now();
        
        try {
          const result = resolver(source, args, ctx, info);
          console.log(`${info.parentType}.${info.fieldName} took ${Date.now() - start}ms`);
          return result;
        } catch (error) {
          console.error(`Error in ${info.parentType}.${info.fieldName}:`, error);
          throw error;
        }
      };
    },
  },
});
```

### Интеграция с Sentry

```typescript
import { createSentryWrapper } from '@pothos/tracing-sentry';

const traceResolver = createSentryWrapper({
  includeArgs: true,     // Включить аргументы в трейс
  includeSource: true,   // Включить GraphQL источник
  ignoreError: false,    // Не игнорировать ошибки
});

const builder = new SchemaBuilder({
  plugins: [TracingPlugin],
  tracing: {
    default: (config) => isRootField(config),
    wrap: (resolver, options) => traceResolver(resolver, options),
  },
});
```

## Основные концепции

### Конфигурация трейсинга на уровне полей

```typescript
builder.queryType({
  fields: (t) => ({
    // Включить трейсинг для конкретного поля
    tracedField: t.string({
      tracing: true,
      resolve: () => 'data',
    }),
    
    // Отключить трейсинг
    notTracedField: t.string({
      tracing: false,
      resolve: () => 'data',
    }),
    
    // Кастомные опции трейсинга
    customTracedField: t.string({
      tracing: {
        formatMessage: (duration) => `Выполнено за ${duration}мс`,
      },
      resolve: () => 'data',
    }),
  }),
});
```

### Передача контекста в трейсинг

```typescript
const builder = new SchemaBuilder<{
  Tracing: false | { attributes?: Record<string, unknown> };
}>({
  plugins: [TracingPlugin],
  tracing: {
    default: (config) => {
      if (isRootField(config)) {
        return {};
      }
      return false;
    },
    wrap: (resolver, options, fieldConfig) => (source, args, ctx, info) => {
      const span = tracer.createSpan();

      if (options.attributes) {
        span.setAttributes(options.attributes);
      }
      
      return runFunction(
        () => resolver(source, args, ctx, info),
        () => {
          span.end();
        },
      );
    },
  },
});

// Использование с передачей аргументов в трейс
builder.queryField('hello', (t) =>
  t.string({
    args: { name: t.arg.string() },
    tracing: (root, args) => ({ attributes: { args } }),
    resolve: (root, { name }) => `hello, ${name || 'World'}`,
  }),
);
```

## Утилиты

### wrapResolver

Обертка для резолвера с колбэком по завершению:

```typescript
import { wrapResolver } from '@pothos/plugin-tracing';

const wrapped = wrapResolver(
  originalResolver,
  (error, duration) => {
    if (error) {
      console.error(`Ошибка после ${duration}мс:`, error);
    } else {
      console.log(`Успешно выполнено за ${duration}мс`);
    }
  }
);
```

### runFunction

Выполнение функции с трейсингом:

```typescript
import { runFunction } from '@pothos/plugin-tracing';

const result = await runFunction(
  () => someAsyncOperation(),
  (error, duration) => {
    metrics.recordDuration('operation', duration);
    if (error) {
      metrics.recordError('operation');
    }
  }
);
```

### Вспомогательные функции

```typescript
import { isRootField, isScalarField, isEnumField } from '@pothos/plugin-tracing';

// isRootField - проверяет, является ли поле корневым (Query, Mutation, Subscription)
// isScalarField - проверяет, является ли поле скалярным
// isEnumField - проверяет, является ли поле enum
```

## Интеграция с GraphQL Yoga и Envelop

```typescript
import { useSentry } from '@envelop/sentry';
import { createYoga } from 'graphql-yoga';
import { schema } from './schema';

const yoga = createYoga({
  schema,
  plugins: [useSentry({})],
});
```

## Лучшие практики

1. **Трейсинг только важных полей**: Не включайте трейсинг для всех полей, это создаст избыточную нагрузку
2. **Используйте isRootField**: Обычно достаточно трейсить только корневые поля
3. **Атрибуты с умом**: Не передавайте чувствительные данные в атрибуты трейса
4. **Группировка метрик**: Используйте консистентные имена для группировки похожих операций

## Примеры использования

### Продвинутая конфигурация с метриками

```typescript
import { StatsD } from 'node-statsd';

const statsd = new StatsD();

const builder = new SchemaBuilder({
  plugins: [TracingPlugin],
  tracing: {
    default: (config) => {
      // Трейсим только корневые поля и не-скалярные/не-enum поля
      return isRootField(config) || 
        (!isScalarField(config) && !isEnumField(config));
    },
    wrap: (resolver, options, fieldConfig) => {
      const metricName = `graphql.${fieldConfig.parentType}.${fieldConfig.name}`;
      
      return wrapResolver(resolver, (error, duration) => {
        // Отправляем метрики
        statsd.timing(metricName, duration);
        
        if (error) {
          statsd.increment(`${metricName}.error`);
        } else {
          statsd.increment(`${metricName}.success`);
        }
      });
    },
  },
});
```

### Контекстный трейсинг с OpenTelemetry

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('graphql');

const builder = new SchemaBuilder({
  plugins: [TracingPlugin],
  tracing: {
    default: (config) => isRootField(config),
    wrap: (resolver, options, fieldConfig) => (source, args, ctx, info) => {
      const span = tracer.startSpan(`GraphQL.${info.parentType}.${info.fieldName}`, {
        attributes: {
          'graphql.field': info.fieldName,
          'graphql.type': info.parentType.toString(),
          'graphql.path': info.path,
        },
      });

      return runFunction(
        () => resolver(source, args, ctx, info),
        (error, duration) => {
          if (error) {
            span.recordException(error);
            span.setStatus({ code: 2, message: error.message });
          }
          span.end();
        },
      );
    },
  },
});
```