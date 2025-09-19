#!/bin/bash

# Backup Script for Version 2.1.0 - Settlement Pipeline Fix
# Created: September 18, 2025
# Version: 2.1.0

VERSION="v2.1.0"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="versions/${VERSION}_${TIMESTAMP}"

echo "🔵 Creating backup for Version 2.1.0 - Settlement Pipeline Fix"
echo "📁 Backup directory: $BACKUP_DIR"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup critical source files
echo "📦 Backing up source files..."

# Backend files
mkdir -p "$BACKUP_DIR/services/overview-api"
cp services/overview-api/index.js "$BACKUP_DIR/services/overview-api/"
cp services/overview-api/package.json "$BACKUP_DIR/services/overview-api/"
cp services/overview-api/analytics-endpoints.js "$BACKUP_DIR/services/overview-api/" 2>/dev/null || true
cp services/overview-api/analytics-v3-endpoints.js "$BACKUP_DIR/services/overview-api/" 2>/dev/null || true

# Frontend components
mkdir -p "$BACKUP_DIR/src/components"
cp src/components/SettlementPipeline.tsx "$BACKUP_DIR/src/components/"
cp src/components/ManualUploadEnhanced.tsx "$BACKUP_DIR/src/components/"
cp src/components/ConnectorsAutomated.tsx "$BACKUP_DIR/src/components/"

# Frontend pages
mkdir -p "$BACKUP_DIR/src/pages"
cp src/pages/Overview.tsx "$BACKUP_DIR/src/pages/"

mkdir -p "$BACKUP_DIR/src/pages/ops"
cp src/pages/ops/OverviewConsistent.tsx "$BACKUP_DIR/src/pages/ops/" 2>/dev/null || true

# Hooks
mkdir -p "$BACKUP_DIR/src/hooks"
cp src/hooks/opsOverview.ts "$BACKUP_DIR/src/hooks/"

# Router
cp src/router.tsx "$BACKUP_DIR/src/"

# Configuration files
cp package.json "$BACKUP_DIR/"
cp tsconfig.json "$BACKUP_DIR/"
cp vite.config.ts "$BACKUP_DIR/"
cp tailwind.config.js "$BACKUP_DIR/"

# Documentation
cp VERSION_2.1.0_SETTLEMENT_PIPELINE.md "$BACKUP_DIR/"
cp CLAUDE.md "$BACKUP_DIR/" 2>/dev/null || true

# Create manifest file
cat > "$BACKUP_DIR/manifest.json" << EOF
{
  "version": "2.1.0",
  "name": "Settlement Pipeline Fix",
  "timestamp": "${TIMESTAMP}",
  "description": "Fixed settlement pipeline data display, BigInt conversion error, and added info icon",
  "changes": [
    "Fixed pipeline numbers to add up correctly (2250 = 237+575+1338+100)",
    "Fixed BigInt conversion error in /api/pipeline/summary",
    "Added info icon with settlement lifecycle tooltip",
    "Fixed tab badge counts in Manual Upload and Connectors"
  ],
  "services": {
    "frontend": "5174",
    "overview-api": "5105",
    "pg-api": "5101",
    "bank-api": "5102",
    "recon-api": "5103"
  }
}
EOF

# Create state snapshot
echo "📸 Creating state snapshot..."
cat > "$BACKUP_DIR/state-snapshot.json" << EOF
{
  "git_branch": "$(git branch --show-current 2>/dev/null || echo 'main')",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'uncommitted')",
  "node_version": "$(node --version)",
  "npm_version": "$(npm --version)",
  "timestamp": "${TIMESTAMP}",
  "pipeline_data": {
    "total_captured": 2250,
    "in_settlement": 237,
    "sent_to_bank": 575,
    "credited": 1338,
    "unsettled": 100
  }
}
EOF

echo "✅ Backup completed: $BACKUP_DIR"
echo "📋 Manifest created: $BACKUP_DIR/manifest.json"
echo "💾 Total files backed up: $(find $BACKUP_DIR -type f | wc -l | tr -d ' ')"
echo ""
echo "To restore this version, run: ./rollback-v2.1.0.sh $BACKUP_DIR"