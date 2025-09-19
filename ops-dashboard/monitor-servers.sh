#!/bin/bash

# Monitor script for SettlePaisa Merchant Dashboard
# Ensures frontend (port 5173) and backend API (port 8080) are always running

while true; do
    # Check if frontend is running on port 5173
    if ! lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null ; then
        echo "[$(date)] Frontend not running on port 5173, starting..."
        cd /Users/shantanusingh/ops-dashboard
        npm run dev -- --port 5173 > /tmp/vite-5173.log 2>&1 &
        sleep 5
    fi
    
    # Check if backend API is running on port 8080
    if ! lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null ; then
        echo "[$(date)] Backend API not running on port 8080, starting..."
        cd /Users/shantanusingh/ops-dashboard/services/merchant-api
        npm start > /tmp/merchant-api.log 2>&1 &
        sleep 5
    fi
    
    # Check every 30 seconds
    sleep 30
done