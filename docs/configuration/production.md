# Production Configuration

This guide covers deploying and configuring the Pothos GraphQL Federation project for production environments.

## Production Checklist

### Pre-Deployment

- [ ] Environment variables configured
- [ ] Database connection tested
- [ ] SSL certificates installed
- [ ] Security headers configured
- [ ] Logging configured
- [ ] Monitoring setup
- [ ] Build process tested
- [ ] Health checks implemented

### Deployment

- [ ] Production build created
- [ ] Database migrations run
- [ ] Services started
- [ ] Load balancer configured
- [ ] CDN configured (if applicable)
- [ ] DNS configured
- [ ] SSL/TLS enabled
- [ ] Monitoring active

## Production Configuration

### Environment Variables

```bash
# Required production variables
NODE_ENV=production
PORT=8080
HOST=0.0.0.0
DATABASE_URL=postgresql://user:password@prod-db:5432/pothos_todo
FRONTEND_URL=https://your-domain.com

# Security
SSL_ENABLED=true
CORS_ORIGIN=https://your-domain.com

# Logging
LOG_LEVEL=info
LOG_DIR=/var/log/pothos-todo

# Build
BUILD_MINIFY=true
BUILD_SOURCEMAP=false
```

### Configuration Override

Production uses `config/production.config.ts`:

```typescript
export default {
  extends: ['./base.config'],
  
  server: {
    port: parseInt(process.env.PORT || '8080'),
    host: '0.0.0.0',
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
  },
  
  logger: {
    level: 'info',
    console: {
      enabled: false, // Disable console logging
    },
  },
  
  build: {
    minify: true,
    sourcemap: false,
    watch: false,
  },
  
  graphql: {
    introspection: false,
    playground: false,
    maskedErrors: true,
  },
};
```

## Deployment Methods

### 1. Docker Deployment

#### Dockerfile

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

# Production image
FROM oven/bun:1.2.15-alpine AS production

WORKDIR /app

# Copy built application
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Create log directory
RUN mkdir -p /var/log/pothos-todo && chown nodejs:nodejs /var/log/pothos-todo

USER nodejs

EXPOSE 8080

CMD ["bun", "run", "dist/index.js"]
```

#### Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PORT=8080
      - DATABASE_URL=postgresql://postgres:password@db:5432/pothos_todo
      - FRONTEND_URL=https://your-domain.com
    depends_on:
      - db
      - redis
    restart: unless-stopped
    volumes:
      - ./logs:/var/log/pothos-todo

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: pothos_todo
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
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
```

### 2. Cloud Deployment

#### AWS ECS

```json
{
  "family": "pothos-todo",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "app",
      "image": "your-registry/pothos-todo:latest",
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "8080"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:database-url"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/pothos-todo",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pothos-todo
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pothos-todo
  template:
    metadata:
      labels:
        app: pothos-todo
    spec:
      containers:
      - name: app
        image: your-registry/pothos-todo:latest
        ports:
        - containerPort: 8080
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "8080"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: pothos-todo-service
spec:
  selector:
    app: pothos-todo
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
```

## Security Configuration

### Environment Variables

```bash
# Security headers
SECURITY_HEADERS_ENABLED=true
HELMET_ENABLED=true

# CORS
CORS_ORIGIN=https://your-domain.com
CORS_CREDENTIALS=true

# Rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h
```

### Security Headers

```typescript
// In server configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

## Database Configuration

### Production Database

```bash
# Connection pool settings
DATABASE_URL=postgresql://user:password@db:5432/pothos_todo?pool_min=5&pool_max=20

# SSL configuration
DATABASE_SSL_MODE=require
DATABASE_SSL_CERT=/path/to/cert.pem
DATABASE_SSL_KEY=/path/to/key.pem
DATABASE_SSL_CA=/path/to/ca.pem
```

### Migrations

```bash
# Run migrations on deployment
bun run db:migrate:deploy

# Rollback if needed
bun run db:migrate:rollback
```

## Monitoring and Logging

### Logging Configuration

```typescript
// Production logging
export default {
  logger: {
    level: 'info',
    console: {
      enabled: false,
    },
    files: {
      enabled: true,
      directory: '/var/log/pothos-todo',
      maxSize: '10MB',
      maxFiles: 10,
    },
    json: true,
    metadata: true,
  },
};
```

### Health Checks

```typescript
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
  });
});

// Readiness check
app.get('/ready', async (req, res) => {
  try {
    // Check database connection
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});
```

### Monitoring

```bash
# Application metrics
METRICS_ENABLED=true
METRICS_PORT=9090

# Prometheus metrics
PROMETHEUS_ENABLED=true
PROMETHEUS_PATH=/metrics

# Health check intervals
HEALTH_CHECK_INTERVAL=30000
```

## Performance Optimization

### Build Optimization

```bash
# Production build
NODE_ENV=production bun run build

# Bundle analysis
bun run build:analyze

# Optimize bundle
BUILD_MINIFY=true BUILD_TREESHAKE=true bun run build
```

### Runtime Optimization

```typescript
// Production configuration
export default {
  server: {
    compression: true,
    keepAlive: true,
    timeout: 30000,
  },
  
  database: {
    pool: {
      min: 5,
      max: 20,
      idleTimeoutMillis: 30000,
    },
  },
  
  cache: {
    enabled: true,
    ttl: 3600,
    maxSize: 100,
  },
};
```

## Load Balancing

### Nginx Configuration

```nginx
upstream pothos_todo {
    server app1:8080;
    server app2:8080;
    server app3:8080;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    location / {
        proxy_pass http://pothos_todo;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /health {
        access_log off;
        proxy_pass http://pothos_todo;
    }
}
```

## Backup and Recovery

### Database Backup

```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR="/backups/pothos-todo"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.sql"

# Create backup
pg_dump $DATABASE_URL > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Remove old backups (keep last 7 days)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
```

### Configuration Backup

```bash
# Backup configuration
tar -czf config_backup_$(date +%Y%m%d).tar.gz config/ .env.production

# Backup to S3
aws s3 cp config_backup_$(date +%Y%m%d).tar.gz s3://your-backup-bucket/
```

## Troubleshooting

### Common Issues

#### High Memory Usage

```bash
# Check memory usage
NODE_OPTIONS="--max-old-space-size=512" bun run start

# Enable memory monitoring
MEMORY_MONITORING=true bun run start
```

#### Database Connection Issues

```bash
# Check connection pool
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
DATABASE_POOL_IDLE_TIMEOUT=30000

# Enable connection logging
DATABASE_LOGGING=true
```

#### SSL Certificate Issues

```bash
# Verify certificate
openssl x509 -in cert.pem -text -noout

# Check certificate chain
openssl verify -CAfile ca.pem cert.pem
```

### Debugging Production Issues

```bash
# Enable debug logging temporarily
LOG_LEVEL=debug bun run start

# Check application logs
tail -f /var/log/pothos-todo/app.log

# Check container logs
docker logs pothos-todo-app
```

## Maintenance

### Regular Tasks

```bash
# Update dependencies
bun update

# Run security audit
bun audit

# Database maintenance
bun run db:maintenance

# Log rotation
logrotate /etc/logrotate.d/pothos-todo
```

### Deployment Process

```bash
# 1. Build and test
bun run build
bun run test

# 2. Create Docker image
docker build -t pothos-todo:latest .

# 3. Push to registry
docker push your-registry/pothos-todo:latest

# 4. Deploy
kubectl apply -f deployment.yaml

# 5. Verify deployment
kubectl get pods
kubectl logs deployment/pothos-todo
```

## Related Documentation

- [Configuration Overview](./README.md) - Main configuration documentation
- [Environment Variables](./environment-variables.md) - Environment variable reference
- [Development Setup](./development.md) - Development environment setup
- [Docker Configuration](./docker.md) - Docker and containerization