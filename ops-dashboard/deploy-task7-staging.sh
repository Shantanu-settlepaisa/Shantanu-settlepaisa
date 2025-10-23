#!/bin/bash

# Task 7 Deployment Script: Refund/Chargeback Breakdown Columns
# This script deploys migration 029 and updated services to staging

set -e  # Exit on any error

STAGING_HOST="ec2-user@13.201.179.44"
STAGING_KEY="~/.ssh/your-staging-key.pem"  # Update with your SSH key path

echo "════════════════════════════════════════════════════════════════"
echo "  Task 7: Deploy Refund/Chargeback Breakdown to Staging"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Step 1: Run migration locally (already done, but verify)
echo "Step 1: Verify local migration..."
if node run-migration-029.cjs; then
  echo "✅ Local migration verified"
else
  echo "❌ Local migration failed - stopping deployment"
  exit 1
fi
echo ""

# Step 2: Prepare migration for staging
echo "Step 2: Prepare staging migration script..."
cat > /tmp/run-migration-029-staging.cjs <<'MIGRATION_SCRIPT'
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Staging RDS connection - REPLACE WITH ACTUAL CREDENTIALS
const pool = new Pool({
  host: 'settlepaisa-v2-staging.xxxxx.ap-south-1.rds.amazonaws.com',
  port: 5432,
  database: 'settlepaisa_v2',
  user: 'admin',
  password: process.env.DB_PASSWORD || 'REPLACE_WITH_STAGING_PASSWORD',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('🔄 Running Migration 029 on STAGING RDS...\n');

    const migrationSQL = fs.readFileSync('029_add_deductions_to_settlement_batches.sql', 'utf8');
    await pool.query(migrationSQL);

    console.log('✅ Migration 029 completed on STAGING!\n');

    // Verify
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'sp_v2_settlement_batches'
        AND column_name IN ('refund_deductions_paise', 'chargeback_deductions_paise', 'outstanding_debt_recovered_paise')
      ORDER BY column_name
    `);

    console.log('✅ Verified', verifyResult.rows.length, 'columns created');
    verifyResult.rows.forEach(row => {
      console.log(`   • ${row.column_name} (${row.data_type})`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
MIGRATION_SCRIPT

echo "✅ Staging migration script prepared"
echo ""

# Step 3: Deploy backend files to staging
echo "Step 3: Deploy updated backend files..."
echo "   • settlement-queue-processor.cjs"
echo "   • overview-v2.js"
echo ""

echo "⚠️  MANUAL STEPS REQUIRED:"
echo ""
echo "1. Upload migration files to staging:"
echo "   scp db/migrations/029_add_deductions_to_settlement_batches.sql ${STAGING_HOST}:~/migrations/"
echo "   scp /tmp/run-migration-029-staging.cjs ${STAGING_HOST}:~/migrations/"
echo ""
echo "2. Run migration on staging:"
echo "   ssh ${STAGING_HOST}"
echo "   cd ~/migrations"
echo "   DB_PASSWORD='YOUR_RDS_PASSWORD' node run-migration-029-staging.cjs"
echo ""
echo "3. Deploy settlement-engine updates:"
echo "   scp services/settlement-engine/settlement-queue-processor.cjs ${STAGING_HOST}:/home/ec2-user/services/settlement-engine/"
echo "   ssh ${STAGING_HOST} 'pm2 restart settlement-queue-processor'"
echo ""
echo "4. Deploy overview-api updates:"
echo "   scp services/overview-api/overview-v2.js ${STAGING_HOST}:/home/ec2-user/services/overview-api/"
echo "   ssh ${STAGING_HOST} 'pm2 restart overview-api'"
echo ""
echo "5. Build and deploy frontend:"
echo "   cp .env.staging-ops .env"
echo "   npm run build"
echo "   aws s3 sync dist/ s3://shantanu-settlepaisa-ops-staging/ --delete --region ap-south-1"
echo ""
echo "6. Verify on staging:"
echo "   • Check settlement queue processor logs: pm2 logs settlement-queue-processor --lines 50"
echo "   • Check overview API logs: pm2 logs overview-api --lines 50"
echo "   • Open https://shantanu-settlepaisa-ops-staging.s3.ap-south-1.amazonaws.com/index.html"
echo "   • Download settlement report and verify 3 new columns appear"
echo ""
echo "════════════════════════════════════════════════════════════════"
