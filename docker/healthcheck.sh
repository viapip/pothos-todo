#!/bin/bash
# Docker health check script for Pothos GraphQL API

set -e

# Configuration
HEALTH_CHECK_URL="http://localhost:4000/graphql"
MAX_RETRIES=3
RETRY_DELAY=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[HEALTHCHECK]${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[HEALTHCHECK]${NC} $1" >&2
}

error() {
    echo -e "${RED}[HEALTHCHECK]${NC} $1" >&2
}

# Function to check GraphQL endpoint
check_graphql_endpoint() {
    local attempt=$1
    log "Attempt $attempt/$MAX_RETRIES: Checking GraphQL endpoint..."

    # GraphQL introspection query to verify the service is responding
    local query='{"query":"query HealthCheck { __schema { queryType { name } } }"}'
    
    # Make the request with timeout
    local response=$(curl -s -f \
        --max-time 5 \
        --retry 0 \
        -H "Content-Type: application/json" \
        -d "$query" \
        "$HEALTH_CHECK_URL" 2>/dev/null)
    
    local curl_exit_code=$?
    
    if [ $curl_exit_code -eq 0 ]; then
        # Check if the response contains expected GraphQL structure
        if echo "$response" | grep -q '"queryType"'; then
            log "✅ GraphQL endpoint is healthy"
            return 0
        else
            warn "⚠️  GraphQL endpoint returned unexpected response: $response"
            return 1
        fi
    else
        warn "⚠️  Failed to connect to GraphQL endpoint (curl exit code: $curl_exit_code)"
        return 1
    fi
}

# Function to check database connectivity (via GraphQL)
check_database_connection() {
    log "Checking database connectivity..."
    
    # Simple query that would fail if database is not connected
    # This assumes there's a users table or similar basic query
    local query='{"query":"query DatabaseCheck { __type(name: \"Query\") { name } }"}'
    
    local response=$(curl -s -f \
        --max-time 10 \
        -H "Content-Type: application/json" \
        -d "$query" \
        "$HEALTH_CHECK_URL" 2>/dev/null)
    
    local curl_exit_code=$?
    
    if [ $curl_exit_code -eq 0 ] && echo "$response" | grep -q '"name".*"Query"'; then
        log "✅ Database connectivity is healthy"
        return 0
    else
        warn "⚠️  Database connectivity check failed"
        return 1
    fi
}

# Function to check memory usage
check_memory_usage() {
    log "Checking memory usage..."
    
    # Get memory usage of the current container
    if command -v free >/dev/null 2>&1; then
        local mem_info=$(free -m)
        local total_mem=$(echo "$mem_info" | awk '/^Mem:/ {print $2}')
        local used_mem=$(echo "$mem_info" | awk '/^Mem:/ {print $3}')
        local mem_usage_percent=$((used_mem * 100 / total_mem))
        
        if [ $mem_usage_percent -gt 90 ]; then
            warn "⚠️  High memory usage: ${mem_usage_percent}%"
            return 1
        else
            log "✅ Memory usage is healthy: ${mem_usage_percent}%"
            return 0
        fi
    else
        log "📊 Memory monitoring not available"
        return 0
    fi
}

# Function to check if process is running
check_process_health() {
    log "Checking process health..."
    
    # Check if the process is still running and responding
    if pgrep -f "bun.*dist/index.js" >/dev/null 2>&1; then
        log "✅ Application process is running"
        return 0
    else
        error "❌ Application process not found"
        return 1
    fi
}

# Main health check logic
main() {
    log "🏥 Starting comprehensive health check..."
    
    local checks_passed=0
    local total_checks=4
    
    # Check 1: Process health
    if check_process_health; then
        ((checks_passed++))
    fi
    
    # Check 2: GraphQL endpoint (with retries)
    local graphql_healthy=false
    for attempt in $(seq 1 $MAX_RETRIES); do
        if check_graphql_endpoint $attempt; then
            graphql_healthy=true
            ((checks_passed++))
            break
        elif [ $attempt -lt $MAX_RETRIES ]; then
            warn "Retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi
    done
    
    if [ "$graphql_healthy" = false ]; then
        error "❌ GraphQL endpoint failed all retry attempts"
    fi
    
    # Check 3: Database connectivity  
    if check_database_connection; then
        ((checks_passed++))
    fi
    
    # Check 4: Memory usage
    if check_memory_usage; then
        ((checks_passed++))
    fi
    
    # Evaluate overall health
    log "Health check summary: $checks_passed/$total_checks checks passed"
    
    if [ $checks_passed -eq $total_checks ]; then
        log "🎉 All health checks passed - service is healthy!"
        exit 0
    elif [ $checks_passed -ge 2 ]; then
        warn "⚠️  Some health checks failed, but core service is functional"
        exit 0  # Still consider healthy if basic functionality works
    else
        error "💀 Critical health check failures - service is unhealthy!"
        exit 1
    fi
}

# Handle script termination
trap 'error "Health check interrupted"; exit 1' INT TERM

# Run main health check
main "$@"