#!/bin/bash

# Enhanced Service Reliability Script
# Ensures services stay up with multiple recovery mechanisms

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Service configuration
declare -A SERVICES=(
    ["Frontend"]="5174:npm run dev -- --port 5174:/Users/shantanusingh/ops-dashboard"
    ["PG_API"]="5101:node index.js:/Users/shantanusingh/ops-dashboard/services/mock-pg-api"
    ["Bank_API"]="5102:node index.js:/Users/shantanusingh/ops-dashboard/services/mock-bank-api"
    ["Recon_API"]="5103:node index.js:/Users/shantanusingh/ops-dashboard/services/recon-api"
    ["Overview_API"]="5105:node index.js:/Users/shantanusingh/ops-dashboard/services/overview-api"
)

# Log file
LOG_FILE="/tmp/service-monitor.log"
RESTART_COUNT_FILE="/tmp/service-restart-counts.txt"

# Initialize restart counts
if [ ! -f "$RESTART_COUNT_FILE" ]; then
    echo "# Service Restart Counts - Started $(date)" > "$RESTART_COUNT_FILE"
fi

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
    echo -e "$1"
}

check_and_restart_service() {
    local service_name=$1
    local config=$2
    
    IFS=':' read -r port command path <<< "$config"
    
    # Check if service is running
    if lsof -i :$port | grep -q LISTEN; then
        return 0
    else
        log_message "${YELLOW}⚠️  $service_name (port $port) is DOWN. Attempting restart...${NC}"
        
        # Kill any zombie processes
        pkill -f "port $port" 2>/dev/null
        sleep 1
        
        # Start the service
        cd "$path"
        if [ "$service_name" == "Frontend" ]; then
            nohup $command > /tmp/${service_name,,}.log 2>&1 &
        else
            nohup $command > /tmp/${service_name,,}.log 2>&1 &
        fi
        
        # Update restart count
        echo "$service_name restarted at $(date)" >> "$RESTART_COUNT_FILE"
        
        # Wait and verify
        sleep 5
        if lsof -i :$port | grep -q LISTEN; then
            log_message "${GREEN}✓ $service_name restarted successfully${NC}"
            return 0
        else
            log_message "${RED}✗ Failed to restart $service_name${NC}"
            return 1
        fi
    fi
}

# Health check function
health_check() {
    local all_healthy=true
    
    echo -e "\n${GREEN}=== Service Health Check ===${NC}"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "--------------------------------"
    
    for service in "${!SERVICES[@]}"; do
        config="${SERVICES[$service]}"
        IFS=':' read -r port command path <<< "$config"
        
        if lsof -i :$port | grep -q LISTEN; then
            echo -e "${GREEN}✓${NC} $service (port $port): ${GREEN}RUNNING${NC}"
        else
            echo -e "${RED}✗${NC} $service (port $port): ${RED}DOWN${NC}"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        echo -e "\n${GREEN}All services are healthy!${NC}"
    else
        echo -e "\n${YELLOW}Some services need attention${NC}"
    fi
    echo "--------------------------------"
}

# Main monitoring loop
monitor_loop() {
    log_message "${GREEN}Starting Enhanced Service Monitor${NC}"
    
    while true; do
        for service in "${!SERVICES[@]}"; do
            check_and_restart_service "$service" "${SERVICES[$service]}"
        done
        
        # Sleep before next check
        sleep 20
    done
}

# Handle script termination
trap 'log_message "Monitor stopped by user"; exit 0' SIGINT SIGTERM

# Main execution
case "${1:-monitor}" in
    status)
        health_check
        ;;
    restart-all)
        log_message "Restarting all services..."
        for service in "${!SERVICES[@]}"; do
            config="${SERVICES[$service]}"
            IFS=':' read -r port command path <<< "$config"
            pkill -f "port $port" 2>/dev/null
        done
        sleep 2
        for service in "${!SERVICES[@]}"; do
            check_and_restart_service "$service" "${SERVICES[$service]}"
        done
        ;;
    monitor)
        monitor_loop
        ;;
    *)
        echo "Usage: $0 {monitor|status|restart-all}"
        exit 1
        ;;
esac