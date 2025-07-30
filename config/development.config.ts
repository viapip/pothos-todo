export default {
  extends: ['./base.config.ts'],
  
  // Development Server Configuration
  server: {
    port: parseInt(process.env.PORT || '4000'),
    host: '0.0.0.0', // Allow external connections in development
  },

  // Development Logger Configuration
  logger: {
    level: 'debug',
    console: {
      enabled: true,
    },
  },

  // Development Build Configuration
  build: {
    minify: false,
    sourcemap: true,
    watch: true,
  },

  // Development GraphQL Configuration
  graphql: {
    introspection: true,
    playground: true,
    maskedErrors: false,
  },

  // Development Environment Settings
  env: {
    hotReload: true,
    watchFiles: true,
  },
};