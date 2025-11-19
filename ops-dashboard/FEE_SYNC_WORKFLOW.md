# SettlePaisa 2.0 - Merchant Fee Sync Workflow

## Overview

This document describes how to populate production database with all merchant data including:
- **Rolling Reserve configurations** (from SabPaisa V1 database)
- **Fee/Rate configurations** (from SabPaisa Admin API)

## Current Production State

As of Nov 19, 2025:
- Total merchants: **7,696** (synced from SabPaisa Admin API)
- Total fee configs: **424,676**
- Sync status: **COMPLETED** (99.85% success rate)
- Failed merchants: **12** (duplicate key errors, invalid data)

### Sync Execution Summary (Nov 19, 2025)

| Metric | Value |
|--------|-------|
| Total clients in Admin API | 7,799 |
| Successfully synced | 7,787 |
| Failed | 12 |
| Total fee configurations | 431,078 (sync report) |
| Fee configs in database | 424,676 (some were upserts) |

### Failed Merchants

- **Duplicate key errors (10)**: ARET1, BHUNC, DOONP1, DOONP2, HIND97, KALG1, LK227, MAHPS, OXPS1, SECT96
- **Null payment_mode (1)**: FURCA
- **API 404 (1)**: J.GE21

## Data Sources

| Data Type | Source | Sync Method | Target Table |
|-----------|--------|-------------|--------------|
| Rolling Reserve | SabPaisa V1 DB (3.108.237.99) | `sync-sabpaisa-configs.cjs` | `sp_v2_merchant_master` |
| Fee/Rate Config | Admin API (adminapiv2.sabpaisa.in) | `sync-fees.js` | `sp_v2_merchant_commission_config` |

## Prerequisites

### 1. SSH Tunnel to Production RDS

The production RDS is in a private VPC. Connect via EC2 bastion:

```bash
ssh -i ~/.ssh/settlepaisa-production-key.pem \
  -L 5433:settlepaisa-production.ccfgqux3aopk.ap-south-1.rds.amazonaws.com:5432 \
  ec2-user@15.207.207.203 -N -f
```

This creates a tunnel on `localhost:5433`.

### 2. Verify Tunnel

```bash
# Test connection
node -e "
const { Client } = require('pg');
const c = new Client({host:'localhost',port:5433,database:'settlepaisa_v2',user:'postgres',password:'vsF41bPJH77W6DPKoyQ1Mv8U',ssl:{rejectUnauthorized:false}});
c.connect().then(() => {console.log('Connected!'); c.end();});
"
```

## Sync Commands

### Option 1: Sync Fee Configurations (Admin API)

This syncs both merchant master and fee configurations:

```bash
cd /Users/shantanusingh/ops-dashboard/services/fee-sync

# Dry run (no database changes)
node sync-fees.js --dry-run

# Dry run for specific client
node sync-fees.js --dry-run --client NBSPLT

# Live sync (writes to database)
node sync-fees.js

# Sync specific clients
node sync-fees.js --client NBSPLT,QCCLI
```

### Option 2: Sync Merchant Master with Rolling Reserve (V1 DB)

This syncs merchant master with rolling reserve configurations:

```bash
cd /Users/shantanusingh/ops-dashboard/services/settlement-engine

# Run sync
node sync-sabpaisa-configs.cjs
```

## Recommended Sync Order

1. **First**: Run `sync-sabpaisa-configs.cjs` to populate merchant master with rolling reserve
2. **Then**: Run `sync-fees.js` to add fee/commission configurations

This ensures merchant records exist before fee configs are added.

## API Authentication

### COB Authentication Flow

The fee sync service authenticates via COB portal:

1. **Login**: `POST https://cobawsapi.sabpaisa.in/auth-service/auth/login`
2. **Verify**: `POST https://cobawsapi.sabpaisa.in/auth-service/auth/login-verify`

Credentials:
- Username: `Abh789@sp`
- Password: `Abhay@1234567`
- API Key: `2044c5ea-d46f-4e9e-8b7a-2aa73ce44e69`

Tokens are cached for 4 minutes (expire in ~5 minutes).

## Database Schema

### sp_v2_merchant_master

```sql
- merchant_id VARCHAR(50) PRIMARY KEY
- merchant_name VARCHAR(255)
- rolling_reserve_enabled BOOLEAN DEFAULT false
- rolling_reserve_percentage DECIMAL(5,2) DEFAULT 0.00
- reserve_hold_days INTEGER DEFAULT 0
- synced_at TIMESTAMP
```

### sp_v2_merchant_commission_config

```sql
- id UUID PRIMARY KEY
- merchant_id VARCHAR(50)
- payment_mode VARCHAR(50)
- payment_mode_id VARCHAR(50)
- bank_code VARCHAR(50)
- bank_name VARCHAR(255)
- commission_value DECIMAL(10,4)
- commission_type VARCHAR(20)  -- PERCENTAGE, FLAT
- gst_percentage DECIMAL(5,2)
- slab_floor DECIMAL(10,2)
- slab_ceiling DECIMAL(10,2)
- synced_at TIMESTAMP

UNIQUE (merchant_id, payment_mode, bank_code, slab_floor)
```

## Monitoring & Logs

### Sync Logs

Check `sp_v2_sync_log` for sync history:

```sql
SELECT
  sync_type,
  status,
  records_synced,
  started_at,
  completed_at
FROM sp_v2_sync_log
ORDER BY started_at DESC
LIMIT 10;
```

### Verification Queries

```sql
-- Total merchants
SELECT COUNT(*) FROM sp_v2_merchant_master;

-- Merchants with rolling reserve
SELECT COUNT(*) FROM sp_v2_merchant_master
WHERE rolling_reserve_enabled = true;

-- Total fee configs
SELECT COUNT(*) FROM sp_v2_merchant_commission_config;

-- Fee configs by payment mode
SELECT payment_mode, COUNT(*)
FROM sp_v2_merchant_commission_config
GROUP BY payment_mode
ORDER BY COUNT(*) DESC;
```

## Deployment on EC2 (Recommended)

Running from EC2 directly is **20x faster** than using SSH tunnel from local machine.

### One-time Setup

```bash
# SSH to EC2
ssh -i ~/.ssh/settlepaisa-production-key.pem ec2-user@15.207.207.203

# Create fee-sync directory
mkdir -p /home/ec2-user/fee-sync
cd /home/ec2-user/fee-sync

# Install dependencies
npm init -y
npm install pg node-fetch
```

### Deploy Sync Script

```bash
# From local machine
scp -i ~/.ssh/settlepaisa-production-key.pem \
  /Users/shantanusingh/ops-dashboard/services/fee-sync/sync-fees.js \
  ec2-user@15.207.207.203:/home/ec2-user/fee-sync/
```

### Run Sync on EC2

```bash
# SSH to EC2
ssh -i ~/.ssh/settlepaisa-production-key.pem ec2-user@15.207.207.203

# Run sync with direct RDS connection
cd /home/ec2-user/fee-sync
DB_HOST=settlepaisa-production.ccfgqux3aopk.ap-south-1.rds.amazonaws.com \
DB_PORT=5432 \
nohup node sync-fees.js > sync-output.log 2>&1 &

# Check progress
tail -f sync-output.log
```

### Performance Comparison

| Method | Time for 7,799 clients | Batches/min |
|--------|------------------------|-------------|
| Local (SSH tunnel) | ~6-7 hours | ~0.4 |
| EC2 (direct RDS) | ~17 minutes | ~8.7 |

## Troubleshooting

### Connection Timeout

If you get `ETIMEDOUT`, ensure:
1. SSH tunnel is active
2. Using `localhost:5433` (not RDS endpoint directly)

### Authentication Errors

If COB login fails:
1. Check Origin/Referer headers are set
2. Verify credentials haven't expired
3. Check if API key is valid

### Duplicate Key Errors

The sync uses upserts (ON CONFLICT). If you see unique constraint violations:
1. Verify migration 039 was run
2. Check constraint exists: `sp_v2_merchant_commission_config_unique_key`

## Files Reference

| File | Purpose |
|------|---------|
| `/services/fee-sync/sync-fees.js` | Main fee sync from Admin API |
| `/services/settlement-engine/sync-sabpaisa-configs.cjs` | Merchant master sync from V1 DB |
| `/db/migrations/039_add_commission_config_unique_constraint.sql` | Unique constraint for upserts |
| `/query-rolling-reserve-production.cjs` | Production data analysis script |

## Next Steps

1. Run full sync to populate all 7,799 merchants
2. Set up scheduled sync (daily at 2 AM)
3. Add monitoring alerts for sync failures
4. Consider incremental sync for large datasets
