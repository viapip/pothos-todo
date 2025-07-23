import { printSchema, introspectionFromSchema, buildClientSchema } from 'graphql';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'pathe';
import { schema } from '@/api/schema/schema.js';
import { logger } from '@/logger.js';

export interface DocumentationConfig {
  outputDir: string;
  includeIntrospection: boolean;
  includeSDL: boolean;
  includeMarkdown: boolean;
  includePostmanCollection: boolean;
}

export class SchemaGenerator {
  private config: DocumentationConfig;

  constructor(config: DocumentationConfig) {
    this.config = config;
    this.ensureOutputDirectory();
  }

  /**
   * Generate all documentation formats
   */
  public async generateAll(): Promise<void> {
    try {
      logger.info('Starting API documentation generation...');

      if (this.config.includeSDL) {
        await this.generateSDL();
      }

      if (this.config.includeIntrospection) {
        await this.generateIntrospection();
      }

      if (this.config.includeMarkdown) {
        await this.generateMarkdownDocs();
      }

      if (this.config.includePostmanCollection) {
        await this.generatePostmanCollection();
      }

      logger.info('API documentation generation completed successfully');
    } catch (error) {
      logger.error('Failed to generate API documentation', { error });
      throw error;
    }
  }

  /**
   * Generate GraphQL SDL (Schema Definition Language)
   */
  private async generateSDL(): Promise<void> {
    const sdl = printSchema(schema);
    const filePath = join(this.config.outputDir, 'schema.graphql');
    
    writeFileSync(filePath, sdl, 'utf8');
    logger.info('Generated GraphQL SDL', { path: filePath });
  }

  /**
   * Generate introspection result
   */
  private async generateIntrospection(): Promise<void> {
    const introspection = introspectionFromSchema(schema);
    const filePath = join(this.config.outputDir, 'introspection.json');
    
    writeFileSync(filePath, JSON.stringify(introspection, null, 2), 'utf8');
    logger.info('Generated introspection result', { path: filePath });
  }

  /**
   * Generate comprehensive markdown documentation
   */
  private async generateMarkdownDocs(): Promise<void> {
    const markdownContent = this.generateMarkdownContent();
    const filePath = join(this.config.outputDir, 'API.md');
    
    writeFileSync(filePath, markdownContent, 'utf8');
    logger.info('Generated Markdown documentation', { path: filePath });
  }

  /**
   * Generate Postman collection
   */
  private async generatePostmanCollection(): Promise<void> {
    const collection = this.generatePostmanCollectionData();
    const filePath = join(this.config.outputDir, 'postman-collection.json');
    
    writeFileSync(filePath, JSON.stringify(collection, null, 2), 'utf8');
    logger.info('Generated Postman collection', { path: filePath });
  }

  /**
   * Generate markdown content
   */
  private generateMarkdownContent(): string {
    return `# Pothos Todo GraphQL API Documentation

## Overview

This is a comprehensive GraphQL API for a todo management system built with Pothos, featuring:

- **Authentication**: OAuth with Google and GitHub
- **Real-time**: WebSocket subscriptions for live updates
- **AI-Powered**: Semantic search, NLP commands, and smart suggestions
- **Performance**: Caching, DataLoader, and query complexity analysis
- **Monitoring**: Comprehensive metrics and health checks

## Quick Start

### Authentication

Before making API calls, you need to authenticate:

1. **OAuth Login**: Visit \`/auth/google\` or \`/auth/github\`
2. **Session Cookie**: The session will be stored in a secure cookie
3. **GraphQL Requests**: Include the session cookie in your requests

### GraphQL Endpoint

- **URL**: \`http://localhost:4000/graphql\`
- **WebSocket**: \`ws://localhost:4000/graphql\` (for subscriptions)
- **Playground**: Available in development mode

## Core Entities

### User
\`\`\`graphql
type User {
  id: ID!
  email: String!
  name: String
  todos(
    status: TodoStatus
    priority: Priority
    limit: Int = 50
    offset: Int = 0
  ): [Todo!]!
  todoLists: [TodoList!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}
\`\`\`

### Todo
\`\`\`graphql
type Todo {
  id: ID!
  title: String!
  description: String
  status: TodoStatus!
  priority: Priority!
  dueDate: DateTime
  tags: [String!]!
  user: User!
  todoList: TodoList
  createdAt: DateTime!
  updatedAt: DateTime!
  completedAt: DateTime
}
\`\`\`

### TodoList
\`\`\`graphql
type TodoList {
  id: ID!
  title: String!
  description: String
  todos: [Todo!]!
  user: User!
  createdAt: DateTime!
  updatedAt: DateTime!
}
\`\`\`

## Enums

### TodoStatus
\`\`\`graphql
enum TodoStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELLED
}
\`\`\`

### Priority
\`\`\`graphql
enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}
\`\`\`

## Query Examples

### Get Current User
\`\`\`graphql
query GetCurrentUser {
  me {
    id
    email
    name
    todos(limit: 10) {
      id
      title
      status
      priority
      dueDate
    }
  }
}
\`\`\`

### Search Todos
\`\`\`graphql
query SearchTodos {
  todos(
    status: PENDING
    priority: HIGH
    limit: 20
  ) {
    id
    title
    description
    status
    priority
    dueDate
    tags
  }
}
\`\`\`

### Get Todo Statistics
\`\`\`graphql
query GetTodoStats {
  todoStats {
    total
    pending
    inProgress
    completed
    cancelled
    byPriority {
      low
      medium
      high
      critical
    }
  }
}
\`\`\`

## Mutation Examples

### Create Todo
\`\`\`graphql
mutation CreateTodo {
  createTodo(input: {
    title: "Complete project documentation"
    description: "Write comprehensive API docs"
    priority: HIGH
    dueDate: "2024-12-31T23:59:59Z"
    tags: ["documentation", "api"]
  }) {
    id
    title
    status
    priority
    dueDate
  }
}
\`\`\`

### Update Todo
\`\`\`graphql
mutation UpdateTodo($id: String!) {
  updateTodo(id: $id, input: {
    status: COMPLETED
    completedAt: "2024-01-15T10:30:00Z"
  }) {
    id
    title
    status
    completedAt
  }
}
\`\`\`

### Delete Todo
\`\`\`graphql
mutation DeleteTodo($id: String!) {
  deleteTodo(id: $id)
}
\`\`\`

## AI-Powered Features

### Semantic Search
\`\`\`graphql
query SemanticSearch {
  searchTodos(input: {
    query: "urgent tasks for this week"
    limit: 10
    scoreThreshold: 0.8
  }) {
    id
    score
    content
    type
  }
}
\`\`\`

### AI Suggestions
\`\`\`graphql
query GetSuggestions {
  suggestTodos(
    context: "work"
    limit: 5
  )
}
\`\`\`

### NLP Commands
\`\`\`graphql
mutation ExecuteNLPCommand {
  executeNLPCommand(
    command: "create a high priority todo to review code tomorrow"
  ) {
    success
    message
    todos {
      id
      title
      priority
      dueDate
    }
  }
}
\`\`\`

## Real-time Subscriptions

### Todo Updates
\`\`\`graphql
subscription TodoUpdates($userId: ID!) {
  todoUpdated(userId: $userId) {
    id
    title
    status
    priority
    updatedAt
  }
}
\`\`\`

### User Activity
\`\`\`graphql
subscription UserActivity {
  userActivity {
    userId
    activity
    timestamp
    metadata
  }
}
\`\`\`

## Error Handling

The API uses standard GraphQL error format:

\`\`\`json
{
  "errors": [{
    "message": "Not authenticated",
    "locations": [{"line": 2, "column": 3}],
    "path": ["me"],
    "extensions": {
      "code": "UNAUTHENTICATED"
    }
  }],
  "data": null
}
\`\`\`

### Common Error Codes
- \`UNAUTHENTICATED\`: User not logged in
- \`FORBIDDEN\`: Insufficient permissions
- \`NOT_FOUND\`: Resource not found
- \`VALIDATION_ERROR\`: Invalid input data
- \`INTERNAL_ERROR\`: Server error

## Rate Limiting

- **Authentication endpoints**: 5 requests/minute
- **GraphQL queries**: 100 requests/minute
- **GraphQL mutations**: 50 requests/minute
- **AI operations**: 10 requests/minute

## Caching

- Individual todos: 60 seconds
- Todo lists: 30 seconds
- User statistics: 5 minutes
- AI search results: 10 minutes

## Monitoring Endpoints

- \`/health\` - Basic health check
- \`/health/ready\` - Readiness probe
- \`/health/detailed\` - Detailed health information
- \`/metrics\` - System metrics (JSON)
- \`/metrics/prometheus\` - Prometheus format metrics

## Development Tools

### GraphQL Playground
Available at \`http://localhost:4000/graphql\` in development mode.

### Introspection
Introspection is enabled in development and disabled in production for security.

### Schema Export
\`\`\`bash
# Generate schema files
bun run schema:generate

# Files generated:
# - docs/schema.graphql (SDL)
# - docs/introspection.json (Introspection result)
# - docs/API.md (This documentation)
\`\`\`

## Best Practices

### Query Optimization
1. Use specific field selections
2. Implement pagination for lists
3. Leverage DataLoader for relationships
4. Monitor query complexity

### Error Handling
1. Check for errors in response
2. Handle network failures gracefully
3. Implement retry logic for transient errors
4. Show user-friendly error messages

### Caching
1. Understand cache TTLs
2. Use appropriate cache keys
3. Handle cache invalidation
4. Monitor cache hit rates

### Security
1. Always authenticate users
2. Validate all inputs
3. Use HTTPS in production
4. Monitor for suspicious activity

## Support

For questions or issues:
1. Check the GraphQL Playground for schema exploration
2. Review this documentation
3. Check application logs
4. Contact the development team

---

*Generated automatically from GraphQL schema*
`;
  }

  /**
   * Generate Postman collection data
   */
  private generatePostmanCollectionData(): any {
    return {
      info: {
        name: "Pothos Todo GraphQL API",
        description: "Comprehensive GraphQL API for todo management with AI features",
        version: "1.0.0",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      auth: {
        type: "bearer",
        bearer: [{
          key: "token",
          value: "{{authToken}}",
          type: "string"
        }]
      },
      event: [{
        listen: "prerequest",
        script: {
          type: "text/javascript",
          exec: [
            "// Set GraphQL endpoint",
            "pm.environment.set('graphqlUrl', 'http://localhost:4000/graphql');"
          ]
        }
      }],
      variable: [{
        key: "baseUrl",
        value: "http://localhost:4000",
        type: "string"
      }],
      item: [
        {
          name: "Authentication",
          item: [
            {
              name: "Google OAuth Login",
              request: {
                method: "GET",
                header: [],
                url: {
                  raw: "{{baseUrl}}/auth/google",
                  host: ["{{baseUrl}}"],
                  path: ["auth", "google"]
                },
                description: "Redirect to Google OAuth login"
              }
            },
            {
              name: "GitHub OAuth Login",
              request: {
                method: "GET",
                header: [],
                url: {
                  raw: "{{baseUrl}}/auth/github",
                  host: ["{{baseUrl}}"],
                  path: ["auth", "github"]
                },
                description: "Redirect to GitHub OAuth login"
              }
            }
          ]
        },
        {
          name: "GraphQL Queries",
          item: [
            {
              name: "Get Current User",
              request: {
                method: "POST",
                header: [
                  {
                    key: "Content-Type",
                    value: "application/json"
                  }
                ],
                body: {
                  mode: "raw",
                  raw: JSON.stringify({
                    query: `
                      query GetCurrentUser {
                        me {
                          id
                          email
                          name
                          todos(limit: 10) {
                            id
                            title
                            status
                            priority
                          }
                        }
                      }
                    `
                  }, null, 2)
                },
                url: {
                  raw: "{{graphqlUrl}}",
                  host: ["{{graphqlUrl}}"]
                }
              }
            },
            {
              name: "Search Todos",
              request: {
                method: "POST",
                header: [
                  {
                    key: "Content-Type",
                    value: "application/json"
                  }
                ],
                body: {
                  mode: "raw",
                  raw: JSON.stringify({
                    query: `
                      query SearchTodos($status: String, $priority: String, $limit: Int) {
                        todos(status: $status, priority: $priority, limit: $limit) {
                          id
                          title
                          description
                          status
                          priority
                          dueDate
                          tags
                        }
                      }
                    `,
                    variables: {
                      status: "PENDING",
                      priority: "HIGH",
                      limit: 20
                    }
                  }, null, 2)
                },
                url: {
                  raw: "{{graphqlUrl}}",
                  host: ["{{graphqlUrl}}"]
                }
              }
            }
          ]
        },
        {
          name: "GraphQL Mutations",
          item: [
            {
              name: "Create Todo",
              request: {
                method: "POST",
                header: [
                  {
                    key: "Content-Type",
                    value: "application/json"
                  }
                ],
                body: {
                  mode: "raw",
                  raw: JSON.stringify({
                    query: `
                      mutation CreateTodo($input: CreateTodoInput!) {
                        createTodo(input: $input) {
                          id
                          title
                          status
                          priority
                          dueDate
                        }
                      }
                    `,
                    variables: {
                      input: {
                        title: "Complete project documentation",
                        description: "Write comprehensive API docs",
                        priority: "HIGH",
                        tags: ["documentation", "api"]
                      }
                    }
                  }, null, 2)
                },
                url: {
                  raw: "{{graphqlUrl}}",
                  host: ["{{graphqlUrl}}"]
                }
              }
            }
          ]
        },
        {
          name: "AI Features",
          item: [
            {
              name: "Semantic Search",
              request: {
                method: "POST",
                header: [
                  {
                    key: "Content-Type",
                    value: "application/json"
                  }
                ],
                body: {
                  mode: "raw",
                  raw: JSON.stringify({
                    query: `
                      query SemanticSearch($input: SemanticSearchInput!) {
                        searchTodos(input: $input) {
                          id
                          score
                          content
                          type
                        }
                      }
                    `,
                    variables: {
                      input: {
                        query: "urgent tasks for this week",
                        limit: 10,
                        scoreThreshold: 0.8
                      }
                    }
                  }, null, 2)
                },
                url: {
                  raw: "{{graphqlUrl}}",
                  host: ["{{graphqlUrl}}"]
                }
              }
            }
          ]
        },
        {
          name: "Health & Monitoring",
          item: [
            {
              name: "Health Check",
              request: {
                method: "GET",
                header: [],
                url: {
                  raw: "{{baseUrl}}/health",
                  host: ["{{baseUrl}}"],
                  path: ["health"]
                }
              }
            },
            {
              name: "System Metrics",
              request: {
                method: "GET",
                header: [],
                url: {
                  raw: "{{baseUrl}}/metrics",
                  host: ["{{baseUrl}}"],
                  path: ["metrics"]
                }
              }
            }
          ]
        }
      ]
    };
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDirectory(): void {
    if (!existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }
  }
}

/**
 * Default documentation configuration
 */
export const defaultDocConfig: DocumentationConfig = {
  outputDir: join(process.cwd(), 'docs'),
  includeIntrospection: true,
  includeSDL: true,
  includeMarkdown: true,
  includePostmanCollection: true,
};