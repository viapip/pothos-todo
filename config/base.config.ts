export default {
  // Server Configuration
  server: {
    port: 4000,
    host: 'localhost',
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
    session: {
      secret: process.env.SESSION_SECRET || 'your-secret-key-here-change-in-production',
      name: 'h3-session',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      secure: false, // Will be overridden in production
      sameSite: 'lax',
    },
    oauth: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback',
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:4000/auth/github/callback',
      },
    },
  },

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pothos_todo',
    host: 'localhost',
    port: 5432,
    name: 'pothos_todo',
    user: 'postgres',
    password: 'password',
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || 'redispassword',
    maxRetriesPerRequest: 3,
    db: 0,
    keyPrefix: 'pothos-todo:',
    connectTimeout: 10000,
    lazyConnect: true,
  },

  // Logger Configuration
  logger: {
    level: 'info',
    service: 'pothos-todo',
    version: '1.0.0',
    dir: '.out/logs',
    files: {
      debug: 'debug.log',
      error: 'errors.log',
    },
    console: {
      enabled: true,
      colors: {
        error: 'red',
        warn: 'yellow',
        info: 'blue',
        debug: 'gray',
      },
    },
  },

  // Build Configuration
  build: {
    minify: false,
    sourcemap: true,
    target: 'node18',
    platform: 'node',
    outDir: 'dist',
    clean: true,
    dts: true,
    treeshake: true,
    report: true,
  },

  // CLI Configuration
  cli: {
    name: 'pothos-cli',
    dirname: 'pothos-cli',
    commands: './dist/commands',
    topicSeparator: ':',
  },

  // Security Configuration
  security: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'development' ? 1000 : 100,
      message: 'Too many requests from this IP, please try again later.',
    },
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    },
    headers: {
      hsts: process.env.NODE_ENV === 'production',
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
    },
  },

  // Docker Configuration
  docker: {
    postgres: {
      image: 'postgres:15-alpine',
      container: 'pothos-todo-postgres',
      port: 5432,
      database: 'pothos_todo',
      user: 'postgres',
      password: 'password',
    },
    redis: {
      image: 'redis:7-alpine',
      container: 'pothos-todo-redis',
      port: 6379,
      password: 'redispassword',
    },
    qdrant: {
      image: 'qdrant/qdrant:latest',
      container: 'pothos-todo-qdrant',
      port: 6333,
      grpcPort: 6334,
    },
  },

  // GraphQL Configuration
  graphql: {
    endpoint: '/graphql',
    introspection: true,
    playground: true,
    maskedErrors: false,
  },

  // Environment Configuration
  env: {
    name: process.env.NODE_ENV || 'development',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
  },
};