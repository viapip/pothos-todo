export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    origin: string | string[] | undefined;
    credentials: boolean;
  };
  session?: {
    secret: string;
    name?: string;
    maxAge?: number;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
  };
  oauth?: {
    google?: {
      clientId: string;
      clientSecret: string;
      redirectUri?: string;
    };
    github?: {
      clientId: string;
      clientSecret: string;
      redirectUri?: string;
    };
  };
}

export interface DatabaseConfig {
  url: string;
  host?: string;
  port?: number;
  name?: string;
  user?: string;
  password?: string;
}

export interface LoggerConfig {
  level: 'error' | 'warn' | 'info' | 'debug' | 'silent';
  service: string;
  version?: string;
  dir?: string;
  files?: {
    debug: string;
    error: string;
  };
  console?: {
    enabled: boolean;
    colors?: {
      error: string;
      warn: string;
      info: string;
      debug: string;
    };
  };
}

export interface BuildConfig {
  minify?: boolean;
  sourcemap?: boolean;
  target?: string;
  platform?: string;
  outDir?: string;
  clean?: boolean;
  dts?: boolean;
  treeshake?: boolean;
  report?: boolean;
  watch?: boolean;
}

export interface CLIConfig {
  name?: string;
  dirname?: string;
  commands?: string;
  topicSeparator?: string;
}

export interface DockerConfig {
  postgres?: {
    image?: string;
    container?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  };
  qdrant?: {
    image?: string;
    container?: string;
    port?: number;
    grpcPort?: number;
  };
}

export interface GraphQLConfig {
  endpoint?: string;
  introspection?: boolean;
  playground?: boolean;
  maskedErrors?: boolean;
}

export interface EnvironmentConfig {
  name?: string;
  isDevelopment?: boolean;
  isProduction?: boolean;
  isTest?: boolean;
  hotReload?: boolean;
  watchFiles?: boolean;
}

export interface AppConfig {
  server?: ServerConfig;
  database?: DatabaseConfig;
  logger?: LoggerConfig;
  build?: BuildConfig;
  cli?: CLIConfig;
  docker?: DockerConfig;
  graphql?: GraphQLConfig;
  env?: EnvironmentConfig;
}

// Helper types for configuration validation
export type ConfigKey = keyof AppConfig;
export type ConfigValue<T extends ConfigKey> = AppConfig[T];

// Environment-specific configuration overrides
export interface ConfigOverrides {
  server?: Partial<ServerConfig>;
  database?: Partial<DatabaseConfig>;
  logger?: Partial<LoggerConfig>;
  build?: Partial<BuildConfig>;
  cli?: Partial<CLIConfig>;
  docker?: Partial<DockerConfig>;
  graphql?: Partial<GraphQLConfig>;
  env?: Partial<EnvironmentConfig>;
}

// c12 configuration with environment overrides
export interface C12Config extends AppConfig {
  $development?: ConfigOverrides;
  $production?: ConfigOverrides;
  $test?: ConfigOverrides;
  $env?: Record<string, ConfigOverrides>;
}

// Configuration loader result
export interface ConfigResult {
  config: AppConfig;
  configFile?: string;
  layers?: Array<{
    config: Partial<AppConfig>;
    configFile?: string;
    cwd?: string;
  }>;
}

// Configuration validation schema
export interface ConfigSchema {
  [key: string]: {
    type: string;
    required?: boolean;
    default?: any;
    validate?: (value: any) => boolean;
    description?: string;
  };
}

// Configuration watcher options
export interface ConfigWatchOptions {
  onUpdate?: (config: AppConfig) => void;
  onWatch?: (event: { type: string; path: string }) => void;
  debounce?: number;
}

// Export default configuration for module resolution
export type { AppConfig as default };