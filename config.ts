import baseConfig from './config/base.config';
import developmentConfig from './config/development.config';
import productionConfig from './config/production.config';
import testConfig from './config/test.config';

const env = process.env.NODE_ENV || 'development';

// Deep merge function
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item: any): boolean {
  return (item && typeof item === "object" && !Array.isArray(item));
}

// Start with base config
let config = { ...baseConfig };

// Merge environment-specific config
switch (env) {
  case 'development':
    config = deepMerge(config, developmentConfig);
    break;
  case 'production':
    config = deepMerge(config, productionConfig);
    break;
  case 'test':
    config = deepMerge(config, testConfig);
    break;
}

export default config;