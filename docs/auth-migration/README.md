# Migration Guide: Базовая авторизация → Lucia Auth

Этот гид поможет мигрировать с базовой системы авторизации на Pothos scope-auth к полноценной системе аутентификации на базе Lucia.

## Обзор миграции

### До миграции (Базовая система)
```typescript
// Простой контекст с пользователем
interface Context {
  user: User | null;
  container: Container;
}

// Базовые scopes
authScopes: {
  authenticated: !!context.user,
  admin: context.user?.email === 'admin@example.com',
}
```

### После миграции (Lucia + Pothos)
```typescript
// Расширенный контекст с сессией
interface Context {
  user: User | null;
  container: Container;
  session: SessionWithUser | null;
}

// Scopes на основе сессий
authScopes: {
  authenticated: !!context.session?.user,
  admin: context.session?.user?.email === 'admin@example.com',
}
```

## Пошаговая миграция

### Шаг 1: Backup существующих данных

```bash
# Создайте backup базы данных
pg_dump $DATABASE_URL > backup_before_lucia_migration.sql

# Backup кода
git tag v1.0-before-lucia-migration
git push origin v1.0-before-lucia-migration
```

### Шаг 2: Установите зависимости Lucia

```bash
# Установка основных пакетов
bun add lucia arctic

# Обновите существующие зависимости
bun update @pothos/plugin-scope-auth
```

### Шаг 3: Обновите Prisma схему

```prisma
// Добавьте к существующей User модели:
model User {
  id           String     @id @default(cuid())
  email        String     @unique
  name         String?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  
  // НОВЫЕ поля для OAuth
  googleId     String?    @unique
  githubId     String?    @unique
  
  // Существующие relations
  todoLists    TodoList[]
  todos        Todo[]
  
  // НОВАЯ relation
  sessions     Session[]
  
  @@map("users")
}

// НОВАЯ модель для сессий
model Session {
  id        String   @id @default(cuid())
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("sessions")
}
```

### Шаг 4: Создайте миграцию

```bash
# Генерируйте миграцию
bunx prisma migrate dev --name add_lucia_auth_system

# Проверьте что миграция применилась
bunx prisma migrate status
```

### Шаг 5: Обновите Context interface

```typescript
// src/api/schema/builder.ts

// БЫЛО:
import type { User } from '../../domain/aggregates/User.js';
import type { Container } from '../../infrastructure/container/Container.js';

export interface Context {
  user: User | null;
  container: Container;
}

// СТАЛО:
import type { User } from '../../domain/aggregates/User.js';
import type { Container } from '../../infrastructure/container/Container.js';
import type { SessionWithUser } from '@/lib/auth';

export interface Context {
  user: User | null;
  container: Container;
  session: SessionWithUser | null; // ДОБАВЛЕНО
}
```

### Шаг 6: Обновите authScopes

```typescript
// БЫЛО:
scopeAuth: {
  authScopes: async (context: Context) => ({
    authenticated: !!context.user,
    admin: context.user?.email === 'admin@example.com',
  }),
},

// СТАЛО:
scopeAuth: {
  authScopes: async (context: Context) => ({
    authenticated: !!context.session?.user,
    admin: context.session?.user?.email === 'admin@example.com',
  }),
},
```

### Шаг 7: Создайте Lucia utilities

Создайте файлы auth системы:
- `src/lib/auth/session.ts` - управление сессиями
- `src/lib/auth/oauth.ts` - OAuth провайдеры
- `src/lib/auth/user.ts` - управление пользователями
- `src/lib/auth/index.ts` - exports

См. [Installation Guide](../lucia/installation.md) для полного кода.

### Шаг 8: Создайте auth middleware

```typescript
// src/middleware/auth.ts
import { getCurrentSession, type SessionWithUser } from '@/lib/auth';
import type { Context } from '@/api/schema/builder';

export async function authMiddleware(request: Request): Promise<Partial<Context>> {
  try {
    const sessionData: SessionWithUser | null = await getCurrentSession(request);
    
    if (!sessionData) {
      return {
        user: null,
        session: null,
      };
    }
    
    // Мапим Prisma User в domain User (если нужно)
    const domainUser = sessionData.user as any;
    
    return {
      user: domainUser,
      session: sessionData,
    };
  } catch (error) {
    console.error('Error in auth middleware:', error);
    return {
      user: null,
      session: null,
    };
  }
}
```

### Шаг 9: Создайте OAuth routes

```typescript
// src/routes/auth/google.ts
// src/routes/auth/google-callback.ts
// src/routes/auth/github.ts  
// src/routes/auth/github-callback.ts
// src/routes/auth/logout.ts
```

См. детальную реализацию в [OAuth Guide](../oauth/README.md).

### Шаг 10: Обновите GraphQL server

```typescript
// БЫЛО (пример):
const server = createYoga({
  schema,
  context: async (request) => ({
    user: await getCurrentUser(request), // Ваша старая логика
    container,
  }),
});

// СТАЛО:
import { createGraphQLContext } from '@/middleware/auth';

const server = createYoga({
  schema,
  context: createGraphQLContext(container),
  // Дополнительно можете добавить plugins для логирования, etc.
});
```

## Миграция существующих users

### Опция 1: Сохранение существующих пользователей

Если у вас уже есть пользователи в системе, они будут работать без изменений. OAuth будет связывать аккаунты по email:

```typescript
// При первом OAuth логине
export async function handleGoogleOAuth(userInfo: GoogleUserInfo): Promise<User> {
  // Проверяем по Google ID
  let user = await getUserByGoogleId(userInfo.sub);
  if (user) return user;
  
  // ВАЖНО: Проверяем по email для связывания существующих аккаунтов
  user = await getUserByEmail(userInfo.email);
  if (user) {
    // Связываем Google с существующим аккаунтом
    return await linkGoogleToUser(user.id, userInfo.sub);
  }
  
  // Создаем нового пользователя
  return await createUserWithGoogle(userInfo);
}
```

### Опция 2: Создание сессий для существующих пользователей

Если у вас есть существующая система auth (например, cookies), создайте migration script:

```typescript
// scripts/migrate-existing-sessions.ts
import { generateSessionToken, createSession } from '@/lib/auth';

async function migrateExistingSessions() {
  // Получите всех активных пользователей из вашей старой системы
  const activeUsers = await getActiveUsers(); // Ваша логика
  
  for (const user of activeUsers) {
    // Создайте Lucia сессию для каждого пользователя
    const token = generateSessionToken();
    await createSession(token, user.id);
    
    console.log(`Created session for user ${user.email}`);
  }
  
  console.log(`Migrated ${activeUsers.length} user sessions`);
}

// Запустите один раз
migrateExistingSessions();
```

## Обновление resolvers

### Получение пользователя из context

```typescript
// БЫЛО:
builder.queryField('currentUser', (t) =>
  t.field({
    type: 'User',
    nullable: true,
    resolve: (root, args, context) => {
      return context.user; // Может быть null
    },
  }),
);

// СТАЛО:  
builder.queryField('currentUser', (t) =>
  t.field({
    type: 'User',
    nullable: true,
    authScopes: {
      authenticated: true, // Теперь работает через сессии
    },
    resolve: (root, args, context) => {
      return context.session?.user || null;
    },
  }),
);
```

### Создание защищенных mutations

```typescript
// БЫЛО:
builder.mutationField('createTodo', (t) =>
  t.field({
    type: 'Todo',
    args: {
      title: t.arg.string({ required: true }),
    },
    resolve: async (root, args, context) => {
      // Ручная проверка
      if (!context.user) {
        throw new Error('Authentication required');
      }
      
      return createTodo(args.title, context.user.id);
    },
  }),
);

// СТАЛО:
builder.mutationField('createTodo', (t) =>
  t.field({
    type: 'Todo',
    authScopes: {
      authenticated: true, // Автоматическая проверка через scope-auth
    },
    args: {
      title: t.arg.string({ required: true }),
    },
    resolve: async (root, args, context) => {
      // context.session гарантированно существует благодаря authScopes
      const userId = context.session!.user.id;
      return createTodo(args.title, userId);
    },
  }),
);
```

## Тестирование миграции

### 1. Unit tests

```typescript
// Тесты для новых auth функций
test('Session creation and validation', async () => {
  const token = generateSessionToken();
  const session = await createSession(token, 'user-id');
  
  const validated = await validateSessionToken(token);
  expect(validated?.session.id).toBe(session.id);
});

test('OAuth user creation', async () => {
  const userInfo = {
    sub: 'google_123',
    email: 'test@example.com',
    name: 'Test User',
  };
  
  const user = await handleGoogleOAuth(userInfo);
  expect(user.googleId).toBe('google_123');
  expect(user.email).toBe('test@example.com');
});
```

### 2. Integration tests

```typescript
// Тест GraphQL с новой аутентификацией
test('GraphQL authentication with Lucia', async () => {
  // Создаем пользователя и сессию
  const user = await createTestUser();
  const token = generateSessionToken();
  const session = await createSession(token, user.id);
  
  // Тестируем GraphQL запрос
  const response = await graphql({
    schema,
    source: `
      query CurrentUser {
        currentUser {
          id
          email
        }
      }
    `,
    contextValue: await createGraphQLContext(container)(
      new Request('http://test', {
        headers: {
          Cookie: `session=${token}`,
        },
      })
    ),
  });
  
  expect(response.data?.currentUser?.email).toBe(user.email);
});
```

### 3. Manual testing

```bash
# 1. Проверьте что существующие пользователи могут войти через OAuth
# 2. Проверьте что новые пользователи могут регистрироваться  
# 3. Проверьте что GraphQL scopes работают корректно
# 4. Проверьте что сессии правильно истекают
# 5. Проверьте logout функциональность
```

## Rollback план

Если что-то пойдет не так, вы можете откатиться:

### 1. Откат базы данных

```bash
# Восстановите backup
psql $DATABASE_URL < backup_before_lucia_migration.sql

# Или создайте rollback миграцию
bunx prisma migrate dev --name rollback_lucia_auth
```

### 2. Откат кода

```bash
# Вернитесь к предыдущему состоянию
git checkout v1.0-before-lucia-migration

# Или создайте hotfix branch
git checkout -b hotfix/rollback-lucia
```

## Production deployment

### 1. Staging environment

Сначала разверните на staging:
```bash
# Установите environment variables
export GOOGLE_CLIENT_ID="staging_google_id"
export GITHUB_CLIENT_ID="staging_github_id"

# Разверните код  
bun run build
bun run start
```

### 2. Production rollout

```bash
# 1. Примените database migrations
bunx prisma migrate deploy

# 2. Разверните код с новыми environment variables
# 3. Мониторьте логи и метрики
# 4. Проверьте что OAuth работает
# 5. Постепенно переводите пользователей
```

## Troubleshooting

### Распространенные проблемы

**Сессии не создаются**
```typescript
// Проверьте что middleware правильно интегрирован
// Проверьте database connectivity
// Проверьте environment variables
```

**OAuth не работает**
```typescript
// Проверьте CLIENT_ID и CLIENT_SECRET
// Проверьте redirect URLs в OAuth apps
// Проверьте network connectivity
```

**Scope auth не срабатывает**
```typescript
// Проверьте что authScopes обновлены для использования session
// Проверьте что context правильно передается
```

**TypeScript ошибки**
```bash
# Регенерируйте Prisma client
bunx prisma generate

# Проверьте что все типы импортированы
```

## Заключение

После завершения миграции вы получите:

✅ **Безопасное управление сессиями** с автоматическим истечением  
✅ **OAuth аутентификация** с Google и GitHub  
✅ **Сохранение существующих пользователей** через email linking  
✅ **Улучшенная безопасность** с CSRF защитой и secure cookies  
✅ **Лучший Developer Experience** с типобезопасным контекстом

Система останется совместимой с существующим Pothos scope-auth, но получит мощные возможности Lucia для управления аутентификацией.