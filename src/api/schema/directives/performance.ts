import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import { GraphQLField, GraphQLDirective, DirectiveLocation, GraphQLString, GraphQLInt, GraphQLBoolean } from 'graphql';
import { defaultFieldResolver } from 'graphql';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from '@/infrastructure/telemetry/telemetry';
import { CacheManager } from '@/infrastructure/cache/CacheManager';
import { logger } from '@/logger';

const tracer = getTracer('graphql-directives');

/**
 * @trace directive - Add detailed tracing to any field
 */
export class TraceDirective extends SchemaDirectiveVisitor {
  static getDirectiveDeclaration(directiveName: string): GraphQLDirective {
    return new GraphQLDirective({
      name: directiveName,
      locations: [DirectiveLocation.FIELD_DEFINITION],
      args: {
        name: { type: GraphQLString },
        includeArgs: { type: GraphQLBoolean, defaultValue: true },
      },
    });
  }

  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field;
    const { name: customName, includeArgs } = this.args;

    field.resolve = async function (...args) {
      const [root, fieldArgs, context, info] = args;
      const spanName = customName || `graphql.field.${info.parentType.name}.${info.fieldName}`;
      
      const span = tracer.startSpan(spanName, {
        attributes: {
          'graphql.field': info.fieldName,
          'graphql.type': info.parentType.name,
          'graphql.return_type': info.returnType.toString(),
          ...(includeArgs && { 'graphql.args': JSON.stringify(fieldArgs) }),
        },
      });

      try {
        const result = await resolve.apply(this, args);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      } finally {
        span.end();
      }
    };
  }
}

/**
 * @cache directive - Add caching to any field
 */
export class CacheDirective extends SchemaDirectiveVisitor {
  static getDirectiveDeclaration(directiveName: string): GraphQLDirective {
    return new GraphQLDirective({
      name: directiveName,
      locations: [DirectiveLocation.FIELD_DEFINITION],
      args: {
        ttl: { type: GraphQLInt, defaultValue: 300 }, // 5 minutes default
        scope: { type: GraphQLString, defaultValue: 'PUBLIC' }, // PUBLIC or PRIVATE
        key: { type: GraphQLString }, // Custom cache key
      },
    });
  }

  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field;
    const { ttl, scope, key: customKey } = this.args;

    field.resolve = async function (...args) {
      const [root, fieldArgs, context, info] = args;
      const cacheManager = CacheManager.getInstance();
      
      // Generate cache key
      const fieldKey = `${info.parentType.name}:${info.fieldName}`;
      const argsKey = JSON.stringify(fieldArgs);
      const userKey = scope === 'PRIVATE' && context.user ? `:user:${context.user.id}` : '';
      const cacheKey = customKey || `gql:${fieldKey}:${argsKey}${userKey}`;

      // Try to get from cache
      const cached = await cacheManager.get(cacheKey);
      if (cached !== null) {
        logger.debug('Cache hit', { key: cacheKey });
        return cached;
      }

      // Execute resolver
      const result = await resolve.apply(this, args);

      // Cache the result
      if (result !== null && result !== undefined) {
        await cacheManager.set(cacheKey, result, ttl);
        logger.debug('Cached result', { key: cacheKey, ttl });
      }

      return result;
    };
  }
}

/**
 * @rateLimit directive - Add rate limiting to mutations
 */
export class RateLimitDirective extends SchemaDirectiveVisitor {
  static getDirectiveDeclaration(directiveName: string): GraphQLDirective {
    return new GraphQLDirective({
      name: directiveName,
      locations: [DirectiveLocation.FIELD_DEFINITION],
      args: {
        limit: { type: GraphQLInt, defaultValue: 10 },
        window: { type: GraphQLInt, defaultValue: 60 }, // seconds
        key: { type: GraphQLString, defaultValue: 'ip' }, // ip, user, custom
      },
    });
  }

  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field;
    const { limit, window, key: keyType } = this.args;

    field.resolve = async function (...args) {
      const [root, fieldArgs, context, info] = args;
      const cacheManager = CacheManager.getInstance();
      
      // Determine rate limit key
      let rateLimitKey: string;
      switch (keyType) {
        case 'user':
          if (!context.user) throw new Error('Rate limiting requires authentication');
          rateLimitKey = `ratelimit:${info.fieldName}:user:${context.user.id}`;
          break;
        case 'ip':
          const ip = context.h3Event?.node.req.socket.remoteAddress || 'unknown';
          rateLimitKey = `ratelimit:${info.fieldName}:ip:${ip}`;
          break;
        default:
          rateLimitKey = `ratelimit:${info.fieldName}:${keyType}`;
      }

      // Check rate limit
      const current = await cacheManager.get<number>(rateLimitKey) || 0;
      if (current >= limit) {
        throw new Error(`Rate limit exceeded. Max ${limit} requests per ${window} seconds.`);
      }

      // Increment counter
      await cacheManager.set(rateLimitKey, current + 1, window);

      // Execute resolver
      return resolve.apply(this, args);
    };
  }
}

/**
 * @timeout directive - Add timeout to field resolution
 */
export class TimeoutDirective extends SchemaDirectiveVisitor {
  static getDirectiveDeclaration(directiveName: string): GraphQLDirective {
    return new GraphQLDirective({
      name: directiveName,
      locations: [DirectiveLocation.FIELD_DEFINITION],
      args: {
        ms: { type: GraphQLInt, defaultValue: 5000 }, // 5 seconds default
      },
    });
  }

  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field;
    const { ms } = this.args;

    field.resolve = async function (...args) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Field resolution timeout after ${ms}ms`)), ms);
      });

      try {
        return await Promise.race([
          resolve.apply(this, args),
          timeoutPromise,
        ]);
      } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
          logger.error('Field resolution timeout', {
            field: args[3].fieldName,
            parentType: args[3].parentType.name,
            timeout: ms,
          });
        }
        throw error;
      }
    };
  }
}

/**
 * @complexity directive - Calculate and limit query complexity
 */
export class ComplexityDirective extends SchemaDirectiveVisitor {
  static getDirectiveDeclaration(directiveName: string): GraphQLDirective {
    return new GraphQLDirective({
      name: directiveName,
      locations: [DirectiveLocation.FIELD_DEFINITION],
      args: {
        value: { type: GraphQLInt, defaultValue: 1 },
        multipliers: { type: GraphQLString }, // JSON array of argument names
      },
    });
  }

  visitFieldDefinition(field: GraphQLField<any, any>) {
    // Store complexity metadata on field extensions
    field.extensions = {
      ...field.extensions,
      complexity: {
        value: this.args.value,
        multipliers: this.args.multipliers ? JSON.parse(this.args.multipliers) : [],
      },
    };
  }
}

// Export directive map for schema
export const performanceDirectives = {
  trace: TraceDirective,
  cache: CacheDirective,
  rateLimit: RateLimitDirective,
  timeout: TimeoutDirective,
  complexity: ComplexityDirective,
};