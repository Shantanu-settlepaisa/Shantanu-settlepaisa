#!/bin/bash

# PostgreSQL Database Setup Script
# For Settlement Pipeline Implementation

echo "================================"
echo "Settlement Pipeline DB Setup"
echo "================================"

# Database configuration
DB_NAME="ops_dashboard"
DB_USER="ops_user"
DB_PASSWORD="ops_pass_2024"
DB_HOST="localhost"
DB_PORT="5432"

# Check if PostgreSQL is running
if ! pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running on $DB_HOST:$DB_PORT"
    echo "Please start PostgreSQL first."
    exit 1
fi

echo "✅ PostgreSQL is running"

# Create database and user
psql -h $DB_HOST -p $DB_PORT -U postgres <<EOF
-- Create user if not exists
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '$DB_USER') THEN
    CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
  END IF;
END
\$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\\gexec

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

echo "✅ Database and user created"

# Export connection string
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
echo "DATABASE_URL=$DATABASE_URL" > .env.db

echo "================================"
echo "Setup complete!"
echo "Connection string saved to .env.db"
echo "================================"