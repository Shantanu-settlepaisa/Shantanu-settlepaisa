# SettlePaisa V2 Merchant Dashboard Setup Guide

## Overview
The Merchant Dashboard has been successfully integrated with SettlePaisa V2 database schema. This guide covers setup, deployment, and example responses.

## Architecture
- **Frontend**: React + TypeScript on port 5173
- **Backend**: Node.js Express API on port 8080  
- **Database**: PostgreSQL SettlePaisa V2 schema
- **Merchant ID**: `11111111-1111-1111-1111-111111111111` (demo merchant)

## Quick Start

### 1. Start Services
```bash
# Backend (from /ops-dashboard/services/merchant-api/)
npm start

# Frontend (from /ops-dashboard/)
npm run dev -- --port 5173
```

### 2. Access Dashboard
- **Merchant Dashboard**: http://localhost:5173/merchant/settlements
- **API Base**: http://localhost:8080

## Database Setup

### Environment Configuration
```bash
# services/merchant-api/.env
APP_CONTEXT=merchant
USE_DB=true
PG_URL=postgresql://postgres:postgres@localhost:5432/settlepaisa_v2
TIMEZONE=Asia/Kolkata
DEFAULT_MERCHANT_ID=11111111-1111-1111-1111-111111111111
PORT=8080
```

### Seed Demo Data
```bash
# Run the seeding script (creates 30 days of demo data)
psql -h localhost -U postgres -d settlepaisa_v2 -f infra/sql/seed/merchant_demo_v2.sql
```

## API Endpoints & Example Responses

### 1. Dashboard Summary
**GET** `/v1/merchant/dashboard/summary`

```json
{
  "currentBalance": {
    "amount": 4929200,
    "currency": "INR"
  },
  "lastSettlement": {
    "date": "2025-01-03T06:00:00.000Z",
    "amount": 25873400,
    "status": "SETTLED",
    "utr": "HDFC25010412000001"
  },
  "nextSettlementDue": {
    "date": "2025-01-04T08:30:00.000Z",
    "estimatedAmount": 0,
    "status": "NO_PENDING_AMOUNT"
  },
  "pendingAmount": {
    "amount": 0,
    "currency": "INR"
  }
}
```

### 2. Settlements List
**GET** `/v1/merchant/settlements?limit=10&offset=0`

```json
{
  "settlements": [
    {
      "id": "b47c8f2e-aa11-4c89-9a63-f2e8d4567890",
      "type": "scheduled",
      "createdAt": "2025-01-03T02:00:00.000Z",
      "status": "SETTLED",
      "amount": 25873400,
      "bankUtr": "HDFC25010312000001",
      "bankStatus": "completed"
    },
    {
      "id": "a36b7e1d-9900-3b78-8a52-e1d7c3456789",
      "type": "instant",
      "createdAt": "2025-01-03T10:30:00.000Z",
      "status": "SETTLED",
      "amount": 4929200,
      "bankUtr": "INST1704182200",
      "bankStatus": "completed"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 12,
    "totalItems": 32,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 3. Settlement Timeline
**GET** `/v1/merchant/settlements/:id/timeline`

```json
{
  "settlement": {
    "id": "b47c8f2e-aa11-4c89-9a63-f2e8d4567890",
    "status": "SETTLED",
    "amount": 25873400
  },
  "timeline": [
    {
      "event": "INITIATED",
      "timestamp": "2025-01-03T02:00:00.000Z",
      "description": "Settlement request initiated",
      "status": "completed"
    },
    {
      "event": "BATCHED",
      "timestamp": "2025-01-03T02:01:00.000Z",
      "description": "Added to settlement batch",
      "status": "completed"
    },
    {
      "event": "BANK_FILE_RECEIVED",
      "timestamp": "2025-01-03T06:00:00.000Z",
      "description": "Bank confirmation file received",
      "status": "completed"
    },
    {
      "event": "UTR_ASSIGNED",
      "timestamp": "2025-01-03T06:30:00.000Z",
      "description": "Bank UTR: HDFC25010312000001",
      "status": "completed"
    },
    {
      "event": "SETTLED",
      "timestamp": "2025-01-03T07:00:00.000Z",
      "description": "Amount credited to bank account",
      "status": "completed",
      "metadata": {
        "bank": "HDFC Bank",
        "account": "****3456"
      }
    }
  ]
}
```

### 4. Settlement Schedule
**GET** `/v1/merchant/settlement-schedule`

```json
{
  "frequency": "daily",
  "cutoffTime": {
    "hour": 14,
    "minute": 0,
    "timezone": "Asia/Kolkata",
    "display": "2:00 PM IST"
  },
  "nextCutoff": "2025-01-04T08:30:00.000Z",
  "settlementCycle": "T+1",
  "minAmount": {
    "amount": 100000,
    "currency": "INR"
  },
  "autoSettle": true
}
```

### 5. Instant Settlement
**POST** `/v1/merchant/instant-settlement`

Request:
```json
{
  "amount": 5000000,
  "bankAccountId": "primary"
}
```

Response:
```json
{
  "success": true,
  "settlement": {
    "id": "inst-c47d9f3e-bb22-5d99-9b64-g3f9e5678901",
    "amount": 4929200,
    "fees": 60000,
    "gst": 10800,
    "netAmount": 4929200,
    "estimatedArrival": "2025-01-04T10:35:00.000Z",
    "utr": "INST1704182640"
  }
}
```

## Database Schema (V2)

### Key Tables
- `sp_v2_merchant_master` - Merchant profiles
- `sp_v2_settlement_batches` - Settlement records
- `sp_v2_settlement_timeline_events` - Settlement progress tracking
- `sp_v2_bank_transfer_queue` - Bank transfer status
- `sp_v2_merchant_settlement_config` - Settlement configuration
- `sp_v2_rolling_reserve_ledger` - Reserve tracking

### Amount Storage
All amounts stored in **paise** (1 rupee = 100 paise) for precision.

## Fallback System

### Three-Tier Fallback
1. **V2 Adapter** - SettlePaisa V2 database (production)
2. **V1 Adapter** - Legacy database (fallback)
3. **Mock Data** - Static responses (final fallback)

### Error Handling
```bash
# When V2 DB unavailable, logs show:
💾 Database mode: ENABLED
🔍 Attempting V2 database connection...
❌ V2 Database connection failed
📋 Falling back to mock data mode
```

## Staging Deployment

### Prerequisites
1. SettlePaisa V2 database accessible
2. Environment variables configured
3. Demo merchant data seeded

### Deployment Steps
```bash
# 1. Deploy codebase
git push origin feat/v2-merchant-dashboard-wiring

# 2. Configure environment
# Update .env files with staging database URL

# 3. Seed demo data
psql -h staging-db -U username -d settlepaisa_v2 -f infra/sql/seed/merchant_demo_v2.sql

# 4. Start services
npm start  # Backend
npm run dev -- --port 5173  # Frontend
```

### Verification
```bash
# Test API endpoints
curl http://staging:8080/v1/merchant/dashboard/summary
curl http://staging:8080/v1/merchant/settlements

# Access dashboard
http://staging:5173/merchant/settlements
```

## Development Notes

### Features Implemented
- ✅ Dashboard summary with real-time balance
- ✅ Settlement history with pagination
- ✅ Settlement timeline tracking
- ✅ Instant settlement with fees calculation
- ✅ Settlement schedule configuration
- ✅ Rolling reserve tracking
- ✅ Automatic fallback system

### Merchant Configuration
- **Settlement Cycle**: T+1 (next business day)
- **Cutoff Time**: 2:00 PM IST daily
- **Rolling Reserve**: 5% held for 7 days
- **Min Settlement**: ₹1,000
- **Bank**: HDFC Bank, NEFT transfers

### Status Mappings
- `PROCESSING` → Settlement initiated, awaiting bank file
- `APPROVED` → Bank file received, transfer queued
- `SETTLED` → Amount credited to merchant account

## Troubleshooting

### Common Issues
1. **Database Connection Failed**: Check PG_URL and database availability
2. **No Data Returned**: Ensure demo merchant data is seeded
3. **Frontend Errors**: Verify API base URL in .env files

### Debug Commands
```bash
# Check database connection
psql postgresql://postgres:postgres@localhost:5432/settlepaisa_v2

# Verify demo merchant exists
SELECT merchant_name FROM sp_v2_merchant_master WHERE merchant_id = '11111111-1111-1111-1111-111111111111';

# Check settlement data
SELECT COUNT(*) FROM sp_v2_settlement_batches WHERE merchant_id = '11111111-1111-1111-1111-111111111111';
```

## Contact & Support
For staging deployment issues or questions, refer to this setup guide and the V2 database schema documentation.