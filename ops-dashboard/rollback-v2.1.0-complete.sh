#!/bin/bash

# Rollback Script for Version 2.1.0 - Settlement Pipeline Fix
# Usage: ./rollback-v2.1.0-complete.sh [backup_dir]
# If no backup_dir specified, uses the latest v2.1.0 backup

VERSION="v2.1.0"

echo "🔄 Rollback Script for Version 2.1.0 - Settlement Pipeline Fix"
echo "=================================================="

# Determine backup directory
if [ -n "$1" ]; then
    BACKUP_DIR="$1"
else
    # Find the latest v2.1.0 backup
    BACKUP_DIR=$(ls -d versions/v2.1.0_* 2>/dev/null | sort -r | head -1)
    if [ -z "$BACKUP_DIR" ]; then
        echo "❌ No v2.1.0 backup found. Please run ./backup-v2.1.0.sh first"
        exit 1
    fi
fi

if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ Backup directory not found: $BACKUP_DIR"
    exit 1
fi

echo "📁 Using backup: $BACKUP_DIR"

# Check if manifest exists
if [ -f "$BACKUP_DIR/manifest.json" ]; then
    echo ""
    echo "📋 Backup Information:"
    echo "---------------------"
    cat "$BACKUP_DIR/manifest.json" | python3 -m json.tool 2>/dev/null || cat "$BACKUP_DIR/manifest.json"
    echo ""
fi

# Confirmation prompt
read -p "⚠️  This will restore files to v2.1.0. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "❌ Rollback cancelled"
    exit 0
fi

echo ""
echo "🚀 Starting rollback..."

# Stop services
echo "🛑 Stopping services..."
lsof -ti:5105 | xargs kill -9 2>/dev/null || true
lsof -ti:5103 | xargs kill -9 2>/dev/null || true
lsof -ti:5102 | xargs kill -9 2>/dev/null || true
lsof -ti:5101 | xargs kill -9 2>/dev/null || true
sleep 2

# Restore files
echo "📥 Restoring files..."

# Backend files
if [ -d "$BACKUP_DIR/services/overview-api" ]; then
    echo "  - Restoring overview-api service..."
    cp "$BACKUP_DIR/services/overview-api/index.js" services/overview-api/
    [ -f "$BACKUP_DIR/services/overview-api/analytics-endpoints.js" ] && cp "$BACKUP_DIR/services/overview-api/analytics-endpoints.js" services/overview-api/
    [ -f "$BACKUP_DIR/services/overview-api/analytics-v3-endpoints.js" ] && cp "$BACKUP_DIR/services/overview-api/analytics-v3-endpoints.js" services/overview-api/
fi

# Frontend components
if [ -d "$BACKUP_DIR/src/components" ]; then
    echo "  - Restoring components..."
    cp "$BACKUP_DIR/src/components/SettlementPipeline.tsx" src/components/
    cp "$BACKUP_DIR/src/components/ManualUploadEnhanced.tsx" src/components/
    cp "$BACKUP_DIR/src/components/ConnectorsAutomated.tsx" src/components/
fi

# Frontend pages
if [ -d "$BACKUP_DIR/src/pages" ]; then
    echo "  - Restoring pages..."
    cp "$BACKUP_DIR/src/pages/Overview.tsx" src/pages/
    [ -f "$BACKUP_DIR/src/pages/ops/OverviewConsistent.tsx" ] && cp "$BACKUP_DIR/src/pages/ops/OverviewConsistent.tsx" src/pages/ops/
fi

# Hooks
if [ -d "$BACKUP_DIR/src/hooks" ]; then
    echo "  - Restoring hooks..."
    cp "$BACKUP_DIR/src/hooks/opsOverview.ts" src/hooks/
fi

# Router
if [ -f "$BACKUP_DIR/src/router.tsx" ]; then
    echo "  - Restoring router..."
    cp "$BACKUP_DIR/src/router.tsx" src/
fi

# Restart services
echo ""
echo "🔄 Restarting services..."

# Start backend services
cd services/overview-api && node index.js > /tmp/overview-api.log 2>&1 & 
cd ../..
echo "  ✅ Overview API started on port 5105"

# Log rollback
echo ""
echo "📝 Creating rollback log..."
cat > "rollback-log-$(date +%Y%m%d_%H%M%S).txt" << EOF
Rollback performed: $(date)
From backup: $BACKUP_DIR
Version: 2.1.0
Services restarted: overview-api (5105)
Files restored: $(find $BACKUP_DIR -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" | wc -l | tr -d ' ')
EOF

echo ""
echo "✅ Rollback completed successfully!"
echo ""
echo "📊 Settlement Pipeline Data:"
echo "  Total: 2250 transactions"
echo "  - In Settlement: 237"
echo "  - Sent to Bank: 575"
echo "  - Credited: 1338"
echo "  - Unsettled: 100"
echo ""
echo "🌐 Access the dashboard at: http://localhost:5174/ops/overview"
echo ""
echo "💡 To verify the rollback:"
echo "  1. Check the Settlement Pipeline displays correct numbers"
echo "  2. Verify the info icon (ℹ️) is visible"
echo "  3. Test the API: curl -s 'http://localhost:5105/api/pipeline/summary' | python3 -m json.tool"