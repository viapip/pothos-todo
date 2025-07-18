# @pothos/plugin-validation

Плагин Validation для Pothos предоставляет интеграцию с библиотекой Zod для валидации аргументов GraphQL.

**Важно**: Начиная с версии 4.0, этот плагин был переименован в `@pothos/plugin-zod`.

## Установка

```bash
bun add zod @pothos/plugin-zod
```

## Конфигурация

```typescript
import SchemaBuilder from '@pothos/core';
import ZodPlugin from '@pothos/plugin-zod';

const builder = new SchemaBuilder({
  plugins: [ZodPlugin],
  zod: {
    // Опционально настройте форматирование ошибок
    validationError: (zodError, args, context, info) => {
      // По умолчанию просто выбрасывает zod ошибку
      return zodError;
    },
  },
});
```

## Основные концепции

### Валидация отдельных аргументов

```typescript
builder.queryType({
  fields: (t) => ({
    example: t.boolean({
      args: {
        email: t.arg.string({
          validate: {
            email: true,
          },
        }),
        age: t.arg.int({
          validate: {
            min: 18,
            max: 100,
          },
        }),
      },
      resolve: () => true,
    }),
  }),
});
```

### Валидация всех аргументов вместе

```typescript
builder.queryType({
  fields: (t) => ({
    signup: t.boolean({
      args: {
        email: t.arg.string(),
        phone: t.arg.string(),
      },
      // Хотя бы один контакт должен быть предоставлен
      validate: (args) => !!args.phone || !!args.email,
      resolve: () => true,
    }),
  }),
});
```

### Кастомные сообщения об ошибках

```typescript
builder.queryType({
  fields: (t) => ({
    withMessage: t.boolean({
      args: {
        email: t.arg.string({
          validate: {
            email: [true, { message: 'Неверный формат email адреса' }],
          },
        }),
        phone: t.arg.string(),
      },
      validate: [
        (args) => !!args.phone || !!args.email,
        { message: 'Необходимо указать email или телефон' },
      ],
      resolve: () => true,
    }),
  }),
});
```

### Валидация списков

```typescript
builder.queryType({
  fields: (t) => ({
    processList: t.boolean({
      args: {
        emails: t.arg.stringList({
          validate: {
            items: {
              email: true,
            },
            maxLength: 10,
            minLength: 1,
          },
        }),
      },
      resolve: () => true,
    }),
  }),
});
```

### Использование Zod схем

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
});

builder.queryType({
  fields: (t) => ({
    createUser: t.boolean({
      args: {
        email: t.arg.string(),
        age: t.arg.int(),
      },
      validate: {
        schema: UserSchema,
      },
      resolve: () => true,
    }),
  }),
});
```

## Доступные валидаторы

### Для чисел
- `min` - минимальное значение
- `max` - максимальное значение
- `positive` - положительное число
- `nonnegative` - неотрицательное число
- `negative` - отрицательное число
- `nonpositive` - неположительное число
- `int` - целое число

### Для строк
- `minLength` - минимальная длина
- `maxLength` - максимальная длина
- `length` - точная длина
- `email` - формат email
- `url` - формат URL
- `uuid` - формат UUID
- `regex` - соответствие регулярному выражению

### Для массивов
- `minLength` - минимальное количество элементов
- `maxLength` - максимальное количество элементов
- `length` - точное количество элементов
- `items` - валидация элементов массива

## Интеграция с клиентом

### Переиспользование валидации

```typescript
// shared.ts
import { ValidationOptions } from '@pothos/plugin-zod';

export const numberValidation: ValidationOptions<number> = {
  max: 5,
  min: 1,
};

// server.ts
builder.queryField('example', (t) =>
  t.boolean({
    args: {
      num: t.arg.int({
        validate: numberValidation,
      }),
    },
    resolve: () => true,
  })
);

// client.ts
import { createZodSchema } from '@pothos/plugin-zod';

const validator = createZodSchema(numberValidation);
validator.parse(3); // успех
validator.parse(6); // ошибка
```

## Интеграция с плагином Errors

```typescript
import ErrorsPlugin from '@pothos/plugin-errors';
import { ZodError } from 'zod';

// Утилита для преобразования Zod ошибок
function flattenErrors(
  error: ZodFormattedError<unknown>,
  path: string[],
): { path: string[]; message: string }[] {
  const errors = error._errors.map((message) => ({
    path,
    message,
  }));

  Object.keys(error).forEach((key) => {
    if (key !== '_errors') {
      errors.push(
        ...flattenErrors(
          (error as Record<string, unknown>)[key] as ZodFormattedError<unknown>,
          [...path, key],
        ),
      );
    }
  });

  return errors;
}

// Типы для GraphQL
const ZodFieldError = builder
  .objectRef<{
    message: string;
    path: string[];
  }>('ZodFieldError')
  .implement({
    fields: (t) => ({
      message: t.exposeString('message'),
      path: t.exposeStringList('path'),
    }),
  });

builder.objectType(ZodError, {
  name: 'ZodError',
  interfaces: [ErrorInterface],
  fields: (t) => ({
    fieldErrors: t.field({
      type: [ZodFieldError],
      resolve: (err) => flattenErrors(err.format(), []),
    }),
  }),
});
```

## Лучшие практики

1. **Используйте типизированные валидаторы** для переиспользования между сервером и клиентом
2. **Предоставляйте понятные сообщения об ошибках** на родном языке пользователей
3. **Группируйте связанные валидации** в отдельные Zod схемы
4. **Валидируйте на границах API** - не доверяйте входным данным
5. **Используйте `refine`** для сложной бизнес-логики валидации

## Примеры использования

### Комплексная валидация формы

```typescript
const RegistrationSchema = z.object({
  email: z.string().email('Неверный формат email'),
  password: z.string()
    .min(8, 'Пароль должен быть не менее 8 символов')
    .regex(/[A-Z]/, 'Пароль должен содержать заглавную букву')
    .regex(/[0-9]/, 'Пароль должен содержать цифру'),
  confirmPassword: z.string(),
  age: z.number().min(18, 'Вам должно быть не менее 18 лет'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});

builder.mutationType({
  fields: (t) => ({
    register: t.boolean({
      args: {
        email: t.arg.string({ required: true }),
        password: t.arg.string({ required: true }),
        confirmPassword: t.arg.string({ required: true }),
        age: t.arg.int({ required: true }),
      },
      validate: {
        schema: RegistrationSchema,
      },
      resolve: async (_, args) => {
        // Логика регистрации
        return true;
      },
    }),
  }),
});
```