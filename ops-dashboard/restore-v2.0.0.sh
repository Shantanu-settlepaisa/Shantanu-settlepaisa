#!/bin/bash

# SettlePaisa Ops Dashboard v2.0.0 Recovery Script
# This script restores the dashboard to its v2.0.0 state
# Date: 2025-09-16

set -e  # Exit on error

echo "================================================"
echo "SettlePaisa Ops Dashboard v2.0.0 Recovery Script"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="/Users/shantanusingh/ops-dashboard"

# Function to check if port is in use
check_port() {
    lsof -i :$1 > /dev/null 2>&1
    return $?
}

# Function to kill process on port
kill_port() {
    echo -e "${YELLOW}Cleaning port $1...${NC}"
    lsof -ti:$1 | xargs kill -9 2>/dev/null || true
}

# Function to start service
start_service() {
    local service_name=$1
    local service_dir=$2
    local port=$3
    
    echo -e "${YELLOW}Starting $service_name on port $port...${NC}"
    cd "$service_dir"
    nohup node index.js > /tmp/${service_name}.log 2>&1 &
    
    # Wait for service to start
    sleep 2
    
    if check_port $port; then
        echo -e "${GREEN}✓ $service_name started successfully${NC}"
    else
        echo -e "${RED}✗ Failed to start $service_name${NC}"
        echo "Check logs at /tmp/${service_name}.log"
        exit 1
    fi
}

echo "Step 1: Stopping all existing services..."
echo "=========================================="

# Kill all node processes
pkill -f "node index.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# Clean all ports
kill_port 5174
kill_port 5101
kill_port 5102
kill_port 5103
kill_port 5105

echo -e "${GREEN}✓ All services stopped${NC}"
echo ""

echo "Step 2: Starting backend services..."
echo "===================================="

# Start Mock PG API
start_service "mock-pg-api" "$BASE_DIR/services/mock-pg-api" 5101

# Start Mock Bank API
start_service "mock-bank-api" "$BASE_DIR/services/mock-bank-api" 5102

# Start Recon API
start_service "recon-api" "$BASE_DIR/services/recon-api" 5103

# Start Overview API
start_service "overview-api" "$BASE_DIR/services/overview-api" 5105

echo ""
echo "Step 3: Starting frontend..."
echo "============================"

cd "$BASE_DIR"
echo -e "${YELLOW}Starting Vite dev server on port 5174...${NC}"
nohup npm run dev -- --port 5174 > /tmp/vite.log 2>&1 &

# Wait for frontend to start
sleep 5

if check_port 5174; then
    echo -e "${GREEN}✓ Frontend started successfully${NC}"
else
    echo -e "${RED}✗ Failed to start frontend${NC}"
    echo "Check logs at /tmp/vite.log"
    exit 1
fi

echo ""
echo "Step 4: Verifying all services..."
echo "=================================="

# Check all services
services_ok=true

if check_port 5174; then
    echo -e "${GREEN}✓ Frontend (5174) - Running${NC}"
else
    echo -e "${RED}✗ Frontend (5174) - Not running${NC}"
    services_ok=false
fi

if check_port 5101; then
    echo -e "${GREEN}✓ Mock PG API (5101) - Running${NC}"
else
    echo -e "${RED}✗ Mock PG API (5101) - Not running${NC}"
    services_ok=false
fi

if check_port 5102; then
    echo -e "${GREEN}✓ Mock Bank API (5102) - Running${NC}"
else
    echo -e "${RED}✗ Mock Bank API (5102) - Not running${NC}"
    services_ok=false
fi

if check_port 5103; then
    echo -e "${GREEN}✓ Recon API (5103) - Running${NC}"
else
    echo -e "${RED}✗ Recon API (5103) - Not running${NC}"
    services_ok=false
fi

if check_port 5105; then
    echo -e "${GREEN}✓ Overview API (5105) - Running${NC}"
else
    echo -e "${RED}✗ Overview API (5105) - Not running${NC}"
    services_ok=false
fi

echo ""
echo "================================================"

if $services_ok; then
    echo -e "${GREEN}SUCCESS! All services are running.${NC}"
    echo ""
    echo "Dashboard URLs:"
    echo "---------------"
    echo "Main Dashboard:    http://localhost:5174/ops/overview"
    echo "Analytics:         http://localhost:5174/ops/analytics"
    echo "Reconciliation:    http://localhost:5174/ops/recon"
    echo "Disputes:          http://localhost:5174/ops/disputes"
    echo "Merchant:          http://localhost:5174/merchant/settlements"
    echo ""
    echo "Service Logs:"
    echo "-------------"
    echo "Frontend:          /tmp/vite.log"
    echo "Mock PG API:       /tmp/mock-pg-api.log"
    echo "Mock Bank API:     /tmp/mock-bank-api.log"
    echo "Recon API:         /tmp/recon-api.log"
    echo "Overview API:      /tmp/overview-api.log"
    echo ""
    echo "To stop all services, run:"
    echo "pkill -f 'node index.js' && pkill -f vite"
else
    echo -e "${RED}ERROR: Some services failed to start.${NC}"
    echo "Please check the logs for more information."
    exit 1
fi

echo "================================================"
echo "Recovery complete! Version 2.0.0 is now running."
echo "================================================"