# Authentication & Authorization

Comprehensive authentication system with OAuth providers, JWT management, RBAC (Role-Based Access Control), and secure session handling.

## Overview

The authentication system provides:

- **OAuth Integration**: Google and GitHub providers
- **JWT Management**: Access/refresh token rotation with blacklisting
- **RBAC System**: Role-based permissions with fine-grained control
- **Session Management**: H3-based secure sessions with encryption
- **Multi-Device Support**: Device-specific token management

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   OAuth Flow    │────│  Session Mgmt   │────│  JWT Manager    │
│ (Google/GitHub) │    │   (H3-based)    │    │ (Access/Refresh)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   RBAC System   │────│   Permissions   │────│    Database     │
│  (Roles/Perms)  │    │   Validation    │    │ (User Storage)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_ACCESS_SECRET=your-super-secret-access-token-key-min-64-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-token-key-min-64-chars
JWT_ALGORITHM=HS256
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Session Configuration  
SESSION_SECRET=your-session-secret-key-min-32-chars
SESSION_NAME=pothos-session
SESSION_MAX_AGE=604800000
SESSION_SECURE=false
SESSION_SAME_SITE=lax

# OAuth - Google
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback

# OAuth - GitHub
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_REDIRECT_URI=http://localhost:4000/auth/github/callback

# Security
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
BCRYPT_ROUNDS=12
```

### JWT Configuration

```typescript
import { JWTManager } from './lib/auth/jwt-manager.js';

const jwtManager = new JWTManager({
  accessTokenSecret: process.env.JWT_ACCESS_SECRET,
  refreshTokenSecret: process.env.JWT_REFRESH_SECRET,
  algorithm: 'HS256',
  issuer: 'pothos-todo',
  audience: 'pothos-todo-users',
  accessTokenExpiry: 900,      // 15 minutes
  refreshTokenExpiry: 604800,   // 7 days
  enableBlacklist: true,
  enableRotation: true,
  maxConcurrentSessions: 5,
});
```

## Authentication Flow

### OAuth Authentication

#### Google OAuth

```typescript
// Initiate Google OAuth flow
GET /auth/google

// Handle OAuth callback
GET /auth/google/callback?code=...&state=...

// Flow:
// 1. Redirect to Google OAuth URL with PKCE
// 2. User authorizes application  
// 3. Google redirects to callback with authorization code
// 4. Exchange code for tokens
// 5. Fetch user profile from Google API
// 6. Create/update user in database
// 7. Generate JWT tokens
// 8. Set session cookie
// 9. Redirect to frontend
```

#### GitHub OAuth

```typescript
// Initiate GitHub OAuth flow
GET /auth/github

// Handle OAuth callback  
GET /auth/github/callback?code=...&state=...

// Similar flow to Google with GitHub-specific APIs
```

### JWT Token Management

#### Token Generation

```typescript
const tokenPair = await jwtManager.generateTokenPair(
  userId,
  ['user'],           // roles
  ['todo:read'],      // permissions
  {
    sessionId: 'sess_123',
    deviceId: 'device_456', 
    metadata: { ip: '192.168.1.1' }
  }
);

// Returns:
{
  accessToken: 'eyJhbGciOiJIUzI1NiIs...',
  refreshToken: 'eyJhbGciOiJIUzI1NiIs...',
  accessTokenExpiry: Date,
  refreshTokenExpiry: Date
}
```

#### Token Validation

```typescript
const validation = await jwtManager.validateAccessToken(accessToken);

if (validation.valid && validation.payload) {
  const { sub: userId, roles, permissions } = validation.payload;
  // User is authenticated
} else {
  // Token invalid, expired, or blacklisted
  throw new AuthenticationError(validation.error);
}
```

#### Token Refresh

```typescript
// Refresh expired access token
const newTokenPair = await jwtManager.refreshTokenPair(
  refreshToken,
  ['user'],
  ['todo:read', 'todo:write']
);

// Optional: Rotate refresh tokens (recommended for security)
```

#### Token Blacklisting

```typescript
// Blacklist specific token (logout)
jwtManager.blacklistToken(jti, expiry);

// Invalidate all user sessions (security incident)
await jwtManager.invalidateAllUserSessions(userId);
```

## Role-Based Access Control (RBAC)

### Roles & Permissions

```typescript
// Defined roles
export enum Role {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
  VIEWER = 'viewer',
}

// Defined permissions
export enum Permission {
  // Todo permissions
  TODO_READ = 'todo:read',
  TODO_WRITE = 'todo:write',
  TODO_DELETE = 'todo:delete',
  
  // User permissions  
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
  USER_ADMIN = 'user:admin',
  
  // System permissions
  SYSTEM_ADMIN = 'system:admin',
  SYSTEM_MONITOR = 'system:monitor',
}

// Role-permission mapping
const ROLE_PERMISSIONS = {
  [Role.VIEWER]: [
    Permission.TODO_READ,
    Permission.USER_READ,
  ],
  [Role.USER]: [
    Permission.TODO_READ,
    Permission.TODO_WRITE,
    Permission.TODO_DELETE,
    Permission.USER_READ,
  ],
  [Role.MODERATOR]: [
    ...ROLE_PERMISSIONS[Role.USER],
    Permission.USER_WRITE,
    Permission.SYSTEM_MONITOR,
  ],
  [Role.ADMIN]: [
    ...ROLE_PERMISSIONS[Role.MODERATOR], 
    Permission.USER_DELETE,
    Permission.USER_ADMIN,
    Permission.SYSTEM_ADMIN,
  ],
};
```

### Permission Validation

```typescript
import { validatePermissions } from './lib/auth/rbac.js';

// Check single permission
const hasPermission = validatePermissions(
  userPermissions,
  Permission.TODO_WRITE
);

// Check multiple permissions (all required)
const hasAllPermissions = validatePermissions(
  userPermissions,
  [Permission.TODO_WRITE, Permission.TODO_DELETE]
);

// Check multiple permissions (any required)
const hasAnyPermission = validatePermissions(
  userPermissions,
  [Permission.TODO_WRITE, Permission.TODO_DELETE],
  'any'
);
```

### GraphQL Integration

```typescript
// Directive-based authorization
builder.queryField('todos', (t) => t.prismaField({
  type: [Todo],
  authScopes: {
    authenticated: true,      // Requires authentication
  },
  resolve: async (query, source, args, context) => {
    // Additional permission check
    if (!validatePermissions(context.user.permissions, Permission.TODO_READ)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    
    return prisma.todo.findMany({
      ...query,
      where: { userId: context.user.id },
    });
  },
}));

// Admin-only mutation
builder.mutationField('deleteUser', (t) => t.field({
  type: 'Boolean',
  args: {
    id: t.arg.id({ required: true }),
  },
  authScopes: {
    admin: true,              // Requires admin role
  },
  resolve: async (source, { id }, context) => {
    validatePermissions(context.user.permissions, Permission.USER_DELETE);
    
    await prisma.user.delete({ where: { id } });
    return true;
  },
}));
```

## Session Management

### H3 Session Configuration

```typescript
import { sessionHooks } from 'h3-session';

const sessionConfig = {
  name: 'pothos-session',
  password: process.env.SESSION_SECRET,
  cookie: {
    domain: process.env.NODE_ENV === 'production' ? '.yourdomain.com' : undefined,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
  rolling: true,
  ttl: 7 * 24 * 60 * 60, // 7 days
};
```

### Session Data Structure

```typescript
interface UserSession {
  userId: string;
  roles: Role[];
  permissions: string[];
  sessionId: string;
  deviceId?: string;
  createdAt: Date;
  lastActivity: Date;
  metadata?: {
    ip: string;
    userAgent: string;
    location?: string;
  };
}
```

### Session Operations

```typescript
// Create session after successful authentication
await setUserSession(event, {
  userId: user.id,
  roles: user.roles,
  permissions: getUserPermissions(user.roles),
  sessionId: generateSessionId(),
  deviceId: getDeviceId(event),
  createdAt: new Date(),
  lastActivity: new Date(),
  metadata: {
    ip: getClientIP(event),
    userAgent: getHeader(event, 'user-agent'),
  },
});

// Get current session
const session = await getUserSession(event);

// Update session activity
await updateUserSession(event, {
  lastActivity: new Date(),
});

// Clear session (logout)
await clearUserSession(event);
```

## Middleware & Context

### Authentication Middleware

```typescript
export async function authMiddleware(event: H3Event): Promise<AuthContext | null> {
  // Try JWT from Authorization header
  const authHeader = getHeader(event, 'authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const validation = await jwtManager.validateAccessToken(token);
    
    if (validation.valid && validation.payload) {
      return {
        user: await getUserById(validation.payload.sub),
        session: null,
        isAuthenticated: true,
      };
    }
  }
  
  // Fallback to session-based auth
  const session = await getUserSession(event);
  if (session) {
    return {
      user: await getUserById(session.userId),
      session,
      isAuthenticated: true,
    };
  }
  
  return {
    user: null,
    session: null,
    isAuthenticated: false,
  };
}
```

### GraphQL Context

```typescript
export async function createGraphQLContext(event: H3Event): Promise<Context> {
  const auth = await authMiddleware(event);
  
  return {
    prisma,
    cache: cacheManager,
    loaders: createDataLoaders(),
    user: auth?.user || null,
    session: auth?.session || null,
    isAuthenticated: auth?.isAuthenticated || false,
    permissions: auth?.user?.permissions || [],
    roles: auth?.user?.roles || [],
  };
}
```

## Security Features

### Password Security

```typescript
import bcrypt from 'bcrypt';

// Hash password with salt rounds
const saltRounds = 12;
const hashedPassword = await bcrypt.hash(password, saltRounds);

// Verify password
const isValid = await bcrypt.compare(password, hashedPassword);
```

### CSRF Protection

```typescript
// Generate CSRF token
const csrfToken = generateSecureToken(32);
setCookie(event, 'csrf-token', csrfToken, {
  httpOnly: false,  // Accessible to JavaScript
  sameSite: 'strict',
  secure: true,
});

// Validate CSRF token
const tokenFromHeader = getHeader(event, 'x-csrf-token');
const tokenFromCookie = getCookie(event, 'csrf-token');

if (tokenFromHeader !== tokenFromCookie) {
  throw new ForbiddenError('CSRF token mismatch');
}
```

### Rate Limiting

```typescript
import { RateLimiter } from './lib/security/rate-limiter.js';

const rateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                  // Max 100 requests per window
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to auth routes
app.use('/auth', rateLimiter.middleware);
```

## API Reference

### Authentication Endpoints

```typescript
// OAuth Login
GET  /auth/google
GET  /auth/github

// OAuth Callbacks  
GET  /auth/google/callback
GET  /auth/github/callback

// Session Management
POST /auth/logout           // Logout current session
POST /auth/logout/all       // Logout all sessions

// Token Management
POST /auth/refresh          // Refresh access token
POST /auth/revoke           // Revoke refresh token
```

### GraphQL Auth Fields

```graphql
type Query {
  me: User                  # Current authenticated user
  myProfile: UserProfile    # Current user profile
  mySessions: [Session!]!   # Current user sessions
}

type Mutation {
  updateProfile(input: ProfileInput!): User
  changePassword(oldPassword: String!, newPassword: String!): Boolean
  terminateSession(sessionId: ID!): Boolean
  terminateAllSessions: Boolean
}

type User {
  id: ID!
  email: String!
  name: String
  roles: [Role!]!
  permissions: [Permission!]!
  createdAt: DateTime!
  lastLogin: DateTime
}
```

## Error Handling

### Custom Auth Errors

```typescript
export class AuthenticationError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class TokenExpiredError extends Error {
  constructor(message = 'Token has expired') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}
```

### Error Responses

```typescript
// GraphQL error formatting
export function formatAuthError(error: Error): GraphQLError {
  if (error instanceof AuthenticationError) {
    return new GraphQLError(error.message, {
      extensions: {
        code: 'UNAUTHENTICATED',
        http: { status: 401 },
      },
    });
  }
  
  if (error instanceof AuthorizationError) {
    return new GraphQLError(error.message, {
      extensions: {
        code: 'FORBIDDEN', 
        http: { status: 403 },
      },
    });
  }
  
  return new GraphQLError('Internal server error', {
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
      http: { status: 500 },
    },
  });
}
```

## Best Practices

### Security Guidelines

1. **Use HTTPS in production**
2. **Implement proper CORS policies**
3. **Enable JWT token rotation**
4. **Use strong, unique secrets**
5. **Implement rate limiting**
6. **Log authentication events**
7. **Monitor for suspicious activity**
8. **Regular security audits**

### Performance Tips

1. **Cache user sessions**
2. **Use DataLoader for batch operations**
3. **Implement proper token expiration**
4. **Monitor token usage patterns**
5. **Optimize database queries**

### Development Workflow

```bash
# Set up OAuth applications (development)
# Google: https://console.developers.google.com
# GitHub: https://github.com/settings/applications

# Test authentication flows
curl -X GET http://localhost:4000/auth/google
curl -X POST http://localhost:4000/auth/logout

# Monitor auth events
DEBUG=auth:* bun run start
```