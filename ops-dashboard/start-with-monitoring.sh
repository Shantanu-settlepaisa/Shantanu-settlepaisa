#!/bin/bash

# Start SettlePaisa Dashboard with Full Monitoring
# This script ensures all services start and monitoring is active

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting SettlePaisa Dashboard with Full Monitoring..."
echo "=================================================="

# Function to check if a process is already running
check_running() {
    local process_name=$1
    if pgrep -f "$process_name" > /dev/null; then
        return 0  # Running
    else
        return 1  # Not running
    fi
}

# Kill any existing service monitor
if check_running "service-monitor.sh"; then
    echo "🛑 Stopping existing service monitor..."
    pkill -f "service-monitor.sh"
    sleep 2
fi

# Start the service monitor in the background
echo "🔍 Starting service monitor..."
nohup ./scripts/service-monitor.sh > /tmp/service-monitor-startup.log 2>&1 &
MONITOR_PID=$!

echo "✅ Service monitor started (PID: $MONITOR_PID)"
echo "📊 Monitoring dashboard at: http://localhost:5174"
echo "🔧 Recon API at: http://localhost:5103"
echo ""
echo "📋 Management Commands:"
echo "  Health Check: ./scripts/health-checker.sh"
echo "  View Monitor: tail -f /tmp/service-monitor.log"
echo "  Stop Monitor: pkill -f service-monitor.sh"
echo ""
echo "🎯 All services will auto-restart if they go down"
echo "💡 Use Ctrl+C to stop monitoring (services will continue running)"

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 15

# Run initial health check
echo "🏥 Running initial health check..."
if ./scripts/health-checker.sh; then
    echo ""
    echo "🎉 All services started successfully!"
    echo "🌐 Dashboard available at: http://localhost:5174/ops/recon"
else
    echo ""
    echo "⚠️ Some services may still be starting. Check logs for details."
fi

echo ""
echo "📺 Monitoring active - press Ctrl+C to stop monitoring"
echo "======================================================"

# Keep script running and show monitor status
trap 'echo "🛑 Stopping monitor..."; pkill -f service-monitor.sh; exit 0' SIGINT SIGTERM

# Show live status updates
while true; do
    if ! check_running "service-monitor.sh"; then
        echo "❌ Service monitor stopped unexpectedly! Restarting..."
        nohup ./scripts/service-monitor.sh > /tmp/service-monitor-restart.log 2>&1 &
    fi
    sleep 30
done