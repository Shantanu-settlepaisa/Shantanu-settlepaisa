#!/bin/bash

# SettlePaisa 2.0 Dashboard Startup Script
# This ensures the dashboard always runs on port 5173

echo "========================================="
echo "  SettlePaisa 2.0 Merchant Dashboard"
echo "========================================="
echo ""
echo "Starting dashboard on port 5173..."
echo ""

# Kill any existing processes on port 5173
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Kill any existing vite processes
pkill -f vite 2>/dev/null

# Clear npm cache if needed
npm cache clean --force 2>/dev/null

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the development server
echo "Starting development server..."
echo ""
echo "Dashboard will be available at:"
echo "  • Merchant Settlements: http://localhost:5173/merchant/settlements"
echo "  • Merchant Reports:     http://localhost:5173/merchant/reports"
echo "  • Merchant Dashboard:   http://localhost:5173/merchant/dashboard"
echo "  • Ops Dashboard:        http://localhost:5173/ops/overview"
echo ""
echo "Press Ctrl+C to stop the server"
echo "========================================="

npm run dev