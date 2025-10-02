#!/bin/bash

# Backup Script for Version 2.2.0 - SFTP Ingestion Feature
# This script creates a complete backup of the current version

VERSION="2.2.0"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="settlepaisa-ops-v${VERSION}-${TIMESTAMP}"
BACKUP_DIR="versions/${BACKUP_NAME}"

echo "================================================"
echo "Creating Backup for Version ${VERSION}"
echo "================================================"
echo ""

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Files and directories to backup
echo "📁 Creating backup directory: ${BACKUP_DIR}"

# 1. Backup SFTP Ingestion Service
echo "📦 Backing up SFTP Ingestion Service..."
mkdir -p "${BACKUP_DIR}/services/api"
cp -r services/api/ingest "${BACKUP_DIR}/services/api/" 2>/dev/null || echo "  ⚠️  Ingestion service not found"

# 2. Backup Frontend Components
echo "📦 Backing up Frontend Components..."
mkdir -p "${BACKUP_DIR}/src/features"
cp -r src/features/ingest "${BACKUP_DIR}/src/features/" 2>/dev/null || echo "  ⚠️  Frontend components not found"

# 3. Backup Modified Components
echo "📦 Backing up Modified Components..."
mkdir -p "${BACKUP_DIR}/src/components/Overview"
cp src/components/Overview/ConnectorHealthMini.tsx "${BACKUP_DIR}/src/components/Overview/" 2>/dev/null
cp src/pages/Overview.tsx "${BACKUP_DIR}/src/pages/" 2>/dev/null

# 4. Backup Database Migrations
echo "📦 Backing up Database Migrations..."
mkdir -p "${BACKUP_DIR}/db/migrations"
cp db/migrations/003_create_ingestion_tables.sql "${BACKUP_DIR}/db/migrations/" 2>/dev/null

# 5. Backup Configuration Files
echo "📦 Backing up Configuration Files..."
cp .env.development "${BACKUP_DIR}/.env.development.backup" 2>/dev/null
cp VERSION "${BACKUP_DIR}/VERSION" 2>/dev/null
cp start-services.sh "${BACKUP_DIR}/start-services.sh" 2>/dev/null

# 6. Backup Scripts and Documentation
echo "📦 Backing up Scripts and Documentation..."
cp start-ingestion-demo.sh "${BACKUP_DIR}/" 2>/dev/null
cp test-ingestion.sh "${BACKUP_DIR}/" 2>/dev/null
cp SFTP_INGESTION_README.md "${BACKUP_DIR}/" 2>/dev/null
cp VERSION_2.2.0_SFTP_INGESTION.md "${BACKUP_DIR}/" 2>/dev/null

# 7. Create version manifest
echo "📝 Creating version manifest..."
cat > "${BACKUP_DIR}/manifest.json" << EOF
{
  "version": "${VERSION}",
  "timestamp": "${TIMESTAMP}",
  "features": [
    "SFTP Bank File Ingestion Pipeline",
    "Connector Health Integration",
    "Expected vs Received Tracking",
    "Admin-only APIs",
    "Feature Flag Control"
  ],
  "files_count": $(find "${BACKUP_DIR}" -type f | wc -l),
  "backup_date": "$(date)",
  "previous_version": "2.1.1"
}
EOF

# 8. Create restoration script
echo "📝 Creating restoration script..."
cat > "${BACKUP_DIR}/restore.sh" << 'RESTORE_SCRIPT'
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
RESTORE_SCRIPT

chmod +x "${BACKUP_DIR}/restore.sh"

# 9. Create feature state snapshot
echo "📸 Creating feature state snapshot..."
cat > "${BACKUP_DIR}/feature_state.json" << EOF
{
  "sftp_ingestion": {
    "enabled": $(grep "FEATURE_BANK_SFTP_INGESTION" .env.development | cut -d'=' -f2 || echo "false"),
    "api_port": 5106,
    "poll_interval": 60000,
    "staging_dir": "/tmp/sftp-staging"
  },
  "configured_banks": ["AXIS", "HDFC", "ICICI"],
  "database_tables": [
    "ingested_files",
    "file_expectations", 
    "connector_health",
    "bank_ingest_configs",
    "ingest_alerts"
  ]
}
EOF

# Calculate backup size
BACKUP_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)

echo ""
echo "================================================"
echo "✅ Backup Complete!"
echo "================================================"
echo "📁 Location: ${BACKUP_DIR}"
echo "📊 Size: ${BACKUP_SIZE}"
echo "📝 Files backed up: $(find "${BACKUP_DIR}" -type f | wc -l)"
echo ""
echo "To restore this version, run:"
echo "  cd ${BACKUP_DIR} && ./restore.sh"
echo "================================================"