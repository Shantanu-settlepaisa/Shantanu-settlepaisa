#!/bin/bash

# Service Monitor Script
# Ensures all services stay running

while true; do
    # Check and restart frontend if needed
    if ! lsof -i :5174 | grep -q LISTEN; then
        echo "[$(date)] Frontend down, restarting..."
        cd /Users/shantanusingh/ops-dashboard
        npm run dev -- --port 5174 > /tmp/vite.log 2>&1 &
    fi
    
    # Check and restart PG API if needed
    if ! lsof -i :5101 | grep -q LISTEN; then
        echo "[$(date)] PG API down, restarting..."
        cd /Users/shantanusingh/ops-dashboard/services/mock-pg-api
        node index.js > /tmp/pg-api.log 2>&1 &
    fi
    
    # Check and restart Bank API if needed
    if ! lsof -i :5102 | grep -q LISTEN; then
        echo "[$(date)] Bank API down, restarting..."
        cd /Users/shantanusingh/ops-dashboard/services/mock-bank-api
        node index.js > /tmp/bank-api.log 2>&1 &
    fi
    
    # Check and restart Recon API if needed
    if ! lsof -i :5103 | grep -q LISTEN; then
        echo "[$(date)] Recon API down, restarting..."
        cd /Users/shantanusingh/ops-dashboard/services/recon-api
        node index.js > /tmp/recon-api.log 2>&1 &
    fi
    
    # Check and restart Overview API if needed
    if ! lsof -i :5105 | grep -q LISTEN; then
        echo "[$(date)] Overview API down, restarting..."
        cd /Users/shantanusingh/ops-dashboard/services/overview-api
        node index.js > /tmp/overview-api.log 2>&1 &
    fi
    
    sleep 30
done