# Investigation Summary: Transaction Count Change (20→30)

## Date: October 26, 2025

## User's Question
"I had 20 transactions in the afternoon, now there are 30 transactions? When was new data uploaded? What was the count?"

## Key Findings

### 1. Frontend is Calling REAL Deployed API ✅
- **User's Evidence**: Console logs show API calls to `http://13.201.179.44:5108/api/overview?from=2025-10-26&to=2025-10-26`
- **NOT mock data** (I was initially wrong about this)
- **Deployed Server IP**: 13.201.179.44 (AWS EC2 instance)
- **Port**: 5108 (Overview API)

### 2. Database Mismatch Issue ⚠️
The deployed API code (from our local repository) expects these V2 tables:
- `sp_v2_transactions`
- `sp_v2_settlement_batches`
- `sp_v2_reconciliation_jobs`

**But the deployed database (`settlepaisa`) only has V1 tables:**
- `transaction_recon_table` (96 kB)
- `transaction_bank` (80 kB)
- `settled_transactions` (64 kB)
- `transaction_import_log` (48 kB)
- `recon_upload` (72 kB)

### 3. Code Analysis - What the API Queries

**File**: `services/overview-api/real-db-adapter.cjs`

The `/api/overview` endpoint (line 1014 in `index.js`) calls:
```javascript
// Line 23-33 in real-db-adapter.cjs
const transactionQuery = `
  SELECT
    COUNT(*) as total_transactions,
    COUNT(*) FILTER (WHERE status IN ('RECONCILED', 'SETTLED')) as matched_count,
    ...
  FROM sp_v2_transactions
  WHERE created_at::date BETWEEN $1 AND $2
`;
```

**This query CANNOT work on the deployed database** because `sp_v2_transactions` doesn't exist there.

### 4. Possible Explanations for the 30 Transactions

Given that the API code expects V2 tables that don't exist on the deployed database:

**Option A: Different Code is Running**
- The deployed server at 13.201.179.44:5108 may be running DIFFERENT code than what we have locally
- It might be using the OLD V1 table structure
- Need to check what code is actually deployed on that EC2 instance

**Option B: Database Configuration is Different**
- The deployed server's `.env` file might point to a DIFFERENT database
- Perhaps there's another database (like `settlepaisa_demo`) that has the V2 schema
- Need to check the deployed server's environment variables

**Option C: Fallback Mode**
- The real-db-adapter has fallback logic (lines 66-150) that tries `sp_v2_reconciliation_jobs` if the first query fails
- If both fail, it returns zeros
- The API might be successfully querying the fallback

### 5. What We Need to Determine

To answer "when was new data uploaded and what was the count?", we need:

1. **Access to the deployed server** (SSH to 13.201.179.44)
2. **Check the actual .env configuration** on that server
3. **Check which database** it's connecting to
4. **Query the correct table** (either V2 or V1 depending on what's configured)
5. **Check upload logs** from that database

### 6. Investigation Limitations

**Cannot investigate from local machine because:**
- Local database is `settlepaisa_v2` (localhost)
- Deployed server's database is `settlepaisa` (3.108.237.99) with V1 schema
- No SSH access to 13.201.179.44
- Cannot directly query the deployed server's database without knowing its exact configuration

## Next Steps

### Option 1: SSH Access Required
Ask user for SSH credentials to 13.201.179.44 so we can:
```bash
ssh user@13.201.179.44
cd /path/to/overview-api
cat .env  # Check database configuration
pm2 logs overview-api  # Check application logs
```

### Option 2: Direct Database Query
If user can provide the exact database configuration for the deployed server:
- Database name
- Host (is it 3.108.237.99 or something else?)
- Which table structure (V1 or V2?)

Then we can query the correct tables to find:
- Upload sessions from today
- Transaction counts by hour
- When the count changed from 20→30

### Option 3: Ask User to Check
User can check their own upload history or ask ops team:
- When was data uploaded today?
- What CSV files were processed?
- Check the Recon Workspace upload history

## Technical Details

**Local Environment:**
- Database: `settlepaisa_v2` on localhost
- Schema: V2 (sp_v2_* tables)
- 706 transactions total

**Deployed Environment (13.201.179.44:5108):**
- Database: `settlepaisa` on 3.108.237.99
- Schema: V1 (legacy table structure, no sp_v2_ prefix)
- 56 tables total (see list-deployed-tables.cjs output)

**Frontend:**
- Staging URL: `shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com`
- Calling: `http://13.201.179.44:5108/api/overview`
- Date filter: `from=2025-10-26&to=2025-10-26`
- Successfully receiving data (30 transactions visible)

## Conclusion

The 30 transactions are REAL data from the deployed server, but I cannot investigate further without:
1. SSH access to the deployed server, OR
2. Exact database configuration for that server, OR
3. User checking their own upload history

The discrepancy between our V2 code expecting `sp_v2_transactions` and the deployed database only having V1 tables suggests either:
- The deployed code is different from our local repository
- The deployed server connects to a different database than we discovered
- There's environment-specific configuration we're not aware of
