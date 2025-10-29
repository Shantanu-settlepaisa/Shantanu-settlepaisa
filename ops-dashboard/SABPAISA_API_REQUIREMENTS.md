# SabPaisa API Requirements - Complete Guide

**Date:** October 26, 2025
**Status:** ✅ Database Fix Deployed | ⚠️ API Credentials Needed

---

## 🎯 What We Just Fixed

✅ **Database Connection Issue** - RESOLVED
- Changed hardcoded localhost to RDS environment variables
- Service can now connect to staging database
- No more ECONNREFUSED errors

---

## 📋 Current Status Summary

### ✅ What's Working Now:
1. **Database connection** - Connects to RDS successfully
2. **Service health** - recon-api is online and stable
3. **API endpoint** - `/pg-transactions/fetch` responds
4. **Cron job** - Scheduled to run daily at 2:00 AM IST

### ⚠️ What Needs SabPaisa Team's Help:
1. **API Authentication** - Getting 401 Unauthorized
2. **API Credentials** - Need username/password or API key

---

## 🔑 What to Ask SabPaisa Team

### Question 1: API Access & Authentication

**Ask them:**
> "We need access to the SabPaisa Report API to fetch transaction data. What are the authentication requirements?"

**API Endpoint We're Calling:**
```
https://reportapi.sabpaisa.in/SabPaisaReport/REST/SettlePaisa/txnData/{fromDate}/{toDate}/{clientCode}
```

**Example Request:**
```bash
GET https://reportapi.sabpaisa.in/SabPaisaReport/REST/SettlePaisa/txnData/2025-10-24/2025-10-24/ALL
```

**Current Error:**
```json
{
  "success": false,
  "error": "API responded with status 401: Unauthorized"
}
```

### Question 2: Authentication Method

**Ask them to clarify:**
- [ ] **Option A: Basic Auth?**
  ```
  Headers: Authorization: Basic base64(username:password)
  ```
  - If yes, we need: `username` and `password`

- [ ] **Option B: API Key?**
  ```
  Headers: X-API-Key: your_api_key
  ```
  - If yes, we need: `API key` value

- [ ] **Option C: Bearer Token?**
  ```
  Headers: Authorization: Bearer your_token
  ```
  - If yes, we need: `token` and refresh mechanism

- [ ] **Option D: Other custom auth?**
  - Ask them for: exact header names and values

### Question 3: Client Code (Merchant ID)

**Ask them:**
> "What client_code/merchant_id should we use to fetch all SettlePaisa transactions?"

**Options:**
- `ALL` - Fetch all merchants
- `SETTLEPAISA` - Specific code for SettlePaisa
- Individual merchant codes - List of codes

**We're currently using:** `ALL`

### Question 4: API Rate Limits

**Ask them:**
> "Are there any rate limits or restrictions on the Report API?"

**We need to know:**
- How many requests per minute/hour?
- Max date range per request?
- Any throttling policies?

### Question 5: Response Format

**Ask them:**
> "Can you share a sample response from the txnData endpoint?"

**We need to confirm:**
- Is it the same V1 format as the main SabPaisa platform?
- Any differences in field names or structure?
- How are payment gateway names represented?

---

## 🤖 How the Automated Sync Works (2AM Daily)

### Complete Flow:

```
┌─────────────────────────────────────────────────────────────┐
│ Every Day at 2:00 AM IST (Automated Cron Job)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Cron Trigger: daily-pg-sync.js                              │
│ - Runs on EC2 staging server                                │
│ - Timezone: Asia/Kolkata                                    │
│ - Target: Yesterday's date (T-1)                            │
│ - Merchants: ALL (or configured list)                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Check Database                                      │
│ - Query: sp_v2_transactions for yesterday                  │
│ - Filter: source_type = 'API_SYNC'                         │
│ - If found: Skip API call, return existing data            │
│ - If NOT found: Proceed to Step 2                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Call SabPaisa Report API                           │
│ - URL: https://reportapi.sabpaisa.in/.../txnData/          │
│ - Params: yesterday/yesterday/ALL                          │
│ - Auth: [NEEDS CREDENTIALS FROM SABPAISA]                  │
│ - Response: Array of V1 format transactions                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Transform Data                                      │
│ - Input: SabPaisa V1 format                                │
│ - Process: mapV1ToV2() function                            │
│ - Output: SettlePaisa V2 format                            │
│ - Add: source_type = 'API_SYNC'                            │
│ - Add: source_name = payment gateway name                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Insert into Database                                │
│ - Table: sp_v2_transactions                                 │
│ - Method: INSERT ... ON CONFLICT DO UPDATE                 │
│ - Deduplication: By transaction_id                         │
│ - Result: Transactions ready for reconciliation            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 5: Log Results                                         │
│ - Inserted count                                            │
│ - Updated count                                             │
│ - Skipped count                                             │
│ - Total duration                                            │
│ - Save to: sp_v2_batch_jobs table                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Done! Transactions Ready for Reconciliation                │
│ - Operations team can run recon anytime                    │
│ - No manual CSV upload needed                              │
│ - Same data as clicking "Fetch from Database" button      │
└─────────────────────────────────────────────────────────────┘
```

### Cron Configuration:

**File:** `services/recon-api/jobs/daily-pg-sync.js:129`
```javascript
const cronExpression = '0 2 * * *';  // Every day at 2:00 AM

cron.schedule(cronExpression, async () => {
  await runDailyPgSync();
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"  // IST timezone
});
```

**When it runs:**
- **Time:** 2:00 AM IST (India Standard Time)
- **Frequency:** Daily
- **Target Date:** Yesterday (T-1)
  - If today is Oct 26, it fetches Oct 25 data
- **Auto-start:** Yes, starts when recon-api service starts

---

## 🔘 How the "Fetch from Database" Button Works

### User Flow:

```
┌─────────────────────────────────────────────────────────────┐
│ User Action: Ops Team Opens Recon Workspace                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Select Date                                         │
│ - User picks: 2025-10-24                                   │
│ - User clicks: "Fetch from Database" button                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend Request                                            │
│ - URL: http://13.201.179.44:5103/pg-transactions/fetch    │
│ - Params: ?cycle_date=2025-10-24&merchant_id=ALL          │
│ - Method: GET                                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend: Check Database First                               │
│ - Query sp_v2_transactions                                  │
│ - WHERE transaction_date = '2025-10-24'                    │
│ - AND source_type = 'API_SYNC'                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    │                   │
              ✅ Found Data       ❌ No Data Found
                    │                   │
                    ↓                   ↓
    ┌───────────────────────┐  ┌───────────────────────────┐
    │ Return Existing       │  │ Call SabPaisa API         │
    │ - Count: 500         │  │ - Same as cron job        │
    │ - already_synced: true│  │ - Fetch from API          │
    │ - Message: "Already   │  │ - Transform V1 → V2       │
    │   available"          │  │ - Insert into DB          │
    └───────────────────────┘  └───────────────────────────┘
                    │                   │
                    └─────────┬─────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Return Response to Frontend                                 │
│ {                                                           │
│   "success": true,                                          │
│   "count": 500,                                             │
│   "transactions": [...],                                    │
│   "message": "✓ 500 transactions (From Database)"          │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ User Sees Success                                           │
│ - Green notification: "500 transactions fetched"           │
│ - Transactions appear in table                             │
│ - Ready to click "Run Recon" or upload bank statements    │
└─────────────────────────────────────────────────────────────┘
```

### Key Points:
- ✅ **Smart caching:** Only calls API if data doesn't exist
- ✅ **Same logic:** Button uses exact same code as 2AM cron job
- ✅ **On-demand:** User can fetch any date, not just yesterday
- ✅ **No duplicates:** Won't re-fetch if already synced

---

## 🛠️ What Needs to Be Configured

### Once SabPaisa Provides Credentials:

**File to edit:** `/home/ec2-user/services/recon-api/.env`

**Add these lines:**

```bash
# SabPaisa Report API Authentication
SABPAISA_API_USERNAME=your_username_here
SABPAISA_API_PASSWORD=your_password_here

# OR (if they use API key instead)
SABPAISA_API_KEY=your_api_key_here

# Optional: If they have custom auth header
SABPAISA_AUTH_HEADER=X-Custom-Auth
SABPAISA_AUTH_VALUE=your_auth_value
```

**Then restart the service:**
```bash
pm2 restart recon-api
```

### Code Changes Needed (After Getting Credentials):

**File:** `services/recon-api/services/pg-sync-service.js:38`

**Current (no auth):**
```javascript
const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Accept': 'application/json'
  }
});
```

**Will need to add (example for Basic Auth):**
```javascript
const auth = Buffer.from(`${process.env.SABPAISA_API_USERNAME}:${process.env.SABPAISA_API_PASSWORD}`).toString('base64');

const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Accept': 'application/json',
    'Authorization': `Basic ${auth}`
  }
});
```

**Or for API Key:**
```javascript
const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Accept': 'application/json',
    'X-API-Key': process.env.SABPAISA_API_KEY
  }
});
```

---

## ✅ Deployment Confirmation

### What's Already Deployed to Staging:

1. ✅ **Database Fix** - `pg-sync-service.js` uses RDS connection
2. ✅ **Service Running** - recon-api is online and healthy
3. ✅ **Cron Scheduled** - 2AM job is configured and waiting
4. ✅ **Endpoint Ready** - `/pg-transactions/fetch` is accessible

### What Happens at Next 2AM:

**Without credentials (current):**
- ❌ Cron runs but fails with 401 Unauthorized
- ❌ No transactions fetched
- ❌ Error logged to PM2 logs

**With credentials (after SabPaisa provides):**
- ✅ Cron runs and calls SabPaisa API successfully
- ✅ Fetches yesterday's transactions
- ✅ Transforms and inserts into database
- ✅ Logs success with transaction count
- ✅ Data ready for reconciliation

---

## 📊 Testing After Credentials Are Added

### Test 1: Manual API Test
```bash
# SSH to staging
ssh ec2-user@13.201.179.44

# Test the endpoint
curl 'http://localhost:5103/pg-transactions/fetch?cycle_date=2025-10-24'

# Expected: Success with transactions
```

### Test 2: Check Logs
```bash
pm2 logs recon-api --lines 50

# Should see:
# [PG Sync] Fetching from SabPaisa API: https://reportapi.sabpaisa.in/...
# [PG Sync] Received 500 transactions from API
# [PG Sync] Successfully transformed 500 transactions
# [PG Sync] Inserted 500 transactions into sp_v2_transactions
```

### Test 3: Verify Database
```bash
# Connect to RDS
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com -U postgres -d settlepaisa_v2

# Check data
SELECT COUNT(*), source_type
FROM sp_v2_transactions
WHERE transaction_date = '2025-10-24'
GROUP BY source_type;

# Expected: Count with source_type = 'API_SYNC'
```

### Test 4: Test from Frontend
1. Open: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/recon
2. Select date: 2025-10-24
3. Click: "Fetch from Database"
4. Expected: "✓ 500 transactions (From Database)"

### Test 5: Wait for Next 2AM
- Let cron job run automatically
- Check logs next morning
- Verify yesterday's data was fetched

---

## 📞 Email Template for SabPaisa Team

```
Subject: API Access Request for SettlePaisa Report API

Hi SabPaisa Team,

We're setting up the SettlePaisa 2.0 reconciliation system and need access to the SabPaisa Report API to fetch transaction data.

API Endpoint:
https://reportapi.sabpaisa.in/SabPaisaReport/REST/SettlePaisa/txnData/{fromDate}/{toDate}/{clientCode}

Current Status:
- We're receiving 401 Unauthorized responses
- Database connection is working
- System is ready to sync daily at 2:00 AM IST

Please provide:
1. Authentication method (Basic Auth / API Key / Bearer Token)
2. Username/Password or API Key
3. Correct client_code to use (ALL or specific code)
4. Any rate limits or restrictions
5. Sample API response format

Use Case:
- Daily automated sync at 2:00 AM IST for previous day's transactions
- On-demand fetch via "Fetch from Database" button in Ops Dashboard
- Used for reconciliation with bank statements

Please let us know the next steps to get API access.

Thanks,
[Your Name]
SettlePaisa Operations Team
```

---

## 🎯 Summary

### ✅ Deployment Complete:
- Database connection fix deployed
- Service restarted and healthy
- Cron job scheduled for 2AM daily
- Button endpoint ready

### ⚠️ Waiting On:
- **SabPaisa API credentials** (main blocker)
- Once received, 5-minute config update needed
- Then fully automated

### 🔄 How It Powers the Button:
1. **User clicks button** → Triggers same logic as cron job
2. **Checks database first** → Returns cached data if available
3. **Calls SabPaisa API** → Only if data not cached
4. **Transforms & stores** → V1 format → V2 format → Database
5. **Returns to user** → Shows transaction count and success message

### 🕐 How 2AM Sync Works:
1. **Cron triggers at 2AM IST** every day
2. **Fetches yesterday's data** (T-1) automatically
3. **Same API call** as button, but scheduled
4. **Stores in database** with source_type='API_SYNC'
5. **Logs results** for monitoring
6. **Ready for recon** when ops team starts work

**Next Action:** Contact SabPaisa team with the email template above.
