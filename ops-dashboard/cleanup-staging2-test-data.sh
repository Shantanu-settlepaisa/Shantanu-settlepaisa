#!/bin/bash

###############################################################################
# Cleanup Test Data from Staging 2 Database
#
# This script removes ALL manual upload test data from the staging 2 database.
# Use this before running fresh reconciliation tests.
#
# Usage:
#   ./cleanup-staging2-test-data.sh
#
# Or run individual SQL commands via psql
###############################################################################

set -e

# Database connection details for Staging 2
DB_HOST="settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com"
DB_PORT="5432"
DB_NAME="settlepaisa_v2"
DB_USER="postgres"
DB_PASSWORD="SettlePaisa2024"

echo "=============================================="
echo "Staging 2 Test Data Cleanup"
echo "=============================================="
echo ""
echo "Database: $DB_NAME @ $DB_HOST"
echo ""

# Export password for psql
export PGPASSWORD="$DB_PASSWORD"

echo "🔍 Checking current data counts..."
echo ""

# Check current counts
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
SELECT
  'PG Transactions (manual)' as table_name,
  COUNT(*) as count
FROM sp_v2_transactions
WHERE source_type = 'MANUAL_UPLOAD'
UNION ALL
SELECT
  'Bank Statements',
  COUNT(*)
FROM sp_v2_bank_statements
UNION ALL
SELECT
  'Recon Jobs',
  COUNT(*)
FROM sp_v2_recon_jobs
UNION ALL
SELECT
  'Recon Results',
  COUNT(*)
FROM sp_v2_recon_results
UNION ALL
SELECT
  'Exceptions',
  COUNT(*)
FROM sp_v2_exceptions;
EOF

echo ""
echo "🗑️  Deleting test data..."
echo ""

# Delete in correct order due to foreign key constraints
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
BEGIN;

-- Delete recon results first (has FKs to recon_jobs)
DELETE FROM sp_v2_recon_results;

-- Delete exceptions
DELETE FROM sp_v2_exceptions;

-- Delete recon jobs
DELETE FROM sp_v2_recon_jobs;

-- Delete bank statements (all manual uploads)
DELETE FROM sp_v2_bank_statements;

-- Delete PG transactions (only manual uploads)
DELETE FROM sp_v2_transactions WHERE source_type = 'MANUAL_UPLOAD';

COMMIT;

-- Show final counts
SELECT '✅ Cleanup Complete!' as status;
SELECT
  'PG Transactions (manual)' as table_name,
  COUNT(*) as remaining
FROM sp_v2_transactions
WHERE source_type = 'MANUAL_UPLOAD'
UNION ALL
SELECT
  'Bank Statements',
  COUNT(*)
FROM sp_v2_bank_statements
UNION ALL
SELECT
  'Recon Jobs',
  COUNT(*)
FROM sp_v2_recon_jobs
UNION ALL
SELECT
  'Recon Results',
  COUNT(*)
FROM sp_v2_recon_results
UNION ALL
SELECT
  'Exceptions',
  COUNT(*)
FROM sp_v2_exceptions;
EOF

echo ""
echo "=============================================="
echo "✅ Database cleanup completed successfully!"
echo "=============================================="
echo ""
echo "You can now upload fresh test files."
echo ""

# Clear password
unset PGPASSWORD
