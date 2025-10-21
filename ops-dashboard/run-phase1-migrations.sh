#!/bin/bash

# Phase 1 Migration Script
# Purpose: Apply all Phase 1 database migrations
# Usage: ./run-phase1-migrations.sh

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database connection details
DB_HOST="localhost"
DB_PORT="5433"
DB_NAME="settlepaisa_v2"
DB_USER="postgres"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 1 Migration Runner${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql not found. Please install PostgreSQL client.${NC}"
    exit 1
fi

# Check if Docker container is running
echo -e "${YELLOW}Checking PostgreSQL container...${NC}"
if ! docker ps | grep -q "ops-postgres-v2"; then
    echo -e "${RED}Error: PostgreSQL container not running.${NC}"
    echo -e "${YELLOW}Starting container...${NC}"
    docker-compose up -d ops-postgres-v2
    sleep 3
fi

# Test database connection
echo -e "${YELLOW}Testing database connection...${NC}"
if ! PGPASSWORD=settlepaisa123 psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "SELECT 1;" &> /dev/null; then
    echo -e "${RED}Error: Cannot connect to database.${NC}"
    echo -e "${YELLOW}Connection details:${NC}"
    echo "  Host: $DB_HOST"
    echo "  Port: $DB_PORT"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    exit 1
fi
echo -e "${GREEN}✓ Database connection successful${NC}"
echo ""

# Function to run migration
run_migration() {
    local migration_file=$1
    local migration_name=$2

    echo -e "${BLUE}Running Migration: $migration_name${NC}"
    echo "File: $migration_file"

    if [ ! -f "$migration_file" ]; then
        echo -e "${RED}Error: Migration file not found: $migration_file${NC}"
        return 1
    fi

    PGPASSWORD=settlepaisa123 psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration_file"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Migration completed successfully${NC}"
    else
        echo -e "${RED}✗ Migration failed${NC}"
        return 1
    fi
    echo ""
}

# Run all migrations in order
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Applying Migrations${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

run_migration "db/migrations/025_add_settlement_type.sql" "025: Settlement Type Column"
run_migration "db/migrations/026_user_management.sql" "026: User Management Tables"
run_migration "db/migrations/027_audit_log.sql" "027: Audit Log"
run_migration "db/migrations/028_production_indexes.sql" "028: Production Indexes"

# Verify migrations
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Verifying Migrations${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${YELLOW}Checking tables...${NC}"
PGPASSWORD=settlepaisa123 psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
SELECT table_name
FROM information_schema.tables
WHERE table_name IN (
  'sp_v2_ops_users',
  'sp_v2_user_sessions',
  'sp_v2_user_permissions',
  'sp_v2_login_attempts',
  'sp_v2_ops_audit_log'
)
ORDER BY table_name;
" 2>&1 | grep -E "(sp_v2_|rows)"

echo ""
echo -e "${YELLOW}Checking default admin user...${NC}"
PGPASSWORD=settlepaisa123 psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
SELECT email, full_name, role, is_active
FROM sp_v2_ops_users
WHERE email = 'admin@settlepaisa.com';
" 2>&1 | grep -E "(admin@|rows)"

echo ""
echo -e "${YELLOW}Checking indexes...${NC}"
INDEX_COUNT=$(PGPASSWORD=settlepaisa123 psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "
SELECT COUNT(*)
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
  AND tablename LIKE 'sp_v2_%';
")

echo "Total indexes created: $INDEX_COUNT"

if [ "$INDEX_COUNT" -ge 23 ]; then
    echo -e "${GREEN}✓ All indexes created${NC}"
else
    echo -e "${YELLOW}⚠ Expected 23+ indexes, found $INDEX_COUNT${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Migration Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}✓ Migration 025: Settlement Type Column${NC}"
echo -e "${GREEN}✓ Migration 026: User Management Tables${NC}"
echo -e "${GREEN}✓ Migration 027: Audit Log${NC}"
echo -e "${GREEN}✓ Migration 028: Production Indexes${NC}"
echo ""
echo -e "${BLUE}Default Credentials:${NC}"
echo "  Email: admin@settlepaisa.com"
echo "  Password: Admin@123"
echo -e "${YELLOW}  ⚠️  CHANGE THIS PASSWORD AFTER FIRST LOGIN!${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Install dependencies: cd services/overview-api && npm install bcryptjs jsonwebtoken winston"
echo "2. Create .env file: cp services/overview-api/.env.example services/overview-api/.env"
echo "3. Start server: cd services/overview-api && node index.js"
echo "4. Test login: See PHASE1_TESTING_GUIDE.md"
echo ""
echo -e "${GREEN}Phase 1 migrations completed successfully! 🎉${NC}"
