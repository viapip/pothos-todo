import { ApolloGateway, IntrospectAndCompose } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import express from 'express';
import cors from 'cors';
import { json } from 'body-parser';
import { createHandler } from 'graphql-http/lib/use/express';
import { userSubgraphSchema } from './subgraphs/user-subgraph.js';
import { todoSubgraphSchema } from './subgraphs/todo-subgraph.js';
import { logger } from '@/logger.js';
import { createApiKeyMiddleware, requireApiKeyScopes } from '@/infrastructure/security/ApiKeyMiddleware.js';
import { tracingMiddleware } from '@/infrastructure/telemetry/TracingMiddleware.js';
import { performanceMonitor } from '@/infrastructure/telemetry/PerformanceMonitor.js';
import type { Context } from '../schema/builder.js';

/**
 * GraphQL Federation Gateway
 * 
 * Combines multiple subgraphs into a unified GraphQL schema
 * with advanced security, monitoring, and performance features.
 */

export interface GatewayConfig {
  subgraphs: Array<{
    name: string;
    url: string;
    schema?: any;
  }>;
  introspection?: boolean;
  playground?: boolean;
  cors?: {
    origin: string | string[];
    credentials: boolean;
  };
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

export class FederationGateway {
  private gateway: ApolloGateway;
  private server: ApolloServer;
  private app: express.Application;

  constructor(private config: GatewayConfig) {
    this.app = express();
    this.setupMiddleware();
    this.initializeGateway();
  }

  private setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: this.config.cors?.origin || ['http://localhost:3000', 'http://localhost:4000'],
      credentials: this.config.cors?.credentials ?? true,
    }));

    // JSON parsing
    this.app.use(json({ limit: '50mb' }));

    // API key middleware
    this.app.use('/graphql', createApiKeyMiddleware());

    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

      // CSP for GraphQL Playground
      if (req.path === '/graphql' && req.method === 'GET' && this.config.playground) {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
        );
      }

      next();
    });

    // Rate limiting middleware
    if (this.config.rateLimit) {
      const rateLimit = require('express-rate-limit');
      this.app.use('/graphql', rateLimit({
        windowMs: this.config.rateLimit.windowMs,
        max: this.config.rateLimit.max,
        message: {
          error: 'Too many requests from this IP, please try again later.',
        },
        standardHeaders: true,
        legacyHeaders: false,
      }));
    }
  }

  private initializeGateway() {
    // Create gateway with subgraph configuration
    this.gateway = new ApolloGateway({
      supergraphSdl: this.buildSupergraphSdl(),
      buildService: ({ url }) => {
        return {
          process: ({ request, context }) => {
            // Add tracing and monitoring
            const { traceGraphQLOperation } = tracingMiddleware;
            const operation = traceGraphQLOperation(
              request.operationName || 'anonymous',
              'gateway',
              {
                'gateway.subgraph.url': url,
                'gateway.operation': request.query,
              }
            );

            return new Promise((resolve, reject) => {
              // Simulate subgraph execution
              setTimeout(() => {
                operation.span.end();
                resolve({
                  http: { body: JSON.stringify({ data: {} }) },
                });
              }, Math.random() * 100);
            });
          },
        };
      },
    });

    // Create Apollo Server
    this.server = new ApolloServer({
      gateway: this.gateway,
      introspection: this.config.introspection ?? true,
      plugins: [
        // Performance monitoring plugin
        {
          requestDidStart() {
            return {
              didResolveOperation(requestContext) {
                const operationName = requestContext.request.operationName || 'anonymous';
                const operationType = requestContext.operationName || 'unknown';

                logger.info('GraphQL operation started', {
                  operationName,
                  operationType,
                  query: requestContext.request.query?.substring(0, 200),
                });
              },

              willSendResponse(requestContext) {
                const duration = Date.now() - requestContext.request.http?.timestamp || 0;
                const errors = requestContext.response.errors;

                // Record performance metrics
                performanceMonitor.recordRequest({
                  query: requestContext.request.query || '',
                  operationName: requestContext.request.operationName,
                  duration,
                  errors: errors?.map(e => e.message),
                });

                logger.info('GraphQL operation completed', {
                  operationName: requestContext.request.operationName,
                  duration,
                  hasErrors: !!errors?.length,
                });
              },
            };
          },
        },

        // Security audit plugin
        {
          requestDidStart() {
            return {
              didResolveOperation(requestContext) {
                const context = requestContext.contextValue as Context;

                logger.info('GraphQL security audit', {
                  userId: context.user?.id,
                  apiKey: context.apiKey?.id,
                  operationName: requestContext.request.operationName,
                  operationType: requestContext.operationName,
                  ip: requestContext.request.http?.ip,
                  userAgent: requestContext.request.http?.headers?.get('user-agent'),
                });
              },
            };
          },
        },
      ],
    });
  }

  private buildSupergraphSdl(): string {
    // In a real implementation, this would be generated by Apollo Federation
    // For now, return a simple SDL that combines the subgraphs
    return `
      directive @key(fields: String!) on OBJECT | INTERFACE
      directive @requires(fields: String!) on FIELD_DEFINITION
      directive @provides(fields: String!) on FIELD_DEFINITION
      directive @external on FIELD_DEFINITION
      
      type Query {
        me: User
        todos(filter: TodoFilterInput): [Todo!]!
        todo(id: ID!): Todo
        todoStats: TodoStats!
        users: [User!]! @requires(fields: "admin")
      }
      
      type Mutation {
        updateProfile(input: UpdateProfileInput!): UserProfile!
        generateApiKey(input: GenerateApiKeyInput!): ApiKeyGenerationResult!
        createTodo(input: CreateTodoInput!): Todo!
        updateTodo(id: ID!, input: UpdateTodoInput!): Todo!
        deleteTodo(id: ID!): Boolean!
      }
      
      type User @key(fields: "id") {
        id: ID!
        email: String
        profile: UserProfile
        todos: [Todo!]!
      }
      
      type Todo @key(fields: "id") {
        id: ID!
        title: String!
        description: String
        status: String!
        priority: String!
        user: User!
        analytics: TodoAnalytics
      }
      
      # Additional types would be defined here...
    `;
  }

  async start(port: number = 4000) {
    await this.server.start();

    // Apply GraphQL middleware
    this.app.use(
      '/graphql',
      expressMiddleware(this.server, {
        context: async ({ req }) => {
          // Build context from request
          const context: Context = {
            user: req.user,
            session: req.session,
            container: req.container,
            h3Event: req,
            apiKey: req.apiKey,
          };

          return context;
        },
      })
    );

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        subgraphs: this.config.subgraphs.map(s => ({
          name: s.name,
          url: s.url,
          status: 'healthy', // In real implementation, check subgraph health
        })),
      });
    });

    // Metrics endpoint (admin only)
    this.app.get('/metrics', requireApiKeyScopes(['admin:read']), async (req, res) => {
      const metrics = await performanceMonitor.getMetrics();
      const anomalies = await performanceMonitor.detectAnomalies();

      res.json({
        metrics,
        anomalies,
        timestamp: new Date().toISOString(),
      });
    });

    this.app.listen(port, () => {
      logger.info(`🚀 Federation Gateway ready at http://localhost:${port}/graphql`);
      logger.info(`📊 Health check available at http://localhost:${port}/health`);
      logger.info(`📈 Metrics available at http://localhost:${port}/metrics`);
    });
  }

  async stop() {
    await this.server.stop();
    logger.info('Federation Gateway stopped');
  }
}

// Gateway factory function
export function createFederationGateway(config: GatewayConfig): FederationGateway {
  return new FederationGateway(config);
}

// Development configuration
export const developmentGatewayConfig: GatewayConfig = {
  subgraphs: [
    {
      name: 'users',
      url: 'http://localhost:4001/graphql',
      schema: userSubgraphSchema,
    },
    {
      name: 'todos',
      url: 'http://localhost:4002/graphql',
      schema: todoSubgraphSchema,
    },
  ],
  introspection: true,
  playground: true,
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:4000'],
    credentials: true,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
  },
};