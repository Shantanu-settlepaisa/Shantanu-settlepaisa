#!/bin/bash
#
# Deploy Frontend to Staging 2 S3
# This script rebuilds and deploys the ops dashboard frontend to staging 2
#

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Deploying Frontend to Staging 2"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Configuration
S3_BUCKET="s3://settlepaisa-ops-staging-2/"
REGION="ap-south-1"
BUILD_DIR="dist-ops"

# Step 1: Verify .env configuration
echo "📋 Step 1: Verifying environment configuration..."
if grep -q "VITE_UPLOAD_API_URL=http://52.66.199.215:5107" .env.staging-ops; then
    echo "✅ Upload API URL correct: 52.66.199.215:5107"
else
    echo "❌ ERROR: Upload API URL not correct in .env.staging-ops"
    exit 1
fi

if grep -q "VITE_RECON_API_URL=http://52.66.199.215:5103" .env.staging-ops; then
    echo "✅ Recon API URL correct: 52.66.199.215:5103"
else
    echo "❌ ERROR: Recon API URL not correct in .env.staging-ops"
    exit 1
fi
echo ""

# Step 2: Clean old build
echo "🧹 Step 2: Cleaning old build..."
rm -rf "$BUILD_DIR"
echo "✅ Cleaned $BUILD_DIR"
echo ""

# Step 3: Build frontend
echo "🔨 Step 3: Building frontend for staging-ops..."
npm run build:staging-ops
echo "✅ Build complete"
echo ""

# Step 4: Verify build has correct URLs
echo "🔍 Step 4: Verifying build URLs..."
if grep -r "52.66.199.215:5107" "$BUILD_DIR/assets/" > /dev/null; then
    echo "✅ Upload API URL found in build"
else
    echo "⚠️  WARNING: Upload API URL not found in build"
fi

if grep -r "52.66.199.215:5103" "$BUILD_DIR/assets/" > /dev/null; then
    echo "✅ Recon API URL found in build"
else
    echo "⚠️  WARNING: Recon API URL not found in build"
fi

# Check for localhost URLs (should be minimal)
LOCALHOST_COUNT=$(grep -r "http://localhost" "$BUILD_DIR/assets/" 2>/dev/null | wc -l | tr -d ' ')
echo "ℹ️  Found $LOCALHOST_COUNT localhost references (mostly in error messages)"
echo ""

# Step 5: Deploy to S3
echo "☁️  Step 5: Deploying to S3..."
echo "Bucket: $S3_BUCKET"
echo "Region: $REGION"
echo ""

aws s3 sync "$BUILD_DIR/" "$S3_BUCKET" --delete --region "$REGION"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 Frontend deployed to Staging 2"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🌐 Access at: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com"
    echo ""
    echo "🧪 To verify:"
    echo "1. Open browser DevTools (F12)"
    echo "2. Go to Network tab"
    echo "3. Try uploading a file"
    echo "4. Check the request goes to: http://52.66.199.215:5107/api/upload/multiple"
    echo "5. Should NOT see localhost URLs"
    echo ""
else
    echo ""
    echo "❌ Deployment failed!"
    echo "Check AWS credentials and S3 bucket permissions"
    exit 1
fi
