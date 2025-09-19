#!/bin/bash

# Enhanced Health Checker - Deep health checks for all services
# Goes beyond simple port checks to verify actual functionality

LOG_FILE="/tmp/health-checker.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Test Frontend Health
check_frontend() {
    local port=5174
    
    # Basic connectivity
    if ! curl -s --connect-timeout 5 "http://localhost:$port" > /dev/null; then
        echo "❌ Frontend not responding on port $port"
        return 1
    fi
    
    # Check if React app is loaded
    local response=$(curl -s "http://localhost:$port" | grep -o "SettlePaisa Ops")
    if [[ -z "$response" ]]; then
        echo "⚠️ Frontend responding but app not loaded properly"
        return 1
    fi
    
    echo "✅ Frontend healthy"
    return 0
}

# Test Recon API Health
check_recon_api() {
    local port=5103
    
    # Health endpoint
    local health=$(curl -s --connect-timeout 5 "http://localhost:$port/recon/health" | jq -r '.status' 2>/dev/null)
    if [[ "$health" != "healthy" ]]; then
        echo "❌ Recon API health check failed"
        return 1
    fi
    
    # Test actual functionality
    local job_response=$(curl -s "http://localhost:$port/recon/jobs/demo/summary" 2>/dev/null)
    if [[ -z "$job_response" ]]; then
        echo "❌ Recon API not processing requests"
        return 1
    fi
    
    echo "✅ Recon API healthy"
    return 0
}

# Test Overview API Health  
check_overview_api() {
    local port=5105
    
    # Health endpoint
    local health=$(curl -s --connect-timeout 5 "http://localhost:$port/health" 2>/dev/null)
    if [[ -z "$health" ]]; then
        echo "❌ Overview API not responding"
        return 1
    fi
    
    echo "✅ Overview API healthy"
    return 0
}

# Test PG API Health
check_pg_api() {
    local port=5101
    
    local health=$(curl -s --connect-timeout 5 "http://localhost:$port/health" 2>/dev/null)
    if [[ -z "$health" ]]; then
        echo "❌ PG API not responding"
        return 1
    fi
    
    echo "✅ PG API healthy"
    return 0
}

# Test Bank API Health
check_bank_api() {
    local port=5102
    
    local health=$(curl -s --connect-timeout 5 "http://localhost:$port/health" 2>/dev/null)
    if [[ -z "$health" ]]; then
        echo "❌ Bank API not responding"
        return 1
    fi
    
    echo "✅ Bank API healthy"
    return 0
}

# Run all health checks
main() {
    log "🏥 Running comprehensive health checks..."
    
    local all_healthy=true
    local results=""
    
    if check_frontend; then
        results="$results\n✅ Frontend: Healthy"
    else
        results="$results\n❌ Frontend: Unhealthy"
        all_healthy=false
    fi
    
    if check_recon_api; then
        results="$results\n✅ Recon API: Healthy"
    else
        results="$results\n❌ Recon API: Unhealthy"
        all_healthy=false
    fi
    
    if check_overview_api; then
        results="$results\n✅ Overview API: Healthy"
    else
        results="$results\n❌ Overview API: Unhealthy"
        all_healthy=false
    fi
    
    if check_pg_api; then
        results="$results\n✅ PG API: Healthy"
    else
        results="$results\n❌ PG API: Unhealthy"
        all_healthy=false
    fi
    
    if check_bank_api; then
        results="$results\n✅ Bank API: Healthy"
    else
        results="$results\n❌ Bank API: Unhealthy"
        all_healthy=false
    fi
    
    echo -e "$results"
    
    if $all_healthy; then
        log "🎉 All services are healthy!"
        exit 0
    else
        log "🚨 Some services are unhealthy!"
        exit 1
    fi
}

main