#!/bin/bash

# SettlePaisa Merchant Dashboard - Watchdog
# Monitors services and auto-restarts if they crash
# Run in background: ./watchdog.sh &

echo "🐕 Starting Merchant Dashboard Watchdog..."
echo "Monitoring: Merchant API (8080) and Frontend (5173)"
echo "Press Ctrl+C to stop"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

MERCHANT_API_PORT=8080
FRONTEND_PORT=5173
CHECK_INTERVAL=30  # Check every 30 seconds

while true; do
    TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
    RESTART_NEEDED=false
    
    # Check Merchant API
    if ! lsof -ti:$MERCHANT_API_PORT > /dev/null 2>&1; then
        echo -e "${RED}[$TIMESTAMP] ✗ Merchant API is DOWN! Restarting...${NC}"
        
        cd /Users/shantanusingh/ops-dashboard/services/merchant-api
        USE_DB=true \
        PG_URL="postgresql://postgres:settlepaisa123@localhost:5433/settlepaisa_v2" \
        DEFAULT_MERCHANT_ID="MERCH001" \
        PORT=$MERCHANT_API_PORT \
        node index.js > /tmp/merchant-api.log 2>&1 &
        
        sleep 3
        
        if curl -s http://localhost:$MERCHANT_API_PORT/health/live > /dev/null 2>&1; then
            echo -e "${GREEN}[$TIMESTAMP] ✓ Merchant API restarted successfully${NC}"
        else
            echo -e "${RED}[$TIMESTAMP] ✗ Failed to restart Merchant API${NC}"
        fi
        RESTART_NEEDED=true
    fi
    
    # Check Frontend
    if ! lsof -ti:$FRONTEND_PORT > /dev/null 2>&1; then
        echo -e "${RED}[$TIMESTAMP] ✗ Frontend is DOWN! Restarting...${NC}"
        
        cd /Users/shantanusingh/ops-dashboard
        npm run dev -- --port $FRONTEND_PORT > /tmp/merchant-frontend.log 2>&1 &
        
        sleep 5
        
        if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
            echo -e "${GREEN}[$TIMESTAMP] ✓ Frontend restarted successfully${NC}"
        else
            echo -e "${RED}[$TIMESTAMP] ✗ Failed to restart Frontend${NC}"
        fi
        RESTART_NEEDED=true
    fi
    
    # Health check (only if no restart was needed)
    if [ "$RESTART_NEEDED" = false ]; then
        # Silent health check
        if ! curl -s http://localhost:$MERCHANT_API_PORT/v1/merchant/dashboard/summary | jq -e '.currentBalance' > /dev/null 2>&1; then
            echo -e "${YELLOW}[$TIMESTAMP] ⚠ Merchant API responding but returning errors${NC}"
            # Don't auto-restart, just log
        fi
    fi
    
    # Wait before next check
    sleep $CHECK_INTERVAL
done
