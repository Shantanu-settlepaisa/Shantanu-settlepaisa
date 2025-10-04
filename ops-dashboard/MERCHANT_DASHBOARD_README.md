# Merchant Dashboard - Quick Start Guide

## 🚀 One-Command Start

```bash
./start-merchant-dashboard.sh
```

This will:
- ✅ Check database connection
- ✅ Start Merchant API (port 8080)
- ✅ Start Frontend (port 5173)
- ✅ Verify all connections
- ✅ Show you the dashboard URL

**Access:** http://localhost:5173/merchant/settlements

---

## 🏥 Check Health Anytime

```bash
./health-check.sh
```

Shows status of:
- Database (PostgreSQL)
- Merchant API
- Frontend
- Data availability

---

## 🛑 Stop Everything

```bash
./stop-merchant-dashboard.sh
```

Stops all merchant dashboard services cleanly.

---

## 🐕 Auto-Restart on Crash (Watchdog)

Run the watchdog in the background to automatically restart services if they crash:

```bash
# Start watchdog
./watchdog.sh &

# The watchdog will:
# - Check services every 30 seconds
# - Auto-restart if they crash
# - Log all restarts with timestamps

# To stop watchdog
pkill -f watchdog.sh
```

---

## 📊 What You Get

### Dashboard Tiles
- **Current Balance** - Unsettled reconciled transactions
- **Settlement Due Today** - Next auto-settlement amount
- **Previous Settlement** - Last completed settlement
- **Upcoming Settlement** - Next settlement date

### Features
- View all settlements
- Click settlement → See breakup (Amount, Fees, Tax)
- Click "View Transactions" → See all transactions in settlement
- Export transactions to CSV

---

## 🔧 Manual Commands

### Start Merchant API Only
```bash
cd services/merchant-api
USE_DB=true \
PG_URL="postgresql://postgres:settlepaisa123@localhost:5433/settlepaisa_v2" \
DEFAULT_MERCHANT_ID="MERCH001" \
node index.js
```

### Start Frontend Only
```bash
npm run dev -- --port 5173
```

### Check Logs
```bash
# Merchant API logs
tail -f /tmp/merchant-api.log

# Frontend logs
tail -f /tmp/merchant-frontend.log
```

---

## 🐛 Troubleshooting

### Problem: "No settlements found"

**Solution:**
```bash
# Check database
docker exec settlepaisa_v2_db psql -U postgres -d settlepaisa_v2 -c "
  SELECT COUNT(*) FROM sp_v2_settlement_batches WHERE merchant_id = 'MERCH001'
"

# If 0, wrong merchant ID or database
```

### Problem: "API not responding"

**Solution:**
```bash
# Check if API is running
lsof -ti:8080

# If not, restart
./start-merchant-dashboard.sh

# Check logs for errors
tail -50 /tmp/merchant-api.log
```

### Problem: "Frontend shows errors"

**Solution:**
```bash
# Run health check first
./health-check.sh

# If API is down, restart everything
./stop-merchant-dashboard.sh
./start-merchant-dashboard.sh
```

### Problem: "Database connection failed"

**Solution:**
```bash
# Check Docker container
docker ps | grep settlepaisa_v2_db

# If not running, start it
docker start settlepaisa_v2_db

# Restart dashboard
./start-merchant-dashboard.sh
```

---

## 📝 Environment Configuration

The scripts use these default values:

| Variable | Value | Description |
|----------|-------|-------------|
| `MERCHANT_API_PORT` | 8080 | Merchant API port |
| `FRONTEND_PORT` | 5173 | Frontend dev server port |
| `DB_PORT` | 5433 | PostgreSQL database port |
| `DB_NAME` | settlepaisa_v2 | Database name |
| `MERCHANT_ID` | MERCH001 | Default merchant |

To change, edit the scripts directly or set environment variables.

---

## 🎯 Quick Commands Reference

| Task | Command |
|------|---------|
| Start everything | `./start-merchant-dashboard.sh` |
| Stop everything | `./stop-merchant-dashboard.sh` |
| Check health | `./health-check.sh` |
| Enable watchdog | `./watchdog.sh &` |
| View API logs | `tail -f /tmp/merchant-api.log` |
| View frontend logs | `tail -f /tmp/merchant-frontend.log` |
| Access dashboard | http://localhost:5173/merchant/settlements |
| Check API health | http://localhost:8080/health/live |

---

## 🔄 Deployment

For production/staging deployment, see:
- `DEPLOYMENT_GUIDE.md` - Full deployment instructions
- `VERSION_2.22.0_CONTEXT.md` - Technical documentation
- `ROLLBACK_GUIDE.md` - How to rollback versions

---

## 💡 Tips

1. **Always run health-check after starting**
   ```bash
   ./start-merchant-dashboard.sh && ./health-check.sh
   ```

2. **Use watchdog for long-running sessions**
   ```bash
   ./watchdog.sh &
   # Dashboard stays up even if services crash
   ```

3. **Check logs if something's wrong**
   ```bash
   tail -f /tmp/merchant-api.log /tmp/merchant-frontend.log
   ```

4. **Clean restart if things are broken**
   ```bash
   ./stop-merchant-dashboard.sh
   sleep 2
   ./start-merchant-dashboard.sh
   ```

---

**Version:** 2.22.0  
**Last Updated:** October 5, 2025  
**Maintained By:** Claude Code
