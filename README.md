# Pothos GraphQL Federation - Production Ready

A modern, production-ready GraphQL Federation server built with Pothos schema builder, featuring enterprise-grade caching, monitoring, authentication, and performance optimization.

![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue)
![GraphQL](https://img.shields.io/badge/GraphQL-16+-e10098)
![Bun](https://img.shields.io/badge/Bun-1.2.15+-f9f9f9)
![License](https://img.shields.io/badge/license-MIT-green)

## 🚀 Features

### 🏗️ **Modern Architecture**
- **H3 HTTP Server** - High-performance, modern HTTP framework
- **GraphQL Federation** - Microservices-ready with federation support
- **TypeScript 5+** - Full type safety with latest TypeScript features
- **Bun Runtime** - Ultra-fast JavaScript runtime and package manager

### 🔐 **Enterprise Authentication**
- **OAuth Integration** - Google and GitHub OAuth providers
- **JWT Management** - Access/refresh token rotation with blacklisting
- **RBAC System** - Role-based access control with fine-grained permissions
- **Session Management** - Secure H3-based sessions with encryption

### 🚀 **Performance & Caching**
- **Multi-Level Caching** - L1 (DataLoader), L2 (Memory), L3 (Redis)
- **Connection Pooling** - Optimized PostgreSQL connections
- **Query Optimization** - Automatic N+1 detection and prepared statements
- **Real-time Subscriptions** - GraphQL subscriptions with Redis pub/sub

### 📊 **Monitoring & Observability**
- **OpenTelemetry** - Distributed tracing and metrics collection
- **Prometheus Metrics** - Comprehensive application metrics
- **Health Checks** - Detailed system health monitoring
- **Performance Analytics** - Query performance and optimization insights

### 🛡️ **Production Ready**
- **Docker Support** - Full containerization with Docker Compose
- **Error Handling** - Comprehensive error management and recovery
- **Rate Limiting** - Built-in protection against abuse
- **Security Headers** - CORS, CSRF, and security best practices

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Documentation](#-documentation)
- [Architecture](#-architecture)
- [Configuration](#-configuration)
- [Development](#-development)
- [Production Deployment](#-production-deployment)
- [API Reference](#-api-reference)

## 🚀 Quick Start

### Prerequisites

- **Bun** v1.2.15+ (recommended) or **Node.js** v18+
- **PostgreSQL** 14+
- **Redis** 6.2+
- **Docker** (optional, for containerized deployment)

### Installation & Setup

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start database services
bun run db:up

# Run database migrations
bun run db:migrate

# Start the development server
bun run start
```

### Docker Quick Start

```bash
# Start all services with Docker
docker-compose up --build

# Or for production
docker-compose -f docker-compose.prod.yml up -d
```

### Verify Installation

```bash
# Check GraphQL endpoint
curl http://localhost:4000/graphql

# Check health status
curl http://localhost:4000/health

# Check metrics
curl http://localhost:4000/metrics
```

## 📚 Documentation

### Core Documentation

- **[Architecture Overview](docs/ARCHITECTURE.md)** - System architecture and design patterns
- **[Authentication & Authorization](docs/AUTHENTICATION.md)** - OAuth, JWT, RBAC implementation
- **[Multi-Level Caching](docs/CACHING.md)** - Comprehensive caching strategy
- **[Database & Performance](docs/DATABASE.md)** - Database optimization and connection pooling
- **[Performance Guide](docs/PERFORMANCE.md)** - Performance optimization techniques

### Advanced Topics

- **[Docker Deployment](docs/DOCKER.md)** - Container setup and orchestration
- **[Monitoring & Observability](docs/MONITORING.md)** - Metrics, tracing, and alerting
- **[Real-time Subscriptions](docs/SUBSCRIPTIONS.md)** - WebSocket subscriptions and events
- **[API Versioning](docs/VERSIONING.md)** - Versioning strategies and deprecation

### Plugin Documentation

- **[Prisma Integration](docs/prisma/)** - Database ORM integration
- **[GraphQL Yoga](docs/graphql-yoga/)** - GraphQL server configuration
- **[Federation Support](docs/federation/)** - Apollo Federation setup

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │────│   Load Balancer │────│  GraphQL API    │
│ (Web, Mobile)   │    │   (NGINX/CF)    │    │  (H3 + Yoga)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                       ┌─────────────────────────────────┼─────────────────────────────────┐
                       │                                 │                                 │
                       ▼                                 ▼                                 ▼
              ┌─────────────────┐              ┌─────────────────┐              ┌─────────────────┐
              │ Authentication  │              │ Multi-Level     │              │   Monitoring    │
              │   & RBAC        │              │   Caching       │              │  & Tracing      │
              └─────────────────┘              └─────────────────┘              └─────────────────┘
                       │                                 │                                 │
                       ▼                                 ▼                                 ▼
              ┌─────────────────┐              ┌─────────────────┐              ┌─────────────────┐
              │   PostgreSQL    │              │     Redis       │              │   Prometheus    │
              │   Database      │              │     Cache       │              │   + Grafana     │
              └─────────────────┘              └─────────────────┘              └─────────────────┘
```

## ⚙️ Configuration

### Environment Variables

```bash
# Server
PORT=4000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/pothos_todo"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redispassword

# Authentication
JWT_ACCESS_SECRET=your-jwt-access-secret
JWT_REFRESH_SECRET=your-jwt-refresh-secret
SESSION_SECRET=your-session-secret

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Frontend
FRONTEND_URL=http://localhost:3000

# Monitoring
PROMETHEUS_PORT=9090
JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

The application uses **c12** for configuration management with environment-specific overrides.

## 🛠️ Development

### Available Scripts

```bash
# Development
bun run start          # Start development server
bun run dev            # Start with hot reload
bun run check:types    # TypeScript type checking

# Database
bun run db:up          # Start PostgreSQL container
bun run db:migrate     # Run Prisma migrations
bun run db:generate    # Generate Prisma client

# Testing
bun run test           # Run test suite
bun run test:watch     # Watch mode testing
bun run test:coverage  # Generate coverage report

# Production
bun run build          # Build for production
bun run start:prod     # Start production server
```

### Development Workflow

1. **Start Dependencies**:
   ```bash
   bun run db:up                                    # PostgreSQL
   docker run -d -p 6379:6379 redis:7-alpine      # Redis
   ```

2. **Development Server**:
   ```bash
   bun run dev
   ```

3. **Access Points**:
   - GraphQL Playground: http://localhost:4000/graphql
   - Health Check: http://localhost:4000/health
   - Metrics: http://localhost:4000/metrics

## 🚀 Production Deployment

### Health Checks

```bash
curl http://localhost:4000/health
```

```json
{
  "status": "healthy",
  "timestamp": "2025-01-22T19:16:58.637Z",
  "services": {
    "database": { "status": "healthy", "responseTime": 12 },
    "redis": { "status": "healthy", "responseTime": 3 },
    "cache": { "status": "healthy", "hitRate": 0.85 }
  }
}
```

## 📊 Monitoring

### Available Metrics

- **HTTP Metrics**: Request duration, status codes, throughput
- **GraphQL Metrics**: Query performance, resolver timing
- **Cache Metrics**: Hit rates, memory usage, operations
- **Database Metrics**: Connection pool, query performance
- **System Metrics**: Memory, CPU, uptime

### OpenTelemetry Tracing

Distributed tracing with automatic instrumentation for:
- HTTP requests
- GraphQL operations
- Database queries
- Cache operations

## 📚 API Reference

### GraphQL Schema

```graphql
type Query {
  me: User
  users: [User!]!
  todos: [Todo!]!
  todo(id: ID!): Todo
  todoLists: [TodoList!]!
  todoList(id: ID!): TodoList
}

type Mutation {
  # Authentication
  login(email: String!, password: String!): AuthPayload
  logout: Boolean
  
  # Todo operations
  createTodo(input: CreateTodoInput!): Todo
  updateTodo(id: ID!, input: UpdateTodoInput!): Todo
  deleteTodo(id: ID!): Boolean
  
  # TodoList operations
  createTodoList(input: CreateTodoListInput!): TodoList
  updateTodoList(id: ID!, input: UpdateTodoListInput!): TodoList
  deleteTodoList(id: ID!): Boolean
}

type Subscription {
  todoUpdated(userId: ID): Todo
  todoListUpdated(listId: ID): TodoList
}
```

### REST Endpoints

```
# Authentication
GET  /auth/google           # Google OAuth login
GET  /auth/google/callback  # Google OAuth callback
GET  /auth/github           # GitHub OAuth login  
GET  /auth/github/callback  # GitHub OAuth callback
POST /auth/logout           # Logout current session

# System
GET  /health               # Health check
GET  /metrics              # Prometheus metrics
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run the test suite: `bun run test`
5. Run type checking: `bun run check:types`
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **[Pothos](https://pothos-graphql.dev/)** - GraphQL schema builder
- **[Prisma](https://prisma.io/)** - Database ORM
- **[GraphQL Yoga](https://the-guild.dev/graphql/yoga-server)** - GraphQL server
- **[OpenTelemetry](https://opentelemetry.io/)** - Observability framework

---

**Built with ❤️ using modern technologies for production-ready GraphQL applications.**