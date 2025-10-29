#!/bin/bash

# Run migration 023 on staging RDS database
# Connects directly to RDS from local machine

echo "🚀 Running Migration 023: Complete V1 to V2 Transaction Migration"
echo "Target: settlepaisa-v2.c6p8wl0bxygl.ap-south-1.rds.amazonaws.com"
echo ""

# Use Docker PostgreSQL client to run migration
docker run --rm \
  -v "$(pwd)/db/migrations/023_complete_v1_to_v2_migration.sql:/migration.sql:ro" \
  postgres:13 \
  psql \
  -h settlepaisa-v2.c6p8wl0bxygl.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 \
  -f /migration.sql

echo ""
echo "✅ Migration 023 execution completed"
