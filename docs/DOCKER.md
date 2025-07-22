# Docker Production Deployment Guide

This guide covers deploying the Pothos GraphQL API in a production environment using Docker containers.

## Quick Start

1. **Copy environment file:**
   ```bash
   cp docker-compose.env.example .env
   ```

2. **Configure environment variables:**
   ```bash
   nano .env
   # Update all passwords, secrets, and OAuth credentials
   ```

3. **Build and start services:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Run database migrations:**
   ```bash
   docker-compose -f docker-compose.prod.yml exec api bun run db:migrate
   ```

## Architecture Overview

The production setup includes:

- **API Container**: Pothos GraphQL API with subscriptions
- **PostgreSQL**: Primary database with optimizations
- **Redis**: Session storage and caching
- **Nginx**: Reverse proxy with SSL termination
- **Prometheus**: Metrics collection
- **Grafana**: Monitoring dashboards

## Services Configuration

### API Service
- **Image**: Custom Bun-based image
- **Port**: 4000 (internal)
- **Health Checks**: Comprehensive GraphQL endpoint validation
- **Resources**: 1 CPU, 512MB memory limit

### Database (PostgreSQL 16)
- **Port**: 5432 (internal only)
- **Persistence**: Named volume with automatic backups
- **Extensions**: uuid-ossp, pgcrypto, pg_stat_statements
- **Performance**: Optimized for GraphQL workloads

### Cache (Redis 7)
- **Port**: 6379 (internal only)  
- **Persistence**: Append-only file with automatic cleanup
- **Memory**: 128MB limit with LRU eviction

### Reverse Proxy (Nginx)
- **Ports**: 80, 443 (external)
- **Features**: Rate limiting, compression, security headers
- **SSL**: Ready for certificate mounting

### Monitoring Stack
- **Prometheus**: Metrics collection on port 9090
- **Grafana**: Dashboards on port 3000 (admin/admin by default)

## Environment Variables

### Required Configuration

```env
# Database
POSTGRES_DB=pothos_todo
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-secure-password

# Application
SESSION_SECRET=your-64-char-session-secret
GOOGLE_CLIENT_ID=your-google-oauth-id
GOOGLE_CLIENT_SECRET=your-google-oauth-secret
GITHUB_CLIENT_ID=your-github-oauth-id
GITHUB_CLIENT_SECRET=your-github-oauth-secret
```

### Security Best Practices

1. **Generate strong passwords:**
   ```bash
   openssl rand -base64 32  # For database passwords
   openssl rand -base64 64  # For session secret
   ```

2. **OAuth Setup:**
   - Configure OAuth applications with proper redirect URIs
   - Use environment-specific client IDs/secrets
   - Restrict OAuth scopes to minimum required

3. **Network Security:**
   - Services use internal Docker network (172.20.0.0/16)
   - Only Nginx exposes external ports
   - Database and Redis are internal-only

## Health Monitoring

### Built-in Health Checks
- **API**: GraphQL introspection + database connectivity
- **Database**: PostgreSQL `pg_isready` checks
- **Redis**: `redis-cli ping` verification  
- **Nginx**: HTTP status endpoint

### Monitoring Endpoints
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **API Health**: http://localhost/health

### Custom Dashboards
Pre-configured Grafana dashboards include:
- API response times and error rates
- GraphQL operation metrics
- Subscription connection counts
- System resource utilization

## Deployment Commands

### Initial Deployment
```bash
# Clone and navigate
git clone <repository>
cd pothos-todo

# Configure environment
cp docker-compose.env.example .env
nano .env  # Update configuration

# Build and deploy
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Initialize database
docker-compose -f docker-compose.prod.yml exec api bun run db:migrate
```

### Updates and Maintenance
```bash
# Update application
docker-compose -f docker-compose.prod.yml build api
docker-compose -f docker-compose.prod.yml up -d api

# Database backup
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres pothos_todo > backup-$(date +%Y%m%d).sql

# View logs
docker-compose -f docker-compose.prod.yml logs -f api

# Scale services (if needed)
docker-compose -f docker-compose.prod.yml up -d --scale api=2
```

### Troubleshooting
```bash
# Check service status
docker-compose -f docker-compose.prod.yml ps

# Restart specific service
docker-compose -f docker-compose.prod.yml restart api

# View comprehensive logs
docker-compose -f docker-compose.prod.yml logs --timestamps

# Execute commands in containers
docker-compose -f docker-compose.prod.yml exec api bash
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d pothos_todo
```

## SSL Configuration

To enable HTTPS:

1. **Obtain SSL certificates** (Let's Encrypt recommended):
   ```bash
   certbot certonly --standalone -d your-domain.com
   ```

2. **Mount certificates in docker-compose.prod.yml**:
   ```yaml
   volumes:
     - /etc/letsencrypt/live/your-domain.com:/etc/ssl/certs:ro
   ```

3. **Update Nginx configuration** for SSL termination

## Performance Tuning

### Resource Limits
- Adjust container resources based on traffic
- Monitor memory usage with Grafana dashboards
- Scale horizontally by running multiple API containers

### Database Optimization
- PostgreSQL settings are pre-tuned for GraphQL workloads
- Connection pooling configured for API container limits
- Regular VACUUM and ANALYZE scheduled

### Redis Optimization
- Memory policy set to `allkeys-lru`
- Persistence configured for session reliability
- Memory limit prevents container OOM

## Security Considerations

### Network Security
- Internal Docker network isolates services
- No direct database/Redis external access
- Nginx provides single external entry point

### Application Security
- Non-root containers with tini init system
- Security headers configured in Nginx
- Rate limiting on API endpoints

### Data Security
- Database passwords required
- Session secrets must be environment-specific
- OAuth credentials properly scoped

## Backup Strategy

### Automated Backups
```bash
# Database backup script
#!/bin/bash
docker-compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U postgres -d pothos_todo | \
  gzip > "backup-$(date +%Y%m%d-%H%M%S).sql.gz"
```

### Volume Backup
```bash
# Backup persistent volumes
docker run --rm -v pothos-todo_postgres-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres-volume-$(date +%Y%m%d).tar.gz /data
```

## Monitoring and Alerting

### Key Metrics to Monitor
- API response times > 1 second
- Error rates > 5%
- Active subscription counts
- Database connection pool usage
- Memory usage > 90%

### Grafana Alerts
Configure alerts in Grafana for:
- High error rates
- Slow response times  
- Resource exhaustion
- Service unavailability

## Production Checklist

- [ ] Environment variables configured with strong secrets
- [ ] OAuth applications configured for production domain
- [ ] SSL certificates obtained and mounted
- [ ] Database migrations applied
- [ ] Monitoring dashboards accessible
- [ ] Health checks passing
- [ ] Backup procedures tested
- [ ] Rate limits configured appropriately
- [ ] Security headers verified
- [ ] Log aggregation configured (if using external service)