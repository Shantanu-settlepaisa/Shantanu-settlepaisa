#!/bin/bash

# SettlePaisa Merchant Dashboard - Complete Startup Script
# This ensures all services are running and healthy

set -e  # Exit on any error

echo "🚀 Starting SettlePaisa Merchant Dashboard..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
MERCHANT_API_PORT=8080
FRONTEND_PORT=5173
DB_PORT=5433
DB_NAME=settlepaisa_v2
MERCHANT_ID=MERCH001

# Step 1: Check Database
echo ""
echo "📦 Step 1: Checking Database Connection..."
if docker exec settlepaisa_v2_db psql -U postgres -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database is running on port $DB_PORT${NC}"
else
    echo -e "${RED}✗ Database not accessible!${NC}"
    echo "Starting database container..."
    docker start settlepaisa_v2_db || {
        echo -e "${RED}Failed to start database. Please check Docker.${NC}"
        exit 1
    }
    sleep 3
fi

# Verify merchant exists
echo "Checking merchant $MERCHANT_ID..."
MERCHANT_COUNT=$(docker exec settlepaisa_v2_db psql -U postgres -d $DB_NAME -t -c "SELECT COUNT(*) FROM sp_v2_settlement_batches WHERE merchant_id = '$MERCHANT_ID'" | xargs)
if [ "$MERCHANT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Merchant $MERCHANT_ID has $MERCHANT_COUNT settlements${NC}"
else
    echo -e "${YELLOW}⚠ Warning: No settlements found for $MERCHANT_ID${NC}"
fi

# Step 2: Stop any existing services
echo ""
echo "🛑 Step 2: Stopping existing services..."
lsof -ti:$MERCHANT_API_PORT | xargs kill -9 2>/dev/null && echo "Killed old merchant-api on port $MERCHANT_API_PORT" || echo "No existing merchant-api"
lsof -ti:$FRONTEND_PORT | xargs kill -9 2>/dev/null && echo "Killed old frontend on port $FRONTEND_PORT" || echo "No existing frontend"

sleep 2

# Step 3: Start Merchant API
echo ""
echo "🔧 Step 3: Starting Merchant API (Port $MERCHANT_API_PORT)..."
cd /Users/shantanusingh/ops-dashboard/services/merchant-api

# Start merchant API with environment variables
USE_DB=true \
PG_URL="postgresql://postgres:settlepaisa123@localhost:$DB_PORT/$DB_NAME" \
DEFAULT_MERCHANT_ID="$MERCHANT_ID" \
PORT=$MERCHANT_API_PORT \
NODE_ENV=development \
TIMEZONE=Asia/Kolkata \
node index.js > /tmp/merchant-api.log 2>&1 &

MERCHANT_API_PID=$!
echo "Started merchant-api with PID: $MERCHANT_API_PID"

# Wait for API to be ready
echo "Waiting for merchant API to start..."
sleep 3

# Health check
MAX_RETRIES=10
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:$MERCHANT_API_PORT/health/live > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Merchant API is healthy${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for API... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ Merchant API failed to start!${NC}"
    echo "Last 20 lines of log:"
    tail -20 /tmp/merchant-api.log
    exit 1
fi

# Test API endpoints
echo "Testing API endpoints..."
SUMMARY=$(curl -s http://localhost:$MERCHANT_API_PORT/v1/merchant/dashboard/summary)
if echo "$SUMMARY" | jq -e '.currentBalance' > /dev/null 2>&1; then
    BALANCE=$(echo "$SUMMARY" | jq -r '.currentBalance')
    echo -e "${GREEN}✓ Dashboard API working - Balance: ₹$(echo "scale=2; $BALANCE/100" | bc)${NC}"
else
    echo -e "${RED}✗ Dashboard API returned invalid response${NC}"
    exit 1
fi

SETTLEMENTS=$(curl -s http://localhost:$MERCHANT_API_PORT/v1/merchant/settlements | jq -r '.settlements | length')
echo -e "${GREEN}✓ Settlements API working - Found $SETTLEMENTS settlements${NC}"

# Step 4: Start Frontend
echo ""
echo "🎨 Step 4: Starting Frontend (Port $FRONTEND_PORT)..."
cd /Users/shantanusingh/ops-dashboard

# Start frontend dev server
npm run dev -- --port $FRONTEND_PORT > /tmp/merchant-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Started frontend with PID: $FRONTEND_PID"

# Wait for frontend
echo "Waiting for frontend to start..."
sleep 5

# Health check frontend
MAX_RETRIES=10
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Frontend is running${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for frontend... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ Frontend failed to start!${NC}"
    echo "Last 20 lines of log:"
    tail -20 /tmp/merchant-frontend.log
    exit 1
fi

# Verify frontend can reach API
if curl -s http://localhost:$FRONTEND_PORT/v1/merchant/dashboard/summary | jq -e '.currentBalance' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend can reach Merchant API${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Frontend proxy might not be configured${NC}"
fi

# Step 5: Summary
echo ""
echo "================================================"
echo -e "${GREEN}✅ All services started successfully!${NC}"
echo "================================================"
echo ""
echo "📊 Service Status:"
echo "  ✓ Database:      postgresql://localhost:$DB_PORT/$DB_NAME"
echo "  ✓ Merchant API:  http://localhost:$MERCHANT_API_PORT (PID: $MERCHANT_API_PID)"
echo "  ✓ Frontend:      http://localhost:$FRONTEND_PORT (PID: $FRONTEND_PID)"
echo ""
echo "🌐 Access Points:"
echo "  • Merchant Dashboard: ${GREEN}http://localhost:$FRONTEND_PORT/merchant/settlements${NC}"
echo "  • API Health Check:   http://localhost:$MERCHANT_API_PORT/health/live"
echo ""
echo "📝 Logs:"
echo "  • Merchant API: tail -f /tmp/merchant-api.log"
echo "  • Frontend:     tail -f /tmp/merchant-frontend.log"
echo ""
echo "🛑 To stop all services:"
echo "  kill $MERCHANT_API_PID $FRONTEND_PID"
echo "  # Or run: ./stop-merchant-dashboard.sh"
echo ""
echo "✨ Merchant Dashboard is ready!"
