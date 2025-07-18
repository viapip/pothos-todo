# Docker Configuration

This guide covers Docker setup and configuration for the Pothos GraphQL Federation project.

## Docker Services

The project uses Docker Compose to manage multiple services:

- **PostgreSQL**: Primary database
- **Qdrant**: Vector database for embeddings
- **Application**: Main GraphQL server (optional)

## Docker Compose Configuration

### Service Configuration

```yaml
version: '3.8'

services:
  postgres:
    image: ${POSTGRES_IMAGE:-postgres:15-alpine}
    container_name: ${POSTGRES_CONTAINER:-pothos-todo-postgres}
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-pothos_todo}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5

  qdrant:
    image: ${QDRANT_IMAGE:-qdrant/qdrant:latest}
    container_name: ${QDRANT_CONTAINER:-pothos-todo-qdrant}
    ports:
      - "${QDRANT_PORT:-6333}:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      QDRANT__SERVICE__HTTP_PORT: ${QDRANT_HTTP_PORT:-6333}
      QDRANT__SERVICE__GRPC_PORT: ${QDRANT_GRPC_PORT:-6334}

volumes:
  postgres_data:
  qdrant_data:
```

### Environment Variables

All Docker services can be configured via environment variables:

```bash
# PostgreSQL Configuration
POSTGRES_IMAGE=postgres:15-alpine
POSTGRES_CONTAINER=pothos-todo-postgres
POSTGRES_DB=pothos_todo
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_PORT=5432

# Qdrant Configuration
QDRANT_IMAGE=qdrant/qdrant:latest
QDRANT_CONTAINER=pothos-todo-qdrant
QDRANT_PORT=6333
QDRANT_HTTP_PORT=6333
QDRANT_GRPC_PORT=6334
```

## Docker Commands

### Development Commands

```bash
# Start all services
bun run services:up
# OR
docker-compose up -d

# Start specific service
bun run db:up
# OR
docker-compose up -d postgres

# Stop all services
bun run services:down
# OR
docker-compose down

# View logs
docker-compose logs -f
docker-compose logs -f postgres
docker-compose logs -f qdrant

# Check service status
docker-compose ps
```

### Data Management

```bash
# View volumes
docker volume ls

# Backup database
docker-compose exec postgres pg_dump -U postgres pothos_todo > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres pothos_todo < backup.sql

# Clean up volumes (WARNING: Data loss!)
docker-compose down -v
```

## Application Dockerfile

### Development Dockerfile

```dockerfile
FROM oven/bun:1.2.15-alpine AS development

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install

# Copy source code
COPY . .

# Expose port
EXPOSE 4000

# Development command
CMD ["bun", "run", "dev"]
```

### Production Dockerfile

```dockerfile
FROM oven/bun:1.2.15-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN bun run build

# Production stage
FROM oven/bun:1.2.15-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy built application
COPY --from=base --chown=nodejs:nodejs /app/dist ./dist
COPY --from=base --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=base --chown=nodejs:nodejs /app/package.json ./

# Create log directory
RUN mkdir -p /var/log/pothos-todo && chown nodejs:nodejs /var/log/pothos-todo

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun run health-check || exit 1

# Production command
CMD ["bun", "run", "dist/index.js"]
```

### Multi-stage Production Build

```dockerfile
# Build stage
FROM oven/bun:1.2.15-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN bun run build

# Production stage
FROM oven/bun:1.2.15-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /var/log/pothos-todo && \
    chown nodejs:nodejs /var/log/pothos-todo

USER nodejs

EXPOSE 8080

CMD ["bun", "run", "dist/index.js"]
```

## Docker Compose Environments

### Development Environment

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/pothos_todo
    depends_on:
      - postgres
      - qdrant
    volumes:
      - .:/app
      - node_modules:/app/node_modules
    command: bun run dev

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: pothos_todo
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

volumes:
  postgres_data:
  qdrant_data:
  node_modules:
```

### Production Environment

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.prod
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/pothos_todo
    depends_on:
      - postgres
      - qdrant
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: pothos_todo
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    volumes:
      - qdrant_data:/qdrant/storage
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
  qdrant_data:
```

## Container Configuration

### PostgreSQL Container

```bash
# Environment variables
POSTGRES_DB=pothos_todo
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Volume mounts
postgres_data:/var/lib/postgresql/data

# Health check
pg_isready -U postgres

# Backup
docker-compose exec postgres pg_dump -U postgres pothos_todo > backup.sql
```

### Qdrant Container

```bash
# Environment variables
QDRANT__SERVICE__HTTP_PORT=6333
QDRANT__SERVICE__GRPC_PORT=6334

# Volume mounts
qdrant_data:/qdrant/storage

# Health check
curl -f http://localhost:6333/health

# Configuration
curl http://localhost:6333/collections
```

## Networking

### Docker Networks

```yaml
# Custom network configuration
networks:
  pothos-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

services:
  app:
    networks:
      - pothos-network
    depends_on:
      - postgres
      - qdrant

  postgres:
    networks:
      - pothos-network

  qdrant:
    networks:
      - pothos-network
```

### Service Discovery

```typescript
// Application configuration
export default {
  database: {
    host: 'postgres', // Service name
    port: 5432,
  },
  
  qdrant: {
    host: 'qdrant', // Service name
    port: 6333,
  },
};
```

## Security

### Container Security

```dockerfile
# Use non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Read-only root filesystem
--read-only --tmpfs /tmp

# Drop capabilities
--cap-drop ALL

# Security options
--security-opt no-new-privileges
```

### Environment Security

```bash
# Use Docker secrets
echo "my-secret" | docker secret create db-password -

# Use environment file
docker-compose --env-file .env.production up
```

## Monitoring

### Container Monitoring

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  grafana_data:
```

### Application Metrics

```typescript
// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.end(await prometheus.register.metrics());
});
```

## Troubleshooting

### Common Issues

#### Container Won't Start

```bash
# Check logs
docker-compose logs app

# Check container status
docker-compose ps

# Inspect container
docker inspect pothos-todo-app
```

#### Database Connection Issues

```bash
# Check database logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U postgres -d pothos_todo

# Check network
docker network ls
docker network inspect pothos-todo_default
```

#### Permission Issues

```bash
# Check file permissions
ls -la

# Fix ownership
sudo chown -R 1001:1001 /path/to/data

# Check user in container
docker-compose exec app id
```

### Debugging

```bash
# Run container interactively
docker-compose exec app sh

# Check environment variables
docker-compose exec app env

# Check network connectivity
docker-compose exec app ping postgres
docker-compose exec app ping qdrant
```

## Best Practices

### 1. Use Multi-stage Builds

```dockerfile
# Build stage
FROM node:18-alpine AS builder
# ... build steps

# Production stage
FROM node:18-alpine AS production
# ... copy artifacts
```

### 2. Layer Caching

```dockerfile
# Copy package files first
COPY package.json bun.lockb ./
RUN bun install

# Copy source code last
COPY . .
```

### 3. Security

```dockerfile
# Use non-root user
USER nodejs

# Read-only filesystem
--read-only

# Drop capabilities
--cap-drop ALL
```

### 4. Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1
```

### 5. Resource Limits

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

## Related Documentation

- [Configuration Overview](./README.md) - Main configuration documentation
- [Environment Variables](./environment-variables.md) - Environment variable reference
- [Development Setup](./development.md) - Development environment setup
- [Production Deployment](./production.md) - Production deployment guide