#!/bin/bash

# SettlePaisa 2.0 Database Setup Script
# This script sets up the PostgreSQL database for the reconciliation system

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="settlepaisa_recon"
DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"

echo -e "${BLUE}🔧 SettlePaisa 2.0 Database Setup${NC}"
echo "=================================="

# Check if PostgreSQL is running
echo -e "${YELLOW}📋 Checking PostgreSQL status...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed or not in PATH${NC}"
    echo "Please install PostgreSQL first:"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu: sudo apt install postgresql postgresql-contrib"
    exit 1
fi

# Check if we can connect to PostgreSQL
if ! pg_isready -h $DB_HOST -p $DB_PORT &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL server is not running${NC}"
    echo "Please start PostgreSQL service:"
    echo "  macOS: brew services start postgresql"
    echo "  Ubuntu: sudo systemctl start postgresql"
    exit 1
fi

echo -e "${GREEN}✅ PostgreSQL is running${NC}"

# Create database if it doesn't exist
echo -e "${YELLOW}🗄️  Creating database '$DB_NAME'...${NC}"
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${YELLOW}⚠️  Database '$DB_NAME' already exists${NC}"
    read -p "Do you want to drop and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🗑️  Dropping existing database...${NC}"
        dropdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME
        echo -e "${GREEN}✅ Database dropped${NC}"
    else
        echo -e "${BLUE}🔄 Using existing database${NC}"
    fi
fi

if ! psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME
    echo -e "${GREEN}✅ Database '$DB_NAME' created${NC}"
fi

# Run schema creation
echo -e "${YELLOW}📋 Creating database schema...${NC}"
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$(dirname "$0")/schema.sql" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database schema created successfully${NC}"
else
    echo -e "${RED}❌ Failed to create database schema${NC}"
    echo "Check the schema.sql file for errors"
    exit 1
fi

# Run seed data
echo -e "${YELLOW}📊 Inserting seed data...${NC}"
echo "This may take a few minutes to generate 10,000 transactions..."
if psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$(dirname "$0")/seed.sql"; then
    echo -e "${GREEN}✅ Seed data inserted successfully${NC}"
else
    echo -e "${RED}❌ Failed to insert seed data${NC}"
    exit 1
fi

# Verify the setup
echo -e "${YELLOW}🔍 Verifying database setup...${NC}"
TRANSACTION_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM transactions;" | xargs)
EXCEPTION_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM reconciliation_exceptions WHERE status = 'OPEN';" | xargs)
CONNECTOR_COUNT=$(psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM bank_connectors;" | xargs)

echo -e "${GREEN}📈 Database Statistics:${NC}"
echo "  • Transactions: $TRANSACTION_COUNT"
echo "  • Open Exceptions: $EXCEPTION_COUNT"
echo "  • Bank Connectors: $CONNECTOR_COUNT"

# Create .env file if it doesn't exist
ENV_FILE="$(dirname "$0")/../.env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚙️  Creating .env file...${NC}"
    cp "$(dirname "$0")/../.env.example" "$ENV_FILE"
    echo -e "${GREEN}✅ .env file created from example${NC}"
    echo -e "${BLUE}📝 Please review and update the .env file with your settings${NC}"
fi

# Final success message
echo ""
echo -e "${GREEN}🎉 Database setup completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review the .env file configuration"
echo "2. Install database dependencies: npm install pg drizzle-orm postgres"
echo "3. Start the development server: npm run dev"
echo ""
echo -e "${BLUE}Database Connection String:${NC}"
echo "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""
echo -e "${BLUE}Dashboard URL:${NC}"
echo "http://localhost:5174/ops/overview"