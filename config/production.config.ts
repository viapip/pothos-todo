export default {
  extends: ['./base.config.ts'],
  
  // Production Server Configuration
  server: {
    port: parseInt(process.env.PORT || '4000'),
    host: '0.0.0.0',
    cors: {
      origin: process.env.FRONTEND_URL || undefined,
      credentials: true,
    },
  },

  // Production Logger Configuration
  logger: {
    level: 'info',
    console: {
      enabled: false, // Disable console logging in production
    },
  },

  // Production Build Configuration
  build: {
    minify: true,
    sourcemap: false,
    watch: false,
  },

  // Production GraphQL Configuration
  graphql: {
    introspection: false,
    playground: false,
    maskedErrors: true,
  },

  // Production Environment Settings
  env: {
    hotReload: false,
    watchFiles: false,
  },
};