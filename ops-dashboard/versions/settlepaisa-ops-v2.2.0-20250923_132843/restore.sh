#!/bin/bash

echo "================================================"
echo "Restoring Version 2.2.0 - SFTP Ingestion"
echo "================================================"

# Stop running services
echo "Stopping services..."
pkill -f "node.*ingest.*server" 2>/dev/null
pkill -f vite 2>/dev/null

# Restore files
echo "Restoring files..."
cp -r services/api/ingest ../../services/api/ 2>/dev/null
cp -r src/features/ingest ../../src/features/ 2>/dev/null
cp -r src/components/Overview/* ../../src/components/Overview/ 2>/dev/null
cp -r db/migrations/* ../../db/migrations/ 2>/dev/null
cp VERSION ../../VERSION
cp *.sh ../../

echo "✅ Version 2.2.0 restored successfully!"
echo ""
echo "Next steps:"
echo "1. Run database migration: psql -d settlepaisa_ops < db/migrations/003_create_ingestion_tables.sql"
echo "2. Set FEATURE_BANK_SFTP_INGESTION=true in .env"
echo "3. Restart services: ./start-services.sh"
