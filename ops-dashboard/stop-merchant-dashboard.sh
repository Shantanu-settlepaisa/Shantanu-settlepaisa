#!/bin/bash

# SettlePaisa Merchant Dashboard - Stop Script

echo "🛑 Stopping SettlePaisa Merchant Dashboard..."

# Kill merchant API
echo "Stopping Merchant API (port 8080)..."
lsof -ti:8080 | xargs kill -9 2>/dev/null && echo "✓ Merchant API stopped" || echo "No Merchant API running"

# Kill frontend
echo "Stopping Frontend (port 5173)..."
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "✓ Frontend stopped" || echo "No Frontend running"

echo ""
echo "✅ All services stopped"
