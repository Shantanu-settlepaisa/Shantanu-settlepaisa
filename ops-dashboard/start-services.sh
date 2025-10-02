#!/bin/bash

# Start all backend services for SettlePaisa Ops Dashboard

echo "Starting SettlePaisa Backend Services..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if a port is in use
check_port() {
    lsof -i :$1 > /dev/null 2>&1
}

# Kill any existing services
echo "Stopping any existing services..."
pkill -f "node.*mock-pg-api" 2>/dev/null
pkill -f "node.*mock-bank-api" 2>/dev/null
pkill -f "node.*recon-api" 2>/dev/null
pkill -f "node.*overview-api" 2>/dev/null
pkill -f "node.*ingest.*server" 2>/dev/null
pkill -f "node.*settlement-analytics-api" 2>/dev/null
sleep 2

# Start PG API (port 5101)
echo -n "Starting PG API on port 5101..."
cd /Users/shantanusingh/ops-dashboard/services/mock-pg-api
node index.js > /tmp/pg-api.log 2>&1 &
PG_PID=$!
sleep 2
if check_port 5101; then
    echo -e "${GREEN} ✓${NC}"
else
    echo -e "${RED} ✗${NC}"
    echo "Check /tmp/pg-api.log for errors"
fi

# Start Bank API (port 5102)
echo -n "Starting Bank API on port 5102..."
cd /Users/shantanusingh/ops-dashboard/services/mock-bank-api
node index.js > /tmp/bank-api.log 2>&1 &
BANK_PID=$!
sleep 2
if check_port 5102; then
    echo -e "${GREEN} ✓${NC}"
else
    echo -e "${RED} ✗${NC}"
    echo "Check /tmp/bank-api.log for errors"
fi

# Start Recon API (port 5103)
echo -n "Starting Recon API on port 5103..."
cd /Users/shantanusingh/ops-dashboard/services/recon-api
node index.js > /tmp/recon-api.log 2>&1 &
RECON_PID=$!
sleep 2
if check_port 5103; then
    echo -e "${GREEN} ✓${NC}"
else
    echo -e "${RED} ✗${NC}"
    echo "Check /tmp/recon-api.log for errors"
fi

# Start Overview API (port 5105)
echo -n "Starting Overview API on port 5105..."
cd /Users/shantanusingh/ops-dashboard/services/overview-api
node index.js > /tmp/overview-api.log 2>&1 &
OVERVIEW_PID=$!
sleep 2
if check_port 5105; then
    echo -e "${GREEN} ✓${NC}"
else
    echo -e "${RED} ✗${NC}"
    echo "Check /tmp/overview-api.log for errors"
fi

# Start Ingest API (port 5106) - Only if feature flag is enabled
if [ "${FEATURE_BANK_SFTP_INGESTION}" = "true" ]; then
    echo -n "Starting Ingest API on port 5106..."
    cd /Users/shantanusingh/ops-dashboard/services/api/ingest
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        npm install > /dev/null 2>&1
    fi
    npx ts-node server.ts > /tmp/ingest-api.log 2>&1 &
    INGEST_PID=$!
    sleep 2
    if check_port 5106; then
        echo -e "${GREEN} ✓${NC}"
    else
        echo -e "${RED} ✗${NC}"
        echo "Check /tmp/ingest-api.log for errors"
    fi
fi

# Start Settlement Analytics API (port 5107)
echo -n "Starting Settlement Analytics API on port 5107..."
cd /Users/shantanusingh/ops-dashboard/services/settlement-analytics-api
node index.js > /tmp/analytics-api.log 2>&1 &
ANALYTICS_PID=$!
sleep 2
if check_port 5107; then
    echo -e "${GREEN} ✓${NC}"
else
    echo -e "${RED} ✗${NC}"
    echo "Check /tmp/analytics-api.log for errors"
fi

echo ""
echo "Service Status:"
echo "---------------"
check_port 5101 && echo -e "PG API:                ${GREEN}Running${NC} on port 5101" || echo -e "PG API:                ${RED}Not running${NC}"
check_port 5102 && echo -e "Bank API:              ${GREEN}Running${NC} on port 5102" || echo -e "Bank API:              ${RED}Not running${NC}"
check_port 5103 && echo -e "Recon API:             ${GREEN}Running${NC} on port 5103" || echo -e "Recon API:             ${RED}Not running${NC}"
check_port 5105 && echo -e "Overview API:          ${GREEN}Running${NC} on port 5105" || echo -e "Overview API:          ${RED}Not running${NC}"
if [ "${FEATURE_BANK_SFTP_INGESTION}" = "true" ]; then
    check_port 5106 && echo -e "Ingest API:            ${GREEN}Running${NC} on port 5106" || echo -e "Ingest API:            ${RED}Not running${NC}"
fi
check_port 5107 && echo -e "Analytics API:         ${GREEN}Running${NC} on port 5107" || echo -e "Analytics API:         ${RED}Not running${NC}"

echo ""
echo "All services started. Logs available at:"
echo "  - /tmp/pg-api.log"
echo "  - /tmp/bank-api.log"
echo "  - /tmp/recon-api.log"
echo "  - /tmp/overview-api.log"
if [ "${FEATURE_BANK_SFTP_INGESTION}" = "true" ]; then
    echo "  - /tmp/ingest-api.log"
fi
echo "  - /tmp/analytics-api.log"
echo ""
echo "To stop all services, run: pkill -f 'node.*api'"