#!/bin/bash

echo "========================================="
echo "Applying Migration 032 to Staging 2"
echo "========================================="
echo ""

# Database connection details
DB_HOST="settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com"
DB_PORT="5432"
DB_NAME="settlepaisa_v2"
DB_USER="postgres"

echo "Target Database:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql command not found"
    echo "Please install PostgreSQL client tools"
    exit 1
fi

echo "Step 1: Applying migration 032_add_gross_amount_to_transactions.sql"
echo "----------------------------------------------------------------------"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f /Users/shantanusingh/ops-dashboard/db/migrations/032_add_gross_amount_to_transactions.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration 032_add_gross_amount_to_transactions.sql applied successfully"
else
    echo "❌ Failed to apply migration 032_add_gross_amount_to_transactions.sql"
    exit 1
fi

echo ""
echo "Step 2: Applying migration 032_add_upload_sessions.sql"
echo "----------------------------------------------------------------------"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f /Users/shantanusingh/ops-dashboard/db/migrations/032_add_upload_sessions.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration 032_add_upload_sessions.sql applied successfully"
else
    echo "❌ Failed to apply migration 032_add_upload_sessions.sql"
    exit 1
fi

echo ""
echo "========================================="
echo "✅ All migrations applied successfully!"
echo "========================================="
