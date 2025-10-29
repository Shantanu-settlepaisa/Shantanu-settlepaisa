#!/bin/bash
# Deploy Task 2: Remove Mock Data Fallbacks to Staging

echo "🚀 Deploying Task 2 (Recon API Mock Data Removal) to Staging..."

# Staging EC2 details
STAGING_HOST="ec2-user@13.201.179.44"
STAGING_PATH="/home/ec2-user/ops-dashboard"

echo "📦 Step 1: Copy updated recon-api files to staging..."
scp services/recon-api/index.js $STAGING_HOST:$STAGING_PATH/services/recon-api/
scp services/recon-api/jobs/runReconciliation.js $STAGING_HOST:$STAGING_PATH/services/recon-api/jobs/
scp services/recon-api/.env.example $STAGING_HOST:$STAGING_PATH/services/recon-api/

echo "🔄 Step 2: Restart recon-api service on staging..."
ssh $STAGING_HOST "cd $STAGING_PATH/services/recon-api && pm2 restart recon-api"

echo "✅ Step 3: Verify service is running..."
ssh $STAGING_HOST "pm2 list | grep recon-api"

echo ""
echo "🎯 Deployment Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Test SFTP health: curl http://13.201.179.44:5103/connectors/bank/health"
echo "2. Check logs: ssh $STAGING_HOST 'pm2 logs recon-api --lines 50'"
echo "3. Verify no 'using mock data' in logs"
echo ""
