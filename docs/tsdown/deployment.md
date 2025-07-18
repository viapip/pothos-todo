# Production Deployment Guide

This guide explains how to deploy the Pothos GraphQL Federation project to production using the tsdown build system.

## Deployment Overview

The deployment process involves:
1. Building optimized production bundles
2. Validating the build output
3. Deploying to production environment
4. Running the built application

## Pre-Deployment Checklist

### 1. Code Quality

```bash
# Run all validation checks
bun run validate

# Check TypeScript compilation
bun run check:types

# Validate package structure
bun run check:publint

# Check type correctness
bun run check:attw
```

### 2. Database Preparation

```bash
# Generate Prisma client
bun run db:generate

# Run migrations (in production)
bunx prisma migrate deploy

# Verify schema
bunx prisma db push --accept-data-loss
```

### 3. Dependencies

```bash
# Install production dependencies only
bun install --production

# Or with npm
npm ci --only=production
```

## Production Build

### Standard Production Build

```bash
# Build for production
bun run build:prod
```

This creates optimized bundles with:
- Tree-shaking enabled
- External dependencies properly handled
- TypeScript declarations generated
- Package validation completed

### Build Verification

```bash
# Check build output
ls -la dist/

# Verify main entry points exist
ls -la dist/index.js dist/index.cjs dist/index.d.ts

# Check API exports
ls -la dist/api/

# Verify layer exports
ls -la dist/domain/ dist/application/ dist/infrastructure/
```

## Production Environment Setup

### Environment Variables

```bash
# Production environment
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://prod-host:5432/prod-db

# Optional: Performance settings
NODE_OPTIONS="--max-old-space-size=4096"
```

### System Requirements

**Minimum Requirements**:
- Node.js 18+
- RAM: 512MB minimum, 2GB recommended
- Storage: 100MB for application files
- Network: HTTPS support recommended

**Recommended Production Setup**:
- Node.js 20 LTS
- RAM: 4GB+
- Storage: SSD with 1GB+ free space
- Network: Load balancer with SSL termination

## Deployment Methods

### 1. Docker Deployment

**Dockerfile**:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY tsdown.config.ts tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY index.ts ./
COPY prisma/ ./prisma/

# Build application
RUN npm run build:prod

# Expose port
EXPOSE 4000

# Start application
CMD ["node", "dist/index.js"]
```

**Build and Deploy**:
```bash
# Build Docker image
docker build -t pothos-federation .

# Run container
docker run -p 4000:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  pothos-federation
```

### 2. Direct Deployment

**Build on Server**:
```bash
# On production server
git clone <repository>
cd pothos-todo
bun install
bun run build:prod
bun run start:dist
```

**Pre-built Deployment**:
```bash
# Local build
bun run build:prod

# Copy to server
rsync -avz dist/ package.json server:/app/
rsync -avz node_modules/ server:/app/node_modules/

# Start on server
ssh server "cd /app && node dist/index.js"
```

### 3. Platform-as-a-Service (PaaS)

**Heroku**:
```json
// package.json
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "bun run build:prod",
    "heroku-postbuild": "bun run build:prod"
  }
}
```

**Vercel** (Serverless):
```json
// vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/dist/index.js"
    }
  ]
}
```

## Running in Production

### Direct Node.js

```bash
# Start production server
NODE_ENV=production node dist/index.js

# With process manager (PM2)
pm2 start dist/index.js --name "pothos-federation"

# With forever
forever start dist/index.js
```

### Process Management

**PM2 Configuration**:
```json
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'pothos-federation',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log'
  }]
}
```

**Systemd Service**:
```ini
# /etc/systemd/system/pothos-federation.service
[Unit]
Description=Pothos GraphQL Federation Server
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/app
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=4000

[Install]
WantedBy=multi-user.target
```

## Performance Optimization

### Build Optimizations

```typescript
// tsdown.config.ts (production overrides)
export default defineConfig({
  // ... existing config
  minify: process.env.NODE_ENV === 'production',
  treeshake: true,
  sourcemap: false, // Disable in production
  silent: true,     // Reduce build output
})
```

### Runtime Optimizations

```bash
# Node.js performance flags
NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size"

# Enable production optimizations
NODE_ENV=production node dist/index.js
```

### Bundle Analysis

```bash
# Analyze bundle size
bun run build:prod --report

# Check for unused dependencies
bunx depcheck

# Audit dependencies
bun audit
```

## Monitoring and Logging

### Application Monitoring

```typescript
// Add to built application
import { createServer } from 'node:http'
import { yoga } from './dist/api/server.js'

const server = createServer(yoga)

// Health check endpoint
server.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
  }
})
```

### Logging Configuration

```typescript
// Production logging
const logger = {
  info: (message: string, meta?: any) => {
    console.log(JSON.stringify({ level: 'info', message, meta, timestamp: new Date().toISOString() }))
  },
  error: (message: string, error?: Error) => {
    console.error(JSON.stringify({ level: 'error', message, error: error?.stack, timestamp: new Date().toISOString() }))
  }
}
```

## Security Considerations

### Production Security

1. **Environment Variables**:
   - Use environment variables for secrets
   - Never commit sensitive data
   - Use secret management services

2. **Dependencies**:
   - Regular security audits
   - Keep dependencies updated
   - Use `npm audit` or `bun audit`

3. **Network Security**:
   - Use HTTPS in production
   - Implement rate limiting
   - Use security headers

### Build Security

```bash
# Audit dependencies before build
bun audit

# Check for vulnerabilities
bunx audit-ci

# Validate build output
bun run validate
```

## Rollback Strategy

### Quick Rollback

```bash
# Keep previous build
mv dist dist.backup
mv dist.previous dist

# Restart application
pm2 restart pothos-federation
```

### Database Rollback

```bash
# Rollback migrations if needed
bunx prisma migrate reset --skip-seed

# Apply specific migration
bunx prisma migrate deploy
```

## Troubleshooting Production Issues

### Common Issues

1. **Module Resolution Errors**:
   ```bash
   # Check Node.js version
   node --version
   
   # Verify build output
   ls -la dist/
   ```

2. **Database Connection Issues**:
   ```bash
   # Test database connection
   bunx prisma db push
   
   # Check connection string
   echo $DATABASE_URL
   ```

3. **Performance Issues**:
   ```bash
   # Monitor memory usage
   top -p $(pgrep node)
   
   # Check logs
   tail -f logs/combined.log
   ```

### Debug Production Build

```bash
# Build with debug information
NODE_ENV=production bun run build --sourcemap

# Run with debugging
node --inspect dist/index.js

# Check bundle contents
bunx @rollup/plugin-bundle-analyze dist/index.js
```

## Continuous Deployment

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        
      - name: Install dependencies
        run: bun install
        
      - name: Run validations
        run: bun run validate
        
      - name: Build production
        run: bun run build:prod
        
      - name: Deploy to server
        run: |
          rsync -avz dist/ ${{ secrets.SERVER_HOST }}:/app/
          ssh ${{ secrets.SERVER_HOST }} "pm2 restart pothos-federation"
```

### Health Checks

```bash
# Application health check
curl -f http://localhost:4000/health || exit 1

# GraphQL endpoint check
curl -f http://localhost:4000/graphql || exit 1

# Database connectivity check
bunx prisma db push --accept-data-loss || exit 1
```

## Performance Monitoring

### Metrics Collection

```typescript
// Add performance monitoring
import { performance } from 'node:perf_hooks'

const startTime = performance.now()

// Log startup time
setTimeout(() => {
  const endTime = performance.now()
  console.log(`Server startup time: ${endTime - startTime}ms`)
}, 0)
```

### Resource Monitoring

```bash
# Monitor system resources
htop

# Monitor Node.js specific metrics
node --prof dist/index.js

# Analyze performance
node --prof-process isolate-*.log
```