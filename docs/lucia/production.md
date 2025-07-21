# Production Configuration для Lucia

Этот гид покрывает важные аспекты настройки Lucia для production окружения.

## Security Checklist

### ✅ Environment Variables

```bash
# Production environment
NODE_ENV="production"
BASE_URL="https://yourdomain.com"

# Strong database connection
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# OAuth credentials (production values)
GOOGLE_CLIENT_ID="production_google_client_id"
GOOGLE_CLIENT_SECRET="secure_google_client_secret"
GITHUB_CLIENT_ID="production_github_client_id"
GITHUB_CLIENT_SECRET="secure_github_client_secret"

# Session configuration
SESSION_EXPIRES_IN_SECONDS=2592000  # 30 дней
SESSION_CLEANUP_INTERVAL=86400      # 24 часа
```

### ✅ HTTPS Configuration

**Обязательно используйте HTTPS в production!**

```typescript
// src/lib/auth/session.ts - Production cookie settings
export function setSessionTokenCookie(response: any, token: string, expiresAt: Date): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const cookieValue = [
    `session=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Expires=${expiresAt.toUTCString()}`,
    isProduction ? 'Secure' : '', // HTTPS only в production
  ].filter(Boolean).join('; ');
  
  response.headers.append('Set-Cookie', cookieValue);
}
```

### ✅ Database Security

```prisma
// Индексы для производительности
model Session {
  id        String   @id @default(cuid())
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])           // Для быстрого поиска сессий пользователя
  @@index([expiresAt])        // Для cleanup expired sessions
  @@map("sessions")
}

model User {
  id        String @id @default(cuid())
  email     String @unique
  googleId  String? @unique  
  githubId  String? @unique
  
  @@index([email])            // Для быстрого поиска по email
  @@index([googleId])         // Для OAuth lookup
  @@index([githubId])         // Для OAuth lookup
  @@map("users")
}
```

### ✅ CORS Configuration

```typescript
// src/server.ts or where you configure your server
const corsConfig = {
  origin: [
    'https://yourdomain.com',
    'https://www.yourdomain.com',
    // Не включайте localhost в production!
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
};
```

### ✅ Enhanced CSRF Protection

```typescript
// src/middleware/auth.ts - Enhanced CSRF middleware
export function csrfMiddleware(request: Request): boolean {
  const method = request.method;
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const host = request.headers.get('Host');
  
  // Allow safe methods
  if (method === 'GET' || method === 'HEAD') {
    return true;
  }
  
  // In production, be stricter about origin validation
  if (process.env.NODE_ENV === 'production') {
    const allowedOrigins = [
      'https://yourdomain.com',
      'https://www.yourdomain.com',
    ];
    
    // Check both Origin and Referer
    const validOrigin = origin && allowedOrigins.includes(origin);
    const validReferer = referer && allowedOrigins.some(allowed => 
      referer.startsWith(allowed)
    );
    
    return validOrigin || validReferer;
  }
  
  // Development fallback
  return origin === `https://${host}` || origin === `http://${host}`;
}
```

## Performance Optimization

### Session Cleanup Job

Создайте cron job для очистки истекших сессий:

```typescript
// src/jobs/cleanup-sessions.ts
import prisma from '@/lib/prisma';

export async function cleanupExpiredSessions() {
  try {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    
    console.log(`Cleaned up ${result.count} expired sessions`);
    return result.count;
  } catch (error) {
    console.error('Session cleanup failed:', error);
    throw error;
  }
}

// Запускайте каждые 24 часа
setInterval(cleanupExpiredSessions, 24 * 60 * 60 * 1000);
```

### Database Connection Pooling

```typescript
// src/lib/prisma.ts - Production optimizations
import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma: PrismaClient | undefined;
}

const prisma = globalThis.__prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

export default prisma;
```

### Session Token Generation Optimization

```typescript
// src/lib/auth/session.ts - Production-optimized token generation
export function generateSessionToken(): string {
  // Используем больше entropy для production
  const bytes = new Uint8Array(process.env.NODE_ENV === 'production' ? 32 : 24);
  crypto.getRandomValues(bytes);
  
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

## Monitoring и Logging

### Security Event Logging

```typescript
// src/lib/auth/security-logger.ts
export class SecurityLogger {
  static logFailedLogin(email: string, ip: string, reason: string) {
    console.warn('SECURITY: Failed login attempt', {
      email,
      ip,
      reason,
      timestamp: new Date().toISOString(),
    });
    
    // В production отправляйте в систему мониторинга
    if (process.env.NODE_ENV === 'production') {
      // Отправить в Sentry, DataDog, etc.
    }
  }
  
  static logSuccessfulLogin(userId: string, ip: string) {
    console.info('SECURITY: Successful login', {
      userId,
      ip,
      timestamp: new Date().toISOString(),
    });
  }
  
  static logLogout(userId: string, sessionId: string) {
    console.info('SECURITY: User logout', {
      userId,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### Health Check Endpoints

```typescript
// src/routes/health.ts
export async function healthCheck(): Promise<Response> {
  try {
    // Проверяем подключение к базе данных
    await prisma.$queryRaw`SELECT 1`;
    
    // Проверяем количество активных сессий
    const activeSessions = await prisma.session.count({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
    });
    
    return new Response(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      activeSessions,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: error.message,
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

## Rate Limiting

```typescript
// src/middleware/rate-limit.ts
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimitMiddleware(
  request: Request,
  maxRequests = 10,
  windowMs = 15 * 60 * 1000 // 15 минут
): boolean {
  const ip = request.headers.get('CF-Connecting-IP') || 
             request.headers.get('X-Forwarded-For') ||
             'unknown';
  
  const now = Date.now();
  const windowStart = now - windowMs;
  
  // Очищаем старые записи
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < windowStart) {
      rateLimitStore.delete(key);
    }
  }
  
  const current = rateLimitStore.get(ip) || { count: 0, resetTime: now + windowMs };
  
  if (current.count >= maxRequests && current.resetTime > now) {
    return false; // Rate limited
  }
  
  current.count++;
  rateLimitStore.set(ip, current);
  
  return true; // Allowed
}
```

## Deployment Considerations

### Docker Configuration

```dockerfile
# Dockerfile
FROM oven/bun:1-alpine as base

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --production

# Build application
COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1-alpine as production

WORKDIR /app

COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./

# Create non-root user
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
USER app

EXPOSE 3000

CMD ["bun", "run", "start"]
```

### Environment Secrets

```bash
# Используйте secret management системы
# AWS Secrets Manager, Azure Key Vault, etc.

# Никогда не коммитьте .env файлы в production!
echo ".env*" >> .gitignore
```

### SSL/TLS Configuration

```nginx
# nginx.conf для reverse proxy
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Security Monitoring

### Alerts to Set Up

1. **Multiple failed login attempts** - возможная brute force атака
2. **Unusual session creation patterns** - возможный account takeover
3. **Mass session invalidation** - возможный security incident  
4. **Database connection failures** - infrastructure issues
5. **High response times on auth endpoints** - performance issues

### Metrics to Track

```typescript
// Примеры метрик для мониторинга
export const authMetrics = {
  // Количество активных сессий
  activeSessions: () => prisma.session.count({
    where: { expiresAt: { gt: new Date() } }
  }),
  
  // Среднее время жизни сессии
  averageSessionDuration: async () => {
    // Implement based on your monitoring system
  },
  
  // OAuth success rate
  oauthSuccessRate: {
    google: 0, // Track success/failure ratio
    github: 0,
  },
  
  // Rate limit violations
  rateLimitViolations: 0,
};
```

## Backup и Recovery

```bash
# Регулярные бэкапы сессий (опционально)
# В большинстве случаев сессии можно не бэкапить
# так как пользователи могут заново авторизоваться

# Но обязательно бэкапьте users таблицу
pg_dump -t users $DATABASE_URL > users_backup.sql
```

## Testing в Production-like Environment

```typescript
// src/test/load-test.ts
import { test, expect } from 'bun:test';

test('Session creation under load', async () => {
  const promises = Array(100).fill(null).map(async () => {
    const token = generateSessionToken();
    const session = await createSession(token, 'test-user-id');
    return session;
  });
  
  const results = await Promise.allSettled(promises);
  const successful = results.filter(r => r.status === 'fulfilled').length;
  
  expect(successful).toBeGreaterThan(95); // 95% success rate
});
```

Следование этим guidelines обеспечит безопасную и производительную работу Lucia в production окружении.