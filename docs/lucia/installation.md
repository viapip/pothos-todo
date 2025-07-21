# Установка Lucia Authentication

Это пошаговое руководство по установке и настройке Lucia в проекте Pothos GraphQL.

## Требования

- Bun >= 1.2.15
- PostgreSQL (или другая поддерживаемая база данных)
- TypeScript >= 5.0

## Шаг 1: Установка зависимостей

```bash
# Основные зависимости для аутентификации
bun add lucia arctic

# Для работы с JWT (если нужно)
bun add @types/jsonwebtoken
```

## Шаг 2: Обновление Prisma схемы

Добавьте модели для пользователей и сессий в `prisma/schema.prisma`:

```prisma
model User {
  id           String     @id @default(cuid())
  email        String     @unique
  name         String?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  
  // OAuth fields
  googleId     String?    @unique
  githubId     String?    @unique
  
  // Relations
  sessions     Session[]
  todoLists    TodoList[]
  todos        Todo[]
  
  @@map("users")
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  
  // Relations
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("sessions")
}
```

## Шаг 3: Создание миграций

```bash
# Генерация новой миграции
bunx prisma migrate dev --name add_lucia_auth

# Генерация Prisma клиента
bunx prisma generate
```

## Шаг 4: Environment Variables

Создайте или обновите `.env` файл:

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"

# Application
BASE_URL="http://localhost:3000"
NODE_ENV="development"

# Session Configuration (опционально)
SESSION_EXPIRES_IN_SECONDS=2592000  # 30 дней

# Google OAuth
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"

# GitHub OAuth  
GITHUB_CLIENT_ID="your_github_client_id"
GITHUB_CLIENT_SECRET="your_github_client_secret"
```

## Шаг 5: Создание auth utilities

Создайте файл `src/lib/auth/session.ts`:

```typescript
import prisma from '@/lib/prisma';
import type { User, Session } from '@prisma/client';

export interface SessionWithUser {
  session: Session;
  user: User;
}

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 дней

export function generateSessionToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  
  return btoa(String.fromCharCode(...bytes))
    .replace(/\\+/g, '-')
    .replace(/\\//g, '_')
    .replace(/=/g, '');
}

export async function createSession(token: string, userId: string): Promise<Session> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRES_IN_SECONDS * 1000);
  
  return await prisma.session.create({
    data: {
      id: token,
      userId,
      expiresAt,
    },
  });
}

// ... остальные функции (см. полный код в проекте)
```

## Шаг 6: OAuth конфигурация

Создайте `src/lib/auth/oauth.ts`:

```typescript
import { Google, GitHub } from 'arctic';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

export const google = new Google(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${BASE_URL}/auth/google/callback`
);

export const github = new GitHub(
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  `${BASE_URL}/auth/github/callback`
);

// ... остальные utility функции
```

## Шаг 7: Обновление GraphQL Builder

Обновите `src/api/schema/builder.ts`:

```typescript
import type { SessionWithUser } from '@/lib/auth';

export interface Context {
  user: User | null;
  container: Container;
  session: SessionWithUser | null; // Добавлено
}

export const builder = new SchemaBuilder<{
  Context: Context;
  // ... остальные типы
}>({
  plugins: [
    // ... существующие plugins
  ],
  scopeAuth: {
    authScopes: async (context: Context) => ({
      authenticated: !!context.session?.user,      // Обновлено
      admin: context.session?.user?.email === 'admin@example.com', // Обновлено
    }),
  },
  // ... остальная конфигурация
});
```

## Шаг 8: Создание Auth Middleware

Создайте `src/middleware/auth.ts`:

```typescript
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
    
    return {
      user: sessionData.user as any,
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

## Шаг 9: Создание Auth Routes

Создайте OAuth endpoints в `src/routes/auth/`:

```typescript
// src/routes/auth/google.ts
export async function handleGoogleLogin(request: Request): Promise<Response> {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  
  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);
  
  const response = new Response(null, {
    status: 302,
    headers: { Location: url.toString() },
  });
  
  setOAuthStateCookie(response, state, 'google');
  setCodeVerifierCookie(response, codeVerifier, 'google');
  
  return response;
}

// Аналогично для других routes
```

## Шаг 10: Интеграция с GraphQL Yoga

Обновите ваш GraphQL server для использования auth middleware:

```typescript
import { createGraphQLContext } from '@/middleware/auth';
import { createYoga } from 'graphql-yoga';

const yoga = createYoga({
  schema,
  context: createGraphQLContext(container),
  // ... остальные опции
});
```

## Шаг 11: Тестирование

1. Запустите сервер:
```bash
bun run dev
```

2. Проверьте OAuth endpoints:
- `GET /auth/google` - должен редиректить на Google
- `GET /auth/github` - должен редиректить на GitHub

3. Проверьте GraphQL аутентификацию:
```graphql
query CurrentUser {
  currentUser {
    id
    email
    name
  }
}
```

## Проверка установки

После установки убедитесь, что:

- [ ] Database migrations выполнены успешно
- [ ] Environment variables настроены
- [ ] OAuth приложения созданы и настроены
- [ ] Auth middleware интегрирован с GraphQL
- [ ] Scope auth работает корректно

## Troubleshooting

### Ошибка: Module not found
```bash
# Убедитесь, что все зависимости установлены
bun install

# Проверьте alias в tsconfig.json
```

### База данных недоступна
```bash
# Проверьте подключение к БД
bunx prisma db push

# Проверьте DATABASE_URL
echo $DATABASE_URL
```

### OAuth ошибки
- Проверьте redirect URLs в OAuth приложениях
- Убедитесь, что CLIENT_ID и CLIENT_SECRET корректны
- Проверьте BASE_URL environment variable

## Следующие шаги

После успешной установки:

1. Настройте OAuth провайдеры: [OAuth Setup](../oauth/README.md)
2. Изучите продвинутые возможности: [Advanced Usage](./advanced.md)  
3. Настройте production deployment: [Production Guide](./production.md)