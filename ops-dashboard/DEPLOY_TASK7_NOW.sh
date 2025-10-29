#!/bin/bash
# Task 7 Deployment Script - Execute this on your local machine
# Prerequisite: SSH access to EC2 and AWS CLI configured

set -e  # Exit on error

STAGING_EC2="ec2-user@13.201.179.44"
S3_BUCKET="s3://shantanu-settlepaisa-ops-staging/"
AWS_REGION="ap-south-1"

echo "════════════════════════════════════════════════════════════════"
echo "  Task 7 Deployment to Staging - Refund/Chargeback Breakdown"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check prerequisites
echo "Checking prerequisites..."
command -v ssh >/dev/null 2>&1 || { echo "❌ SSH not found"; exit 1; }
command -v scp >/dev/null 2>&1 || { echo "❌ SCP not found"; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI not found"; exit 1; }
echo "✅ Prerequisites OK"
echo ""

# ============================================================================
# STEP 1: Deploy Database Migration
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Deploy Database Migration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Uploading migration files to EC2..."
scp db/migrations/029_add_deductions_to_settlement_batches.sql ${STAGING_EC2}:~/migrations/ || mkdir -p ~/migrations
scp run-migration-029-staging.cjs ${STAGING_EC2}:~/

echo "✅ Migration files uploaded"
echo ""

echo "Running migration on staging RDS..."
echo "⚠️  This requires DB_PASSWORD environment variable"
ssh ${STAGING_EC2} << 'ENDSSH'
cd ~
export DB_PASSWORD="settlepaisa123"  # Replace with actual staging password
node run-migration-029-staging.cjs
ENDSSH

if [ $? -eq 0 ]; then
  echo "✅ Step 1 Complete: Database migration successful"
else
  echo "❌ Step 1 Failed: Database migration error"
  exit 1
fi
echo ""

# ============================================================================
# STEP 2: Deploy Backend Files to EC2
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: Deploy Backend Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Uploading settlement-queue-processor.cjs..."
scp services/settlement-engine/settlement-queue-processor.cjs \
    ${STAGING_EC2}:/home/ec2-user/services/settlement-engine/

echo "Uploading overview-v2.js..."
scp services/overview-api/overview-v2.js \
    ${STAGING_EC2}:/home/ec2-user/services/overview-api/

echo "✅ Backend files uploaded"
echo ""

echo "Restarting PM2 services..."
ssh ${STAGING_EC2} << 'ENDSSH'
pm2 restart settlement-queue-processor
pm2 restart overview-api
sleep 3
pm2 status | grep -E "settlement-queue-processor|overview-api"
ENDSSH

if [ $? -eq 0 ]; then
  echo "✅ Step 2 Complete: Backend services restarted"
else
  echo "❌ Step 2 Failed: Service restart error"
  exit 1
fi
echo ""

# ============================================================================
# STEP 3: Deploy Frontend to S3
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3: Deploy Frontend to S3"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Verifying dist/ folder exists..."
if [ ! -d "dist" ]; then
  echo "❌ dist/ folder not found. Run 'npm run build' first."
  exit 1
fi

echo "Deploying to S3..."
aws s3 sync dist/ ${S3_BUCKET} \
    --delete \
    --region ${AWS_REGION} \
    --no-progress

if [ $? -eq 0 ]; then
  echo "✅ Step 3 Complete: Frontend deployed to S3"
else
  echo "❌ Step 3 Failed: S3 deployment error"
  exit 1
fi
echo ""

# ============================================================================
# STEP 4: Verification
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 4: Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Checking PM2 service status..."
ssh ${STAGING_EC2} << 'ENDSSH'
pm2 list | grep -E "settlement-queue-processor|overview-api"
ENDSSH

echo ""
echo "Checking database migration..."
ssh ${STAGING_EC2} << 'ENDSSH'
cd ~
export DB_PASSWORD="settlepaisa123"  # Replace with actual staging password
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'admin',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});
pool.query(\`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'sp_v2_settlement_batches'
    AND column_name IN ('refund_deductions_paise', 'chargeback_deductions_paise', 'outstanding_debt_recovered_paise')
\`).then(result => {
  console.log('✅ Found', result.rows.length, 'new columns');
  result.rows.forEach(row => console.log('   •', row.column_name));
  pool.end();
}).catch(err => {
  console.error('❌ Verification failed:', err.message);
  pool.end();
  process.exit(1);
});
"
ENDSSH

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ DEPLOYMENT COMPLETE!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "1. Open staging dashboard: http://ops-dashboard-staging.s3-website.ap-south-1.amazonaws.com"
echo "2. Navigate to Reports page"
echo "3. Generate Settlement Summary report"
echo "4. Verify CSV contains new columns:"
echo "   - refundDeductionsRupees"
echo "   - chargebackDeductionsRupees"
echo "   - debtRecoveredRupees"
echo ""
echo "If issues occur:"
echo "• Check PM2 logs: ssh ${STAGING_EC2} 'pm2 logs settlement-queue-processor --lines 50'"
echo "• Check PM2 logs: ssh ${STAGING_EC2} 'pm2 logs overview-api --lines 50'"
echo ""
