import { DirectiveLocation, GraphQLString, GraphQLInt, GraphQLBoolean, GraphQLDirective } from 'graphql';

/**
 * Simple performance directives for GraphQL schema
 * These can be used with schema transforms or custom execution
 */

export const traceDirective = new GraphQLDirective({
  name: 'trace',
  description: 'Add detailed tracing to any field',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    name: { type: GraphQLString },
    includeArgs: { type: GraphQLBoolean, defaultValue: true },
  },
});

export const cacheDirective = new GraphQLDirective({
  name: 'cache',
  description: 'Add caching to any field',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    ttl: { type: GraphQLInt, defaultValue: 300 }, // 5 minutes default
    scope: { type: GraphQLString, defaultValue: 'PUBLIC' }, // PUBLIC or PRIVATE
    key: { type: GraphQLString }, // Custom cache key
  },
});

export const rateLimitDirective = new GraphQLDirective({
  name: 'rateLimit',
  description: 'Add rate limiting to mutations',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    limit: { type: GraphQLInt, defaultValue: 10 },
    window: { type: GraphQLInt, defaultValue: 60 }, // seconds
    key: { type: GraphQLString, defaultValue: 'ip' }, // ip, user, custom
  },
});

export const timeoutDirective = new GraphQLDirective({
  name: 'timeout',
  description: 'Add timeout to field resolution',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    ms: { type: GraphQLInt, defaultValue: 5000 }, // 5 seconds default
  },
});

export const complexityDirective = new GraphQLDirective({
  name: 'complexity',
  description: 'Calculate and limit query complexity',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    value: { type: GraphQLInt, defaultValue: 1 },
    multipliers: { type: GraphQLString }, // JSON array of argument names
  },
});

// Export all directives
export const performanceDirectives = [
  traceDirective,
  cacheDirective,
  rateLimitDirective,
  timeoutDirective,
  complexityDirective,
];