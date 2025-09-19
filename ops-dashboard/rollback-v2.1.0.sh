#!/bin/bash

# Rollback Script for Version 2.1.0
# Created: 2025-09-17

echo "============================================"
echo "Rollback to Version 2.1.0"
echo "============================================"

# Check if running from ops-dashboard directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo "Error: This script must be run from the ops-dashboard directory"
    exit 1
fi

echo "Current directory: $(pwd)"
echo ""

# Stop all services
echo "Stopping all services..."
pkill -f "vite.*5174" 2>/dev/null
pkill -f "node.*5101" 2>/dev/null
pkill -f "node.*5102" 2>/dev/null
pkill -f "node.*5103" 2>/dev/null
pkill -f "node.*5105" 2>/dev/null
sleep 2

# Git rollback
echo "Rolling back to commit 17718fc (Version 2.1.0)..."
git stash push -m "Pre-rollback changes $(date +%Y%m%d_%H%M%S)"
git checkout 17718fc

if [ $? -ne 0 ]; then
    echo "Error: Failed to checkout version 2.1.0"
    echo "Attempting to restore from stash..."
    git stash pop
    exit 1
fi

echo ""
echo "Reinstalling dependencies..."
npm install

echo ""
echo "Starting backend services..."
./start-services.sh

sleep 3

echo ""
echo "Starting frontend..."
npm run dev -- --port 5174 > /tmp/vite.log 2>&1 &

sleep 5

# Verify services
echo ""
echo "Verifying services..."
echo -n "PG API (5101): "
curl -s http://localhost:5101/health > /dev/null 2>&1 && echo "✓ Running" || echo "✗ Down"

echo -n "Bank API (5102): "
curl -s http://localhost:5102/health > /dev/null 2>&1 && echo "✓ Running" || echo "✗ Down"

echo -n "Recon API (5103): "
curl -s http://localhost:5103/api/health > /dev/null 2>&1 && echo "✓ Running" || echo "✗ Down"

echo -n "Overview API (5105): "
curl -s http://localhost:5105/api/health > /dev/null 2>&1 && echo "✓ Running" || echo "✗ Down"

echo -n "Frontend (5174): "
curl -s http://localhost:5174 > /dev/null 2>&1 && echo "✓ Running" || echo "✗ Down"

echo ""
echo "============================================"
echo "Rollback Complete!"
echo "============================================"
echo ""
echo "Version 2.1.0 Features:"
echo "- Manual Upload: 29 txns (16 matched, 9 unmatched PG, 4 unmatched bank)"
echo "- Connectors: 800 txns (750 matched, 25 unmatched PG, 20 unmatched bank, 5 exceptions)"
echo "- Tab badges display correct counts"
echo "- Separate Unmatched PG and Unmatched Bank tabs"
echo ""
echo "Access dashboard at: http://localhost:5174/ops/overview"
echo ""
echo "To return to latest version, run:"
echo "  git checkout main"
echo "  npm install"
echo "  ./start-services.sh"
echo "  npm run dev -- --port 5174"