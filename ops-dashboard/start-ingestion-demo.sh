#!/bin/bash

echo "======================================"
echo "Starting SFTP Ingestion Demo"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Step 1: Set environment variables
echo -e "${BLUE}Step 1: Setting environment variables...${NC}"
export FEATURE_BANK_SFTP_INGESTION=true
export VITE_FEATURE_BANK_SFTP_INGESTION=true
export USE_MOCK_SFTP=true
echo -e "${GREEN}✓ Feature flags enabled${NC}"
echo ""

# Step 2: Check if database tables exist and create if needed
echo -e "${BLUE}Step 2: Setting up database...${NC}"
psql -U postgres -d settlepaisa_ops -c "SELECT 1 FROM connector_health LIMIT 1" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Creating database tables..."
    psql -U postgres -d settlepaisa_ops < db/migrations/003_create_ingestion_tables.sql
    echo -e "${GREEN}✓ Database tables created${NC}"
else
    echo -e "${GREEN}✓ Database tables already exist${NC}"
fi
echo ""

# Step 3: Seed mock data
echo -e "${BLUE}Step 3: Adding mock data for demo...${NC}"
cd services/api/ingest
node seed-mock-data.js
echo -e "${GREEN}✓ Mock data added${NC}"
cd ../../..
echo ""

# Step 4: Start the ingestion API
echo -e "${BLUE}Step 4: Starting Ingestion API...${NC}"
pkill -f "node.*ingest.*server" 2>/dev/null
cd services/api/ingest
if [ ! -d "node_modules" ]; then
    npm install > /dev/null 2>&1
fi
npx ts-node server.ts > /tmp/ingest-api.log 2>&1 &
sleep 3
cd ../../..

# Check if API is running
curl -s http://localhost:5106/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Ingestion API running on port 5106${NC}"
else
    echo -e "${YELLOW}⚠ Ingestion API may not be running. Check /tmp/ingest-api.log${NC}"
fi
echo ""

# Step 5: Instructions
echo -e "${BLUE}Step 5: View the UI${NC}"
echo ""
echo "The Connector Health card is now enabled! To see it:"
echo ""
echo "1. Make sure the frontend is running:"
echo -e "   ${YELLOW}npm run dev -- --port 5174${NC}"
echo ""
echo "2. Open your browser to:"
echo -e "   ${GREEN}http://localhost:5174/ops/overview${NC}"
echo ""
echo "3. Look for the 'Connector Health' card showing:"
echo "   • AXIS - ${GREEN}HEALTHY${NC} (3/3 files received)"
echo "   • HDFC - ${YELLOW}DEGRADED${NC} (3/4 files received)"
echo "   • ICICI - ${RED}DOWN${NC} (0/2 files received)"
echo ""
echo "4. Click on any bank row to see:"
echo "   • Files tab - List of processed files"
echo "   • Windows tab - Expected vs received files"
echo "   • Actions - Recompute and Poll Now buttons"
echo ""
echo "======================================"
echo -e "${GREEN}Demo Ready!${NC}"
echo "======================================"