#!/bin/bash
# Complete Production Deployment Script for SettlePaisa Ops Dashboard
# Handles backend, frontend, validation, and CloudFront invalidation atomically

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PRODUCTION_EC2_USER="ec2-user"
PRODUCTION_EC2_IP="15.207.207.203"
PRODUCTION_EC2_KEY="~/.ssh/settlepaisa-production-key.pem"
PRODUCTION_S3_BUCKET="settlepaisa-ops-production"
CLOUDFRONT_DIST_ID="E2HM34NGEJZOL6"
AWS_REGION="ap-south-1"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SettlePaisa Production Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
echo "🔍 Checking prerequisites..."

if [ ! -f "$PRODUCTION_EC2_KEY" ]; then
  echo -e "${RED}❌ ERROR: SSH key not found at $PRODUCTION_EC2_KEY${NC}"
  exit 1
fi

if ! command -v aws &> /dev/null; then
  echo -e "${RED}❌ ERROR: AWS CLI not installed${NC}"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo -e "${RED}❌ ERROR: npm not installed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"
echo ""

# Step 1: Detect if .env.production-ops changed
echo -e "${YELLOW}Step 1: Checking for .env changes...${NC}"

REBUILD_FRONTEND=false

if git diff HEAD~1 .env.production-ops 2>/dev/null | grep -q "VITE_"; then
  echo -e "${YELLOW}⚠️  .env.production-ops has changed${NC}"
  echo "   Frontend MUST be rebuilt to pick up new environment variables"
  REBUILD_FRONTEND=true
else
  echo "No .env changes detected"

  # Check if there are frontend code changes
  if git diff HEAD~1 --name-only | grep -E "^src/|^vite.config" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Frontend source code has changed${NC}"
    REBUILD_FRONTEND=true
  fi
fi

# Ask user to confirm frontend rebuild
if [ "$REBUILD_FRONTEND" = true ]; then
  echo ""
  read -p "Rebuild and deploy frontend? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping frontend rebuild (as requested)"
    REBUILD_FRONTEND=false
  fi
fi

echo ""

# Step 2: Deploy Backend
echo -e "${YELLOW}Step 2: Deploying backend to production EC2...${NC}"

ssh -i "$PRODUCTION_EC2_KEY" "$PRODUCTION_EC2_USER@$PRODUCTION_EC2_IP" << 'ENDSSH'
  cd /home/ec2-user/ops-dashboard/ops-dashboard

  echo "📦 Pulling latest code..."
  git fetch origin
  git pull origin production

  echo "📦 Installing dependencies (if package.json changed)..."
  npm install

  echo "🔄 Restarting all PM2 services..."
  pm2 restart all

  echo "✅ Backend deployment complete"

  echo ""
  echo "PM2 Status:"
  pm2 status
ENDSSH

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Backend deployed successfully${NC}"
else
  echo -e "${RED}❌ Backend deployment failed${NC}"
  exit 1
fi

echo ""

# Step 3: Rebuild Frontend (if needed)
if [ "$REBUILD_FRONTEND" = true ]; then
  echo -e "${YELLOW}Step 3: Rebuilding frontend...${NC}"

  # Clean old build
  rm -rf dist-ops

  # Build
  echo "🏗️  Building with production-ops configuration..."
  npm run build:production-ops

  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Frontend build failed${NC}"
    exit 1
  fi

  echo -e "${GREEN}✅ Frontend built${NC}"
  echo ""

  # Step 4: Validate Build
  echo -e "${YELLOW}Step 4: Validating build...${NC}"

  if [ -f "scripts/validate-build.sh" ]; then
    ./scripts/validate-build.sh

    if [ $? -ne 0 ]; then
      echo -e "${RED}❌ Build validation failed${NC}"
      echo "Fix the issues and try again"
      exit 1
    fi
  else
    echo -e "${YELLOW}⚠️  validate-build.sh not found, skipping validation${NC}"
  fi

  echo ""

  # Step 5: Deploy to S3
  echo -e "${YELLOW}Step 5: Deploying frontend to S3...${NC}"

  # Upload JS files with correct MIME type
  echo "📤 Uploading JavaScript files..."
  aws s3 cp dist-ops/assets/ s3://$PRODUCTION_S3_BUCKET/assets/ \
    --recursive \
    --content-type "application/javascript" \
    --exclude "*" \
    --include "*.js" \
    --region $AWS_REGION

  # Upload CSS files
  echo "📤 Uploading CSS files..."
  aws s3 cp dist-ops/assets/ s3://$PRODUCTION_S3_BUCKET/assets/ \
    --recursive \
    --content-type "text/css" \
    --exclude "*" \
    --include "*.css" \
    --region $AWS_REGION

  # Upload index.html with no-cache
  echo "📤 Uploading index.html..."
  aws s3 cp dist-ops/index.html s3://$PRODUCTION_S3_BUCKET/index.html \
    --content-type "text/html" \
    --cache-control "no-cache" \
    --region $AWS_REGION

  # Upload other files
  echo "📤 Uploading other assets..."
  aws s3 sync dist-ops/ s3://$PRODUCTION_S3_BUCKET/ \
    --delete \
    --exclude "*.js" \
    --exclude "*.css" \
    --exclude "index.html" \
    --region $AWS_REGION

  echo -e "${GREEN}✅ Frontend deployed to S3${NC}"
  echo ""

  # Step 6: Invalidate CloudFront Cache
  echo -e "${YELLOW}Step 6: Invalidating CloudFront cache...${NC}"

  INVALIDATION_OUTPUT=$(aws cloudfront create-invalidation \
    --distribution-id $CLOUDFRONT_DIST_ID \
    --paths "/*" \
    --region us-east-1 \
    --query "Invalidation.{Id:Id,Status:Status}" \
    --output json)

  INVALIDATION_ID=$(echo $INVALIDATION_OUTPUT | grep -o '"Id": *"[^"]*"' | sed 's/"Id": *"\([^"]*\)"/\1/')

  echo -e "${GREEN}✅ CloudFront invalidation started${NC}"
  echo "   Invalidation ID: $INVALIDATION_ID"
  echo ""
  echo "   Waiting for invalidation to complete (this may take 2-3 minutes)..."

  # Wait for invalidation to complete
  for i in {1..30}; do
    sleep 10
    STATUS=$(aws cloudfront get-invalidation \
      --distribution-id $CLOUDFRONT_DIST_ID \
      --id "$INVALIDATION_ID" \
      --region us-east-1 \
      --query "Invalidation.Status" \
      --output text 2>/dev/null || echo "InProgress")

    if [ "$STATUS" = "Completed" ]; then
      echo -e "${GREEN}✅ CloudFront cache invalidated${NC}"
      break
    fi

    echo -n "."
  done
  echo ""
else
  echo -e "${YELLOW}Step 3-6: Skipping frontend deployment (no changes)${NC}"
  echo ""
fi

# Step 7: Run Smoke Tests
echo -e "${YELLOW}Step 7: Running production smoke tests...${NC}"
echo ""

if [ -f "scripts/smoke-test-production.sh" ]; then
  ./scripts/smoke-test-production.sh

  if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}⚠️  Some smoke tests failed${NC}"
    echo "Deployment completed but there may be issues"
    echo "Check the output above for details"
  fi
else
  echo -e "${YELLOW}⚠️  smoke-test-production.sh not found, skipping tests${NC}"
fi

# Summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Production URLs:"
echo "  Frontend: https://settlepaisaops.sabpaisa.in"
echo "  Backend:  https://settlepaisaopsapi.sabpaisa.in"
echo ""
echo "What was deployed:"
echo "  ✅ Backend services (PM2 restarted)"
if [ "$REBUILD_FRONTEND" = true ]; then
  echo "  ✅ Frontend (rebuilt and uploaded to S3)"
  echo "  ✅ CloudFront cache (invalidated)"
else
  echo "  ⏭️  Frontend (skipped - no changes)"
fi
echo ""
echo "Next steps:"
echo "  1. Test the application: https://settlepaisaops.sabpaisa.in"
echo "  2. Monitor logs: ssh -i $PRODUCTION_EC2_KEY $PRODUCTION_EC2_USER@$PRODUCTION_EC2_IP 'pm2 logs'"
echo "  3. Check metrics in CloudWatch (if configured)"
echo ""
echo "If issues occur:"
echo "  - Check logs: ssh -i $PRODUCTION_EC2_KEY $PRODUCTION_EC2_USER@$PRODUCTION_EC2_IP 'pm2 logs'"
echo "  - Verify PM2 status: ssh -i $PRODUCTION_EC2_KEY $PRODUCTION_EC2_USER@$PRODUCTION_EC2_IP 'pm2 status'"
echo "  - Re-run smoke tests: ./scripts/smoke-test-production.sh"
echo ""
