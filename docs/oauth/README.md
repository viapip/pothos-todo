# OAuth Integration Guide

Этот гид покрывает полную настройку OAuth провайдеров (Google и GitHub) для системы аутентификации на базе Lucia.

## Обзор

Наша OAuth интеграция поддерживает:
- **Google OAuth 2.0** с PKCE (Proof Key for Code Exchange)
- **GitHub OAuth 2.0** 
- Автоматическое создание пользователей
- Связывание существующих аккаунтов
- Безопасное управление state параметрами

## Архитектура OAuth Flow

```
1. User clicks "Login with Google/GitHub"
   ↓
2. App redirects to OAuth provider with state + PKCE
   ↓  
3. User authorizes on OAuth provider
   ↓
4. Provider redirects to callback URL with code + state
   ↓
5. App validates state, exchanges code for tokens
   ↓
6. App fetches user info, creates/links account
   ↓
7. App creates session and redirects to app
```

## Google OAuth Setup

### 1. Создание Google OAuth Application

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите Google+ API:
   - APIs & Services → Library
   - Найдите "Google+ API" и включите
4. Создайте OAuth 2.0 credentials:
   - APIs & Services → Credentials
   - Create Credentials → OAuth 2.0 Client IDs
   - Application type: Web application

### 2. Настройка Redirect URLs

```
Authorized JavaScript origins:
- http://localhost:3000 (development)
- https://yourdomain.com (production)

Authorized redirect URIs:
- http://localhost:3000/auth/google/callback (development)  
- https://yourdomain.com/auth/google/callback (production)
```

### 3. Environment Variables

```bash
# .env
GOOGLE_CLIENT_ID="your_google_client_id_here"
GOOGLE_CLIENT_SECRET="your_google_client_secret_here"
```

### 4. Google OAuth Implementation

```typescript
// src/routes/auth/google.ts
import { google, generateState, generateCodeVerifier } from '@/lib/auth';

export async function handleGoogleLogin(request: Request): Promise<Response> {
  try {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    
    // Scopes для получения базовой информации пользователя
    const scopes = ['openid', 'profile', 'email'];
    const url = google.createAuthorizationURL(state, codeVerifier, scopes);
    
    const response = new Response(null, {
      status: 302,
      headers: { Location: url.toString() },
    });
    
    // Устанавливаем cookies для безопасности
    setOAuthStateCookie(response, state, 'google');
    setCodeVerifierCookie(response, codeVerifier, 'google');
    
    return response;
  } catch (error) {
    console.error('Google OAuth initiation failed:', error);
    return new Response('OAuth Error', { status: 500 });
  }
}
```

### 5. Google Callback Handler

```typescript  
// src/routes/auth/google-callback.ts
import { decodeIdToken } from 'arctic';

export async function handleGoogleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  // Валидация параметров
  if (!code || !state) {
    return new Response('Missing parameters', { status: 400 });
  }
  
  // Проверка state и code verifier из cookies
  const cookieHeader = request.headers.get('Cookie');
  const storedState = parseOAuthState(cookieHeader, 'google');
  const codeVerifier = parseCodeVerifier(cookieHeader);
  
  if (!validateOAuthState(state, storedState) || !codeVerifier) {
    return new Response('Invalid state', { status: 400 });
  }
  
  try {
    // Обмен code на tokens
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    
    // Декодируем ID token для получения информации пользователя
    const claims = decodeIdToken(tokens.idToken()) as any;
    const userInfo = {
      sub: claims.sub,
      name: claims.name,
      email: claims.email,
      picture: claims.picture,
    };
    
    // Создаем или находим пользователя
    const user = await handleGoogleOAuth(userInfo);
    
    // Создаем сессию
    const sessionToken = generateSessionToken();
    const session = await createSession(sessionToken, user.id);
    
    // Устанавливаем cookie и редиректим
    const response = new Response(null, {
      status: 302,
      headers: { Location: '/' },
    });
    
    setSessionTokenCookie(response, sessionToken, session.expiresAt);
    return response;
    
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    return new Response('Authentication failed', { status: 400 });
  }
}
```

## GitHub OAuth Setup

### 1. Создание GitHub OAuth App

1. Перейдите в GitHub Settings:
   - GitHub → Settings → Developer settings → OAuth Apps
2. Нажмите "New OAuth App"
3. Заполните форму:
   - Application name: "Your App Name"
   - Homepage URL: `https://yourdomain.com`
   - Authorization callback URL: `https://yourdomain.com/auth/github/callback`

### 2. Environment Variables

```bash
# .env
GITHUB_CLIENT_ID="your_github_client_id"
GITHUB_CLIENT_SECRET="your_github_client_secret"
```

### 3. GitHub OAuth Implementation

```typescript
// src/routes/auth/github.ts
export async function handleGitHubLogin(request: Request): Promise<Response> {
  try {
    const state = generateState();
    
    // GitHub не требует PKCE, только state для CSRF защиты
    const url = github.createAuthorizationURL(state, ['user:email']);
    
    const response = new Response(null, {
      status: 302,
      headers: { Location: url.toString() },
    });
    
    setOAuthStateCookie(response, state, 'github');
    return response;
    
  } catch (error) {
    console.error('GitHub OAuth initiation failed:', error);
    return new Response('OAuth Error', { status: 500 });
  }
}
```

### 4. GitHub Callback Handler

```typescript
// src/routes/auth/github-callback.ts
export async function handleGitHubCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  if (!code || !state) {
    return new Response('Missing parameters', { status: 400 });
  }
  
  // Валидация state
  const cookieHeader = request.headers.get('Cookie');
  const storedState = parseOAuthState(cookieHeader, 'github');
  
  if (!validateOAuthState(state, storedState)) {
    return new Response('Invalid state', { status: 400 });
  }
  
  try {
    // Получаем tokens
    const tokens = await github.validateAuthorizationCode(code);
    
    // Получаем информацию пользователя из GitHub API
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken()}`,
        'User-Agent': 'Your-App-Name',
      },
    });
    
    const userData = await userResponse.json();
    
    // Получаем email если он не публичный
    let email = userData.email;
    if (!email) {
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken()}`,
          'User-Agent': 'Your-App-Name',
        },
      });
      
      const emails = await emailResponse.json();
      const primaryEmail = emails.find((e: any) => e.primary && e.verified);
      email = primaryEmail?.email;
    }
    
    const userInfo = {
      id: userData.id,
      login: userData.login,
      email,
      name: userData.name || userData.login,
      avatar_url: userData.avatar_url,
    };
    
    // Создаем/находим пользователя и создаем сессию
    const user = await handleGitHubOAuth(userInfo);
    const sessionToken = generateSessionToken();
    const session = await createSession(sessionToken, user.id);
    
    const response = new Response(null, {
      status: 302,
      headers: { Location: '/' },
    });
    
    setSessionTokenCookie(response, sessionToken, session.expiresAt);
    return response;
    
  } catch (error) {
    console.error('GitHub OAuth callback failed:', error);
    return new Response('Authentication failed', { status: 400 });
  }
}
```

## Frontend Integration

### React/Next.js Example

```tsx
// components/AuthButtons.tsx
export function AuthButtons() {
  const handleGoogleLogin = () => {
    window.location.href = '/auth/google';
  };
  
  const handleGitHubLogin = () => {
    window.location.href = '/auth/github';
  };
  
  return (
    <div className="auth-buttons">
      <button onClick={handleGoogleLogin} className="google-btn">
        <GoogleIcon /> Continue with Google
      </button>
      
      <button onClick={handleGitHubLogin} className="github-btn">
        <GitHubIcon /> Continue with GitHub  
      </button>
    </div>
  );
}
```

### Svelte Example

```svelte
<!-- AuthButtons.svelte -->
<script>
  function loginWithGoogle() {
    window.location.href = '/auth/google';
  }
  
  function loginWithGitHub() {
    window.location.href = '/auth/github';
  }
</script>

<div class="auth-buttons">
  <button on:click={loginWithGoogle} class="google-btn">
    Continue with Google
  </button>
  
  <button on:click={loginWithGitHub} class="github-btn">
    Continue with GitHub
  </button>
</div>
```

## User Account Linking

### Автоматическое связывание по email

```typescript
// src/lib/auth/user.ts
export async function handleGoogleOAuth(userInfo: GoogleUserInfo): Promise<User> {
  // 1. Ищем пользователя по Google ID
  let user = await getUserByGoogleId(userInfo.sub);
  if (user) return user;
  
  // 2. Ищем пользователя по email
  user = await getUserByEmail(userInfo.email);
  if (user) {
    // Связываем Google аккаунт с существующим пользователем
    return await linkGoogleToUser(user.id, userInfo.sub);
  }
  
  // 3. Создаем нового пользователя
  return await createUserWithGoogle(userInfo);
}
```

### Ручное связывание аккаунтов

```typescript
// GraphQL mutation для связывания аккаунтов
builder.mutationField('linkOAuthAccount', (t) =>
  t.field({
    type: 'Boolean',
    authScopes: { authenticated: true },
    args: {
      provider: t.arg({ type: 'String', required: true }),
      code: t.arg({ type: 'String', required: true }),
    },
    resolve: async (root, args, context) => {
      const userId = context.session!.user.id;
      
      if (args.provider === 'google') {
        // Validate code and link Google account
        // Implementation details...
      }
      
      return true;
    },
  }),
);
```

## Error Handling

### Common OAuth Errors

```typescript
// src/lib/auth/oauth-errors.ts
export enum OAuthError {
  INVALID_REQUEST = 'invalid_request',
  UNAUTHORIZED_CLIENT = 'unauthorized_client', 
  ACCESS_DENIED = 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE = 'unsupported_response_type',
  INVALID_SCOPE = 'invalid_scope',
  SERVER_ERROR = 'server_error',
  TEMPORARILY_UNAVAILABLE = 'temporarily_unavailable',
}

export function handleOAuthError(error: string, description?: string): Response {
  const errorMap = {
    [OAuthError.ACCESS_DENIED]: {
      message: 'Доступ отклонен пользователем',
      status: 401,
    },
    [OAuthError.INVALID_REQUEST]: {
      message: 'Некорректный запрос OAuth',
      status: 400,
    },
    [OAuthError.SERVER_ERROR]: {
      message: 'Ошибка сервера OAuth провайдера',
      status: 502,
    },
    // Добавьте другие ошибки...
  };
  
  const errorInfo = errorMap[error as OAuthError] || {
    message: 'Неизвестная ошибка OAuth',
    status: 400,
  };
  
  return new Response(JSON.stringify({
    error,
    description,
    message: errorInfo.message,
  }), {
    status: errorInfo.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Testing OAuth Flow

### Unit Tests

```typescript
// src/test/oauth.test.ts
import { test, expect } from 'bun:test';
import { generateState, validateOAuthState } from '@/lib/auth';

test('OAuth state generation and validation', () => {
  const state = generateState();
  
  expect(state).toBeTypeOf('string');
  expect(state.length).toBeGreaterThan(20);
  expect(validateOAuthState(state, state)).toBe(true);
  expect(validateOAuthState(state, 'different')).toBe(false);
});

test('Google user info processing', async () => {
  const mockUserInfo = {
    sub: 'google_user_id_123',
    name: 'Test User',
    email: 'test@example.com',
    picture: 'https://example.com/avatar.jpg',
  };
  
  const user = await handleGoogleOAuth(mockUserInfo);
  
  expect(user.email).toBe('test@example.com');
  expect(user.googleId).toBe('google_user_id_123');
});
```

### Integration Tests

```typescript
// src/test/oauth-integration.test.ts
test('Full Google OAuth flow', async () => {
  // 1. Initiate OAuth
  const initiateResponse = await fetch('http://localhost:3000/auth/google');
  expect(initiateResponse.status).toBe(302);
  
  const location = initiateResponse.headers.get('Location');
  expect(location).toContain('accounts.google.com');
  
  // 2. Mock callback (в реальности это сделает Google)
  const mockCallback = new URL('http://localhost:3000/auth/google/callback');
  mockCallback.searchParams.set('code', 'mock_auth_code');
  mockCallback.searchParams.set('state', 'mock_state');
  
  // Test callback handling
  // (Для полного теста нужны mock OAuth responses)
});
```

## Security Considerations

### State Parameter Security
- Используйте криптографически безопасную генерацию state
- Храните state в HTTP-only cookies
- Всегда валидируйте state в callback

### PKCE Security (Google)
- Генерируйте code verifier с достаточной энтропией
- Используйте S256 challenge method
- Не логируйте code verifier

### Token Security
- Никогда не логируйте access tokens
- Используйте tokens только для получения пользовательских данных
- Не храните OAuth tokens долгосрочно

## Troubleshooting

### Common Issues

**1. "redirect_uri_mismatch"**
```
Решение: Проверьте что callback URL точно совпадает в OAuth приложении
```

**2. "invalid_client"**
```
Решение: Проверьте CLIENT_ID и CLIENT_SECRET
```

**3. "access_denied"**  
```
Решение: Пользователь отклонил авторизацию - это нормально
```

**4. State validation fails**
```
Решение: Проверьте что cookies правильно устанавливаются и читаются
```

### Debug Mode

```typescript
// Enable OAuth debugging
if (process.env.NODE_ENV === 'development') {
  console.log('OAuth Debug Info:', {
    state,
    storedState,
    codeVerifier,
    userInfo,
  });
}
```

## Production Checklist

- [ ] OAuth приложения созданы для production домена
- [ ] CLIENT_ID и CLIENT_SECRET настроены в production environment
- [ ] Callback URLs настроены для production домена
- [ ] HTTPS включен (обязательно для OAuth)
- [ ] Error handling и logging настроены
- [ ] Rate limiting включен для auth endpoints
- [ ] Security headers настроены