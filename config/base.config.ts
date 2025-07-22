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

  // Telemetry Configuration
  telemetry: {
    enabled: process.env.TELEMETRY_ENABLED === 'true' || false,
    serviceName: process.env.TELEMETRY_SERVICE_NAME || 'pothos-todo-api',
    serviceVersion: process.env.TELEMETRY_SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    exporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    exporterHeaders: process.env.OTEL_EXPORTER_OTLP_HEADERS 
      ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) 
      : undefined,
    samplingRate: process.env.TELEMETRY_SAMPLING_RATE 
      ? parseFloat(process.env.TELEMETRY_SAMPLING_RATE) 
      : 1.0,
  },

  // Cache Configuration
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'pothos:',
      ttl: parseInt(process.env.CACHE_DEFAULT_TTL || '3600'), // 1 hour default
    },
  },
};