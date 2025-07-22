export default {
  // Test Server Configuration
  server: {
    port: 0, // Use random available port for testing
    host: 'localhost',
  },

  // Test Database Configuration
  database: {
    url: process.env.TEST_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pothos_todo_test',
    name: 'pothos_todo_test',
  },

  // Test Logger Configuration
  logger: {
    level: 'silent',
    console: {
      enabled: false,
    },
  },

  // Test Build Configuration
  build: {
    minify: false,
    sourcemap: true,
    watch: false,
  },

  // Test GraphQL Configuration
  graphql: {
    introspection: true,
    playground: false,
    maskedErrors: false,
  },

  // Test Environment Settings
  env: {
    hotReload: false,
    watchFiles: false,
    isTest: true,
  },
};