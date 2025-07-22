# Production Dockerfile for Pothos GraphQL Todo App
# Multi-stage build for optimized production image

# ================================
# Build Stage
# ================================
FROM oven/bun:1.2.15-slim AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json bun.lockb ./
COPY config/ ./config/

# Install all dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Build the application
RUN bun run build:prod

# ================================
# Production Runtime Stage  
# ================================
FROM oven/bun:1.2.15-slim AS runtime

# Install security updates and required system dependencies
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        tini \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup -u 1001 appuser

# Set working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package.json bun.lockb ./
RUN bun install --production --frozen-lockfile \
    && bun pm cache rm

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/config ./config
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy health check script
COPY docker/healthcheck.sh ./healthcheck.sh
RUN chmod +x ./healthcheck.sh

# Set proper ownership
RUN chown -R appuser:appgroup /app
USER appuser

# Expose application port
EXPOSE 4000

# Add metadata
LABEL org.opencontainers.image.title="Pothos GraphQL Todo API" \
      org.opencontainers.image.description="Production-ready GraphQL API with subscriptions" \
      org.opencontainers.image.vendor="Pothos Todo Team" \
      org.opencontainers.image.licenses="MIT"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ./healthcheck.sh

# Use tini for proper signal handling
ENTRYPOINT ["tini", "--"]

# Start the application
CMD ["bun", "run", "dist/index.js"]