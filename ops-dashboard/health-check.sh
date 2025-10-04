#!/bin/bash

# SettlePaisa Merchant Dashboard - Health Check Script
# Run this anytime to check if all services are running properly

echo "🏥 SettlePaisa Merchant Dashboard - Health Check"
echo "================================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

HEALTHY=true

# Check Database
echo "1. Database (PostgreSQL on port 5433)"
if docker exec settlepaisa_v2_db psql -U postgres -d settlepaisa_v2 -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓ HEALTHY${NC} - Database is accessible"
else
    echo -e "   ${RED}✗ UNHEALTHY${NC} - Database not accessible"
    HEALTHY=false
fi

# Check Merchant API
echo ""
echo "2. Merchant API (port 8080)"
if lsof -ti:8080 > /dev/null 2>&1; then
    if curl -s http://localhost:8080/health/live > /dev/null 2>&1; then
        # Test actual endpoints
        if curl -s http://localhost:8080/v1/merchant/dashboard/summary | jq -e '.currentBalance' > /dev/null 2>&1; then
            BALANCE=$(curl -s http://localhost:8080/v1/merchant/dashboard/summary | jq -r '.currentBalance')
            echo -e "   ${GREEN}✓ HEALTHY${NC} - API responding (Balance: ₹$(echo "scale=2; $BALANCE/100" | bc))"
        else
            echo -e "   ${YELLOW}⚠ WARNING${NC} - API running but returning errors"
            echo "   Last error from log:"
            tail -5 /tmp/merchant-api.log | grep -i error || echo "   (no recent errors)"
            HEALTHY=false
        fi
    else
        echo -e "   ${RED}✗ UNHEALTHY${NC} - API not responding"
        HEALTHY=false
    fi
else
    echo -e "   ${RED}✗ NOT RUNNING${NC} - No process on port 8080"
    HEALTHY=false
fi

# Check Frontend
echo ""
echo "3. Frontend (port 5173)"
if lsof -ti:5173 > /dev/null 2>&1; then
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        # Check if frontend can reach API
        if curl -s http://localhost:5173/v1/merchant/dashboard/summary | jq -e '.currentBalance' > /dev/null 2>&1; then
            echo -e "   ${GREEN}✓ HEALTHY${NC} - Frontend serving and can reach API"
        else
            echo -e "   ${YELLOW}⚠ WARNING${NC} - Frontend running but cannot reach API"
            HEALTHY=false
        fi
    else
        echo -e "   ${RED}✗ UNHEALTHY${NC} - Frontend not responding"
        HEALTHY=false
    fi
else
    echo -e "   ${RED}✗ NOT RUNNING${NC} - No process on port 5173"
    HEALTHY=false
fi

# Check data availability
echo ""
echo "4. Data Availability"
SETTLEMENT_COUNT=$(curl -s http://localhost:8080/v1/merchant/settlements 2>/dev/null | jq -r '.settlements | length' 2>/dev/null)
if [ ! -z "$SETTLEMENT_COUNT" ] && [ "$SETTLEMENT_COUNT" -gt 0 ]; then
    echo -e "   ${GREEN}✓ HEALTHY${NC} - Found $SETTLEMENT_COUNT settlements for MERCH001"
else
    echo -e "   ${YELLOW}⚠ WARNING${NC} - No settlement data found"
fi

# Summary
echo ""
echo "================================================"
if [ "$HEALTHY" = true ]; then
    echo -e "${GREEN}✅ ALL SYSTEMS HEALTHY${NC}"
    echo ""
    echo "🌐 Dashboard: http://localhost:5173/merchant/settlements"
    exit 0
else
    echo -e "${RED}⚠️  SOME ISSUES DETECTED${NC}"
    echo ""
    echo "To restart all services:"
    echo "  ./start-merchant-dashboard.sh"
    echo ""
    echo "To view logs:"
    echo "  tail -f /tmp/merchant-api.log"
    echo "  tail -f /tmp/merchant-frontend.log"
    exit 1
fi
