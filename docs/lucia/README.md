# Lucia Authentication

Lucia - это лёгкая библиотека аутентификации для TypeScript, которая предоставляет гибкое управление сессиями. В этом проекте Lucia интегрирована с Pothos GraphQL и предоставляет полноценную систему аутентификации с OAuth поддержкой.

## Обзор

Наша система аутентификации использует гибридный подход:
- **Lucia** управляет сессиями, токенами и OAuth
- **Pothos Scope Auth** обеспечивает авторизацию на уровне GraphQL схемы

Это обеспечивает лучшее из обеих систем: надежное управление сессиями от Lucia и мощную авторизацию от Pothos.

## Архитектура

```
Request → Auth Middleware → Session Validation → GraphQL Context → Scope Auth
```

1. **Auth Middleware** проверяет session cookie в запросе
2. **Session Validation** валидирует токен и получает данные пользователя
3. **GraphQL Context** обогащается данными пользователя и сессии
4. **Scope Auth** использует эти данные для авторизации GraphQL операций

## Основные компоненты

### 1. Session Management (`src/lib/auth/session.ts`)
- Генерация безопасных session токенов
- Создание и валидация сессий
- Управление cookies
- Автоматическое продление сессий

### 2. OAuth Providers (`src/lib/auth/oauth.ts`)
- Google OAuth с PKCE
- GitHub OAuth
- Генерация state параметров
- CSRF защита

### 3. User Management (`src/lib/auth/user.ts`)
- Создание пользователей через OAuth
- Связывание OAuth аккаунтов
- Поиск пользователей

### 4. Auth Middleware (`src/middleware/auth.ts`)
- Интеграция с GraphQL Yoga
- CSRF защита
- Context enrichment

## Конфигурация

### Environment Variables

Создайте `.env` файл в корне проекта:

```bash
# Database
DATABASE_URL=\"postgresql://username:password@localhost:5432/database_name\"

# Application
BASE_URL=\"http://localhost:3000\"
NODE_ENV=\"development\"

# Google OAuth
GOOGLE_CLIENT_ID=\"your_google_client_id\"
GOOGLE_CLIENT_SECRET=\"your_google_client_secret\"

# GitHub OAuth
GITHUB_CLIENT_ID=\"your_github_client_id\"
GITHUB_CLIENT_SECRET=\"your_github_client_secret\"
```

### Database Schema

Убедитесь, что ваша Prisma схема содержит необходимые модели:

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
  
  @@map(\"users\")
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  
  // Relations
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map(\"sessions\")
}
```

## Использование

### Базовая аутентификация в GraphQL

```typescript
// В ваших resolvers
builder.queryField('currentUser', (t) =>
  t.prismaField({
    type: 'User',
    nullable: true,
    authScopes: {
      authenticated: true, // Требует активную сессию
    },
    resolve: async (query, root, args, context) => {
      // context.session.user содержит данные аутентифицированного пользователя
      return context.session?.user || null;
    },
  }),
);
```

### Создание защищённых mutations

```typescript
builder.mutationField('createTodo', (t) =>
  t.prismaField({
    type: 'Todo',
    authScopes: {
      authenticated: true, // Только для аутентифицированных пользователей
    },
    args: {
      title: t.arg.string({ required: true }),
    },
    resolve: async (query, root, args, context) => {
      const userId = context.session!.user.id;
      
      return prisma.todo.create({
        ...query,
        data: {
          title: args.title,
          userId,
        },
      });
    },
  }),
);
```

### Использование admin scope

```typescript
builder.queryField('adminData', (t) =>
  t.field({
    type: 'String',
    authScopes: {
      admin: true, // Только для администраторов
    },
    resolve: () => 'Секретные данные администратора',
  }),
);
```

## API Reference

### Session Management

#### `generateSessionToken(): string`
Генерирует криптографически безопасный session токен.

#### `createSession(token: string, userId: string): Promise<Session>`
Создает новую сессию в базе данных.

#### `validateSessionToken(token: string): Promise<SessionWithUser | null>`
Валидирует session токен и возвращает данные сессии с пользователем.

#### `invalidateSession(sessionId: string): Promise<void>`
Удаляет конкретную сессию.

#### `invalidateAllUserSessions(userId: string): Promise<void>`
Удаляет все сессии пользователя (logout from all devices).

### Cookie Management

#### `setSessionTokenCookie(response: Response, token: string, expiresAt: Date): void`
Устанавливает безопасный HTTP-only cookie с session токеном.

#### `deleteSessionTokenCookie(response: Response): void`
Удаляет session cookie (для logout).

#### `parseSessionToken(cookieHeader: string | null): string | null`
Парсит session токен из Cookie header.

## Безопасность

### Features

- **Secure Random Tokens**: Использование `crypto.getRandomValues()`
- **HTTP-Only Cookies**: Защита от XSS атак
- **SameSite Cookies**: Защита от CSRF атак
- **CSRF Protection**: Валидация Origin header
- **Session Expiration**: Автоматическое истечение сессий (30 дней)
- **Session Extension**: Автопродление активных сессий

### Best Practices

1. **Всегда используйте HTTPS в production**
2. **Настройте правильные CORS политики**
3. **Регулярно проверяйте истекшие сессии**
4. **Логируйте подозрительную активность**
5. **Используйте strong CSP headers**

## Troubleshooting

### Распространённые проблемы

#### Session не создается
- Проверьте подключение к базе данных
- Убедитесь, что Prisma migrations выполнены
- Проверьте логи на предмет ошибок

#### OAuth не работает
- Проверьте environment variables
- Убедитесь, что redirect URLs корректны в OAuth приложениях
- Проверьте callback routes

#### CSRF ошибки
- Убедитесь, что Origin header отправляется
- Проверьте CORS настройки
- В development режиме CSRF проверка менее строгая

### Debug режим

Включите расширенное логирование:

```typescript
// В development режиме
if (process.env.NODE_ENV === 'development') {
  console.log('Session data:', sessionData);
  console.log('Auth context:', context);
}
```

## Миграция

См. [Migration Guide](../auth-migration/README.md) для инструкций по миграции с базовой системы аутентификации.

## OAuth Setup

Подробные инструкции по настройке OAuth провайдеров см. в [OAuth Documentation](../oauth/README.md).