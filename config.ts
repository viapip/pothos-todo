export default {
  extends: ['./config/base.config.ts'],
  
  // Environment-specific overrides using c12's built-in environment detection
  $development: {
    extends: ['./config/development.config.ts'],
  },
  
  $production: {
    extends: ['./config/production.config.ts'],
  },
  
  $test: {
    extends: ['./config/test.config.ts'],
  },
};