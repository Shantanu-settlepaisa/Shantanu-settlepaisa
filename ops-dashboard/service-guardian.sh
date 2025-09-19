#!/bin/bash

# Service Guardian - Ensures services never go down
# Features: Auto-restart, health checks, alerting

echo "🛡️ Service Guardian Active"
echo "================================"

# Configuration
CHECK_INTERVAL=15  # seconds
MAX_RESTART_ATTEMPTS=3
RESTART_COOLDOWN=60  # seconds

# Service definitions
check_and_restart() {
    local name=$1
    local port=$2
    local start_cmd=$3
    local work_dir=$4
    
    if ! lsof -i :$port | grep -q LISTEN; then
        echo "[$(date '+%H:%M:%S')] ⚠️  $name (port $port) is DOWN"
        
        # Clean up any stuck processes
        lsof -ti :$port | xargs kill -9 2>/dev/null
        sleep 1
        
        # Start service
        echo "[$(date '+%H:%M:%S')] 🔄 Restarting $name..."
        cd "$work_dir"
        eval "$start_cmd" &
        
        # Wait and verify
        sleep 5
        if lsof -i :$port | grep -q LISTEN; then
            echo "[$(date '+%H:%M:%S')] ✅ $name restarted successfully"
            return 0
        else
            echo "[$(date '+%H:%M:%S')] ❌ Failed to restart $name"
            return 1
        fi
    fi
    return 0
}

# Main monitoring loop
monitor_services() {
    local failures=0
    
    while true; do
        # Frontend (Dashboard)
        check_and_restart "Frontend" "5174" \
            "npm run dev -- --port 5174 > /tmp/vite.log 2>&1" \
            "/Users/shantanusingh/ops-dashboard"
        
        # Recon API (CRITICAL)
        check_and_restart "Recon API" "5103" \
            "node index.js > /tmp/recon-api.log 2>&1" \
            "/Users/shantanusingh/ops-dashboard/services/recon-api"
        
        # Overview API
        check_and_restart "Overview API" "5105" \
            "node index.js > /tmp/overview-api.log 2>&1" \
            "/Users/shantanusingh/ops-dashboard/services/overview-api"
        
        # PG API
        check_and_restart "PG API" "5101" \
            "node index.js > /tmp/pg-api.log 2>&1" \
            "/Users/shantanusingh/ops-dashboard/services/mock-pg-api"
        
        # Bank API
        check_and_restart "Bank API" "5102" \
            "node index.js > /tmp/bank-api.log 2>&1" \
            "/Users/shantanusingh/ops-dashboard/services/mock-bank-api"
        
        sleep $CHECK_INTERVAL
    done
}

# Status check
status_check() {
    echo ""
    echo "📊 Service Status Report"
    echo "========================"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    # Check each service
    echo -n "🌐 Frontend (5174): "
    lsof -i :5174 | grep -q LISTEN && echo "✅ Running" || echo "❌ Down"
    
    echo -n "🔄 Recon API (5103): "
    lsof -i :5103 | grep -q LISTEN && echo "✅ Running" || echo "❌ Down"
    
    echo -n "📈 Overview API (5105): "
    lsof -i :5105 | grep -q LISTEN && echo "✅ Running" || echo "❌ Down"
    
    echo -n "💳 PG API (5101): "
    lsof -i :5101 | grep -q LISTEN && echo "✅ Running" || echo "❌ Down"
    
    echo -n "🏦 Bank API (5102): "
    lsof -i :5102 | grep -q LISTEN && echo "✅ Running" || echo "❌ Down"
    
    echo ""
    
    # Test endpoints
    echo "🔍 Endpoint Tests:"
    echo -n "  Dashboard: "
    curl -s http://localhost:5174 > /dev/null 2>&1 && echo "✅ Responding" || echo "❌ Not responding"
    
    echo -n "  Recon API: "
    curl -s http://localhost:5103/api/health > /dev/null 2>&1 && echo "✅ Responding" || echo "❌ Not responding"
    
    echo ""
}

# Handle termination
trap 'echo "Guardian stopped"; exit 0' SIGINT SIGTERM

# Main execution
case "${1:-monitor}" in
    monitor)
        echo "Starting continuous monitoring..."
        echo "Check interval: ${CHECK_INTERVAL}s"
        echo "Press Ctrl+C to stop"
        echo ""
        monitor_services
        ;;
    status)
        status_check
        ;;
    once)
        echo "Running single check..."
        # Single pass through all services
        check_and_restart "Frontend" "5174" \
            "npm run dev -- --port 5174 > /tmp/vite.log 2>&1" \
            "/Users/shantanusingh/ops-dashboard"
        
        check_and_restart "Recon API" "5103" \
            "node index.js > /tmp/recon-api.log 2>&1" \
            "/Users/shantanusingh/ops-dashboard/services/recon-api"
        
        check_and_restart "Overview API" "5105" \
            "node index.js > /tmp/overview-api.log 2>&1" \
            "/Users/shantanusingh/ops-dashboard/services/overview-api"
        
        check_and_restart "PG API" "5101" \
            "node index.js > /tmp/pg-api.log 2>&1" \
            "/Users/shantanusingh/ops-dashboard/services/mock-pg-api"
        
        check_and_restart "Bank API" "5102" \
            "node index.js > /tmp/bank-api.log 2>&1" \
            "/Users/shantanusingh/ops-dashboard/services/mock-bank-api"
        
        status_check
        ;;
    *)
        echo "Usage: $0 {monitor|status|once}"
        echo "  monitor - Continuous monitoring with auto-restart"
        echo "  status  - Show current status"
        echo "  once    - Run single check and restart if needed"
        exit 1
        ;;
esac