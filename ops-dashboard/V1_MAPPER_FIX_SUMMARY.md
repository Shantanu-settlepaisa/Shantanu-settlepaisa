# V1 Mapper Database Connection Fix - Summary

## Issue
Bank file uploads were completely failing (0 records inserted), causing all 10 PG transactions to go to exceptions with "Bank ₹0.00" messages.

## Root Cause
The V1 mapper (`v1-column-mapper.js`) was **hardcoded** to connect to the old database:
- Hardcoded: `13.201.179.44 / sp_v2_staging / sp_v2_user`
- Upload API: `settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com / settlepaisa_v2 / postgres`

When processing bank files:
1. Upload API reads file ✅
2. Calls V1 mapper to convert V1 → V2 format
3. V1 mapper queries old database for HDFC BANK config ❌
4. Can't find config → conversion fails silently
5. Falls back to original data → validation fails
6. No bank statements inserted → 0 rows in database

## Fix Applied

### Changed File: `services/api/v1-column-mapper.js`

**Before (lines 5-17):**
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '13.201.179.44',      // ❌ HARDCODED!
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'sp_v2_staging',   // ❌ HARDCODED!
  user: process.env.DB_USER || 'sp_v2_user',          // ❌ HARDCODED!
  password: process.env.DB_PASSWORD || 'sp_v2_password',
  ...
});
```

**After:**
```javascript
const { Pool } = require('pg');
const config = require('../config/env.cjs');         // ✅ Use shared config

const pool = new Pool({
  host: config.db.host,                               // ✅ From .env
  port: config.db.port,                               // ✅ From .env
  database: config.db.database,                       // ✅ From .env
  user: config.db.user,                               // ✅ From .env
  password: config.db.password,                       // ✅ From .env
  ...
});

console.log('[V1 Mapper] Database connection:', {    // ✅ Debug logging
  host: config.db.host,
  database: config.db.database,
  user: config.db.user
});
```

## Why This Fixes the Problem

1. **Single Source of Truth**: V1 mapper now uses same `env.cjs` config as upload API
2. **Environment-Aware**: Automatically uses correct database based on `.env` file
3. **No More Hardcoded Values**: No fallback to old database IP
4. **Visibility**: Logs which database it connects to on startup

## Verification

Run locally:
```bash
node -e "const mapper = require('./services/api/v1-column-mapper'); console.log('✅ Success');"
```

Expected output:
```
[V1 Mapper] Database connection: {
  host: 'localhost',
  database: 'settlepaisa_v2',
  user: 'postgres'
}
✅ Success
```

## Next Steps

1. **Deploy to Staging 2**: Follow `DEPLOY_V1_MAPPER_FIX_STAGING2.md`
2. **Verify EC2 .env**: Must point to RDS (not localhost)
3. **Re-upload test files**: PG and Bank files
4. **Check database**: Should see 10 bank statements
5. **Run reconciliation**: Should see 10 matches (not exceptions)

## Important: Prevent This From Happening Again

### ✅ DO:
- Always use `config` from `env.cjs` for database connections
- Use environment variables for all environment-specific config
- Test locally with correct .env before deploying

### ❌ DON'T:
- Never hardcode database IPs, credentials, or names
- Never use `||` fallbacks to hardcoded values for critical config
- Never assume environment variables will match production

## Testing Checklist

Before considering this complete:
- [ ] Code compiles without errors (local)
- [ ] V1 mapper connects to localhost (local test)
- [ ] Deployed to Staging 2 EC2
- [ ] V1 mapper connects to RDS on EC2 (check logs)
- [ ] Bank file upload succeeds (10 rows inserted)
- [ ] Reconciliation matches all 10 transactions
- [ ] Financial dashboard shows correct data

## Files Modified
- `services/api/v1-column-mapper.js` - Database connection fix
- `DEPLOY_V1_MAPPER_FIX_STAGING2.md` - Deployment guide
- `V1_MAPPER_FIX_SUMMARY.md` - This summary

## Commit Message
```
fix(upload): v1-mapper now uses env.cjs instead of hardcoded database

BREAKING CHANGE: V1 mapper no longer falls back to 13.201.179.44

- Changed v1-column-mapper.js to use config.db from env.cjs
- Removed all hardcoded database connection values
- Added debug logging for database connection on startup
- This fixes bank file upload failures on Staging 2

Fixes bank upload issue where 0 records were inserted because
V1 mapper couldn't find HDFC BANK config from the correct database.

Related: Manual E2E testing on Staging 2
```
