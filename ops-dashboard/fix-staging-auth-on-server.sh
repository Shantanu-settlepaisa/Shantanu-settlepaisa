#!/bin/bash
# Run this script ON THE STAGING SERVER to fix authentication issue
# Usage: ./fix-staging-auth-on-server.sh

set -e

echo "=================================="
echo "Staging 2 Auth Fix - Automated"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Find project directory
echo "[1/7] Locating project directory..."
PROJECT_DIR=$(pm2 describe upload-api 2>/dev/null | grep 'exec cwd' | awk '{print $NF}' | head -1)

if [ -z "$PROJECT_DIR" ]; then
  echo -e "${RED}❌ Cannot find upload-api in PM2${NC}"
  echo "Please run: pm2 list"
  exit 1
fi

echo -e "${GREEN}✅ Found project at: $PROJECT_DIR${NC}"
cd "$PROJECT_DIR"
echo ""

# Step 2: Backup current .env files
echo "[2/7] Backing up .env files..."
BACKUP_DIR="env-backups-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -f .env ]; then
  cp .env "$BACKUP_DIR/api-env-backup"
  echo "   Backed up api/.env"
fi

if [ -f ../overview-api/.env ]; then
  cp ../overview-api/.env "$BACKUP_DIR/overview-api-env-backup"
  echo "   Backed up overview-api/.env"
fi

echo -e "${GREEN}✅ Backups saved to: $BACKUP_DIR${NC}"
echo ""

# Step 3: Check JWT_SECRET in overview-api
echo "[3/7] Checking JWT_SECRET configuration..."
cd ../overview-api

if [ ! -f .env ]; then
  echo -e "${RED}❌ overview-api/.env not found!${NC}"
  exit 1
fi

OVERVIEW_JWT_SECRET=$(grep '^JWT_SECRET=' .env | cut -d= -f2-)

if [ -z "$OVERVIEW_JWT_SECRET" ]; then
  echo -e "${RED}❌ JWT_SECRET not set in overview-api/.env${NC}"
  echo "Please edit services/overview-api/.env and set JWT_SECRET"
  exit 1
fi

if [ "$OVERVIEW_JWT_SECRET" = "your-secret-key-change-this-in-production" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Using default JWT_SECRET${NC}"
  echo "   For production, generate strong secret:"
  echo "   openssl rand -base64 64 | tr -d '\\n'"
  echo ""
fi

# Check secret strength
SECRET_LENGTH=${#OVERVIEW_JWT_SECRET}
if [ $SECRET_LENGTH -lt 32 ]; then
  echo -e "${YELLOW}⚠️  WARNING: JWT_SECRET is weak ($SECRET_LENGTH chars)${NC}"
  echo "   Recommended: 64+ characters"
  echo ""
fi

echo "   Overview API JWT_SECRET: ${OVERVIEW_JWT_SECRET:0:20}... (length: $SECRET_LENGTH)"
echo ""

# Step 4: Update upload API .env
echo "[4/7] Updating upload API configuration..."
cd ../api

# Check if .env exists
if [ ! -f .env ]; then
  echo "   Creating .env file..."
  cat > .env << EOF
# Upload API Environment Variables
PORT=5107
NODE_ENV=production

# Database Configuration (must match overview-api)
DB_HOST=$(grep '^DB_HOST=' ../overview-api/.env | cut -d= -f2-)
DB_PORT=$(grep '^DB_PORT=' ../overview-api/.env | cut -d= -f2-)
DB_NAME=$(grep '^DB_NAME=' ../overview-api/.env | cut -d= -f2-)
DB_USER=$(grep '^DB_USER=' ../overview-api/.env | cut -d= -f2-)
DB_PASSWORD=$(grep '^DB_PASSWORD=' ../overview-api/.env | cut -d= -f2-)

# JWT Authentication (must match overview-api)
JWT_SECRET=$OVERVIEW_JWT_SECRET

# File Upload Settings
UPLOAD_DIR=./uploads
UPLOAD_MAX_FILE_SIZE=104857600
UPLOAD_ALLOWED_EXTENSIONS=.csv,.xlsx
UPLOAD_MAX_FILES=10

# CORS
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
EOF
  echo -e "${GREEN}✅ Created .env file with correct configuration${NC}"
else
  echo "   Updating existing .env file..."

  # Update JWT_SECRET
  if grep -q '^JWT_SECRET=' .env; then
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$OVERVIEW_JWT_SECRET|" .env
  else
    echo "JWT_SECRET=$OVERVIEW_JWT_SECRET" >> .env
  fi

  # Update database config to match overview-api
  OVERVIEW_DB_HOST=$(grep '^DB_HOST=' ../overview-api/.env | cut -d= -f2-)
  OVERVIEW_DB_NAME=$(grep '^DB_NAME=' ../overview-api/.env | cut -d= -f2-)
  OVERVIEW_DB_PORT=$(grep '^DB_PORT=' ../overview-api/.env | cut -d= -f2-)
  OVERVIEW_DB_USER=$(grep '^DB_USER=' ../overview-api/.env | cut -d= -f2-)
  OVERVIEW_DB_PASSWORD=$(grep '^DB_PASSWORD=' ../overview-api/.env | cut -d= -f2-)

  sed -i.bak "s|^DB_HOST=.*|DB_HOST=$OVERVIEW_DB_HOST|" .env
  sed -i.bak "s|^DB_NAME=.*|DB_NAME=$OVERVIEW_DB_NAME|" .env
  sed -i.bak "s|^DB_PORT=.*|DB_PORT=$OVERVIEW_DB_PORT|" .env
  sed -i.bak "s|^DB_USER=.*|DB_USER=$OVERVIEW_DB_USER|" .env
  sed -i.bak "s|^DB_PASSWORD=.*|DB_PASSWORD=$OVERVIEW_DB_PASSWORD|" .env

  echo -e "${GREEN}✅ Updated .env with matching configuration${NC}"
fi

echo ""

# Step 5: Verify configuration
echo "[5/7] Verifying configuration..."
UPLOAD_JWT_SECRET=$(grep '^JWT_SECRET=' .env | cut -d= -f2-)
UPLOAD_DB_HOST=$(grep '^DB_HOST=' .env | cut -d= -f2-)
UPLOAD_DB_NAME=$(grep '^DB_NAME=' .env | cut -d= -f2-)

if [ "$OVERVIEW_JWT_SECRET" = "$UPLOAD_JWT_SECRET" ]; then
  echo -e "${GREEN}✅ JWT_SECRET matches${NC}"
else
  echo -e "${RED}❌ JWT_SECRET mismatch!${NC}"
  echo "   Overview: ${OVERVIEW_JWT_SECRET:0:20}..."
  echo "   Upload:   ${UPLOAD_JWT_SECRET:0:20}..."
  exit 1
fi

if [ "$(grep '^DB_HOST=' ../overview-api/.env)" = "$(grep '^DB_HOST=' .env)" ]; then
  echo -e "${GREEN}✅ Database configuration matches${NC}"
else
  echo -e "${YELLOW}⚠️  Database configuration differs${NC}"
  echo "   Overview DB: $OVERVIEW_DB_HOST / $OVERVIEW_DB_NAME"
  echo "   Upload DB:   $UPLOAD_DB_HOST / $UPLOAD_DB_NAME"
fi

echo ""

# Step 6: Restart services
echo "[6/7] Restarting PM2 services..."
pm2 restart upload-api
sleep 2
pm2 restart overview-api
sleep 2
pm2 restart recon-api

echo -e "${GREEN}✅ Services restarted${NC}"
echo ""

# Step 7: Verify services are running
echo "[7/7] Verifying services..."
sleep 3

if pm2 list | grep -q "upload-api.*online"; then
  echo -e "${GREEN}✅ upload-api is running${NC}"
else
  echo -e "${RED}❌ upload-api failed to start${NC}"
  echo "Check logs: pm2 logs upload-api"
  exit 1
fi

if pm2 list | grep -q "overview-api.*online"; then
  echo -e "${GREEN}✅ overview-api is running${NC}"
else
  echo -e "${RED}❌ overview-api failed to start${NC}"
  echo "Check logs: pm2 logs overview-api"
  exit 1
fi

echo ""
echo "=================================="
echo "✅ FIX APPLIED SUCCESSFULLY!"
echo "=================================="
echo ""
echo "Services restarted with matching configuration:"
echo "  • JWT_SECRET: ${OVERVIEW_JWT_SECRET:0:20}... (length: $SECRET_LENGTH)"
echo "  • Database: $UPLOAD_DB_HOST / $UPLOAD_DB_NAME"
echo ""
echo "Next steps:"
echo "  1. Run diagnostic from local machine:"
echo "     ./diagnose-staging2-auth.sh"
echo ""
echo "  2. Test in browser:"
echo "     http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com"
echo ""
echo "  3. Check logs if issues persist:"
echo "     pm2 logs upload-api"
echo ""
echo "Backups saved to: $PROJECT_DIR/$BACKUP_DIR"
echo ""
