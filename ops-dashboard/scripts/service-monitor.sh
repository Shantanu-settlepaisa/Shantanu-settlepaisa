#!/bin/bash

# Service Monitor - Ensures all services stay up and healthy
# This script should run continuously to monitor and restart services

LOG_FILE="/tmp/service-monitor.log"
HEALTH_CHECK_INTERVAL=30  # Check every 30 seconds
MAX_RESTART_ATTEMPTS=3
RESTART_DELAY=10

# Service configurations
declare -A SERVICES=(
    ["frontend"]="5174"
    ["recon-api"]="5103"
    ["overview-api"]="5105"
    ["pg-api"]="5101"
    ["bank-api"]="5102"
)

declare -A SERVICE_DIRS=(
    ["frontend"]="/Users/shantanusingh/ops-dashboard"
    ["recon-api"]="/Users/shantanusingh/ops-dashboard/services/recon-api"
    ["overview-api"]="/Users/shantanusingh/ops-dashboard/services/overview-api"
    ["pg-api"]="/Users/shantanusingh/ops-dashboard/services/pg-api"
    ["bank-api"]="/Users/shantanusingh/ops-dashboard/services/bank-api"
)

declare -A SERVICE_COMMANDS=(
    ["frontend"]="npm run dev -- --port 5174"
    ["recon-api"]="node index.js"
    ["overview-api"]="node index.js"
    ["pg-api"]="node index.js"
    ["bank-api"]="node index.js"
)

declare -A RESTART_COUNTS=(
    ["frontend"]=0
    ["recon-api"]=0
    ["overview-api"]=0
    ["pg-api"]=0
    ["bank-api"]=0
)

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_port() {
    local port=$1
    local response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://localhost:$port/health" 2>/dev/null)
    
    if [[ "$response" == "200" ]] || [[ "$port" == "5174" && "$response" != "000" ]]; then
        return 0  # Service is up
    else
        return 1  # Service is down
    fi
}

start_service() {
    local service_name=$1
    local port=${SERVICES[$service_name]}
    local service_dir=${SERVICE_DIRS[$service_name]}
    local command=${SERVICE_COMMANDS[$service_name]}
    
    log "Starting $service_name on port $port..."
    
    # Kill any existing process on the port
    if lsof -ti:$port > /dev/null 2>&1; then
        log "Killing existing process on port $port"
        lsof -ti:$port | xargs kill -9 2>/dev/null
        sleep 2
    fi
    
    # Start the service
    cd "$service_dir"
    if [[ "$service_name" == "frontend" ]]; then
        nohup $command > "/tmp/${service_name}.log" 2>&1 &
    else
        nohup $command > "/tmp/${service_name}.log" 2>&1 &
    fi
    
    local pid=$!
    echo $pid > "/tmp/${service_name}.pid"
    
    # Wait a moment for service to start
    sleep 5
    
    # Verify it started
    if check_port $port; then
        log "✅ $service_name started successfully on port $port (PID: $pid)"
        RESTART_COUNTS[$service_name]=0
        return 0
    else
        log "❌ Failed to start $service_name on port $port"
        return 1
    fi
}

monitor_service() {
    local service_name=$1
    local port=${SERVICES[$service_name]}
    
    if check_port $port; then
        return 0  # Service is healthy
    else
        log "🚨 $service_name (port $port) is DOWN!"
        
        # Check restart count
        local restart_count=${RESTART_COUNTS[$service_name]}
        if [[ $restart_count -lt $MAX_RESTART_ATTEMPTS ]]; then
            RESTART_COUNTS[$service_name]=$((restart_count + 1))
            log "Attempting restart #${RESTART_COUNTS[$service_name]} for $service_name"
            
            if start_service "$service_name"; then
                log "✅ Successfully restarted $service_name"
            else
                log "❌ Failed to restart $service_name"
                sleep $RESTART_DELAY
            fi
        else
            log "⚠️ Max restart attempts reached for $service_name. Manual intervention required."
            # Send alert (could integrate with Slack, email, etc.)
            echo "CRITICAL: $service_name has failed $MAX_RESTART_ATTEMPTS times and requires manual intervention" >> "/tmp/critical-alerts.log"
        fi
        
        return 1
    fi
}

# Initialize all services
start_all_services() {
    log "🚀 Starting all services..."
    
    for service_name in "${!SERVICES[@]}"; do
        start_service "$service_name"
        sleep 2
    done
    
    log "✅ All services initialization complete"
}

# Main monitoring loop
main() {
    log "🔍 Service Monitor Started (PID: $$)"
    log "Monitoring services: ${!SERVICES[*]}"
    log "Health check interval: ${HEALTH_CHECK_INTERVAL}s"
    
    # Start all services initially
    start_all_services
    
    # Main monitoring loop
    while true; do
        all_healthy=true
        
        for service_name in "${!SERVICES[@]}"; do
            if ! monitor_service "$service_name"; then
                all_healthy=false
            fi
        done
        
        if $all_healthy; then
            log "✅ All services healthy"
        fi
        
        sleep $HEALTH_CHECK_INTERVAL
    done
}

# Handle graceful shutdown
cleanup() {
    log "🛑 Service monitor shutting down..."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Check if already running
if pgrep -f "service-monitor.sh" | grep -v $$ > /dev/null; then
    echo "Service monitor is already running"
    exit 1
fi

# Start monitoring
main