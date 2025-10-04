# Connector Capabilities - Implementation Status

**Last Updated:** October 3, 2025  
**Version:** 2.16.1

---

## Quick Answer

**Can you create SFTP/API connections seamlessly?**

**Answer:** **YES - But with different levels of functionality:**

| Connector Type | Test Connection | Manual Run | Scheduled Run | Data Persistence | Status |
|----------------|----------------|------------|---------------|------------------|--------|
| **PG_API (SabPaisa)** | ✅ Full | ✅ Full | ✅ Daily 2AM | ✅ Working | 🟢 Production Ready |
| **BANK_SFTP** | ✅ Working | ✅ Working | ⚠️ Needs scheduler | ❌ Not implemented | 🟡 Test Only |
| **BANK_API** | ✅ Working | ✅ Working | ⚠️ Needs scheduler | ❌ Not implemented | 🟡 Test Only |

---

## Connector Types Explained

### 1. PG_API (Payment Gateway API) - **FULLY WORKING**

**Example:** SabPaisa PG API

**What Works:**
- ✅ **Test Connection**: Validates API access, attempts sync
- ✅ **Manual Run**: Fetches transactions for specific date
- ✅ **Scheduled Run**: Automated daily sync at 2 AM IST
- ✅ **Data Transformation**: V1 → V2 format conversion
- ✅ **Data Persistence**: Saves to `sp_v2_transactions` table
- ✅ **Deduplication**: Prevents duplicate transactions
- ✅ **History Tracking**: Full audit log in `sp_v2_connector_runs`
- ✅ **Error Handling**: Retries, detailed error messages

**Configuration:**
```json
{
  "connector_type": "PG_API",
  "connection_config": {
    "api_base_url": "https://reportapi.sabpaisa.in/...",
    "authentication_type": "IP_WHITELIST",
    "merchant_codes": ["ALL"],
    "sync_days_back": 1,
    "auto_retry": true,
    "retry_count": 3
  }
}
```

**Use Case:** Automatically sync PG transactions daily

---

### 2. BANK_SFTP (Bank SFTP Server) - **TEST CONNECTION WORKING**

**Example:** AXIS Bank SFTP, HDFC SFTP

**What Works:**
- ✅ **Test Connection**: 
  - Validates SFTP credentials
  - Tests server connectivity
  - Lists files in remote directory
  - Returns file count
  
**Implementation:**
```javascript
// services/recon-api/services/sftp-connector-service.js

async function testSftpConnection(config) {
  const sftp = new Client();
  
  await sftp.connect({
    host: config.host,
    port: config.port || 22,
    username: config.username,
    password: config.password,
    privateKey: config.privateKey ? Buffer.from(config.privateKey) : undefined
  });
  
  const list = await sftp.list(config.remotePath || '/');
  
  return {
    success: true,
    filesFound: list.length,
    message: 'SFTP connection successful'
  };
}
```

**What's Partially Working:**
- ⚠️ **Manual Run (File Download)**:
  - Downloads files matching pattern
  - Supports date placeholders (YYYYMMDD)
  - Returns file content as string
  - **BUT**: Does NOT persist to database yet

**What's NOT Working:**
- ❌ **Scheduled Runs**: No cron job setup yet
- ❌ **Data Persistence**: Files downloaded but not saved
- ❌ **Data Transformation**: No V1→V2 mapping
- ❌ **Reconciliation Integration**: Not feeding into recon engine

**Configuration:**
```json
{
  "connector_type": "BANK_SFTP",
  "connection_config": {
    "host": "sftp.axisbank.com",
    "port": 22,
    "username": "settlepaisa",
    "password": "xxx",
    "remotePath": "/recon/daily",
    "filePattern": "AXIS_RECON_YYYYMMDD*.csv"
  }
}
```

**Current Behavior:**
```bash
# Test Connection
curl -X POST http://localhost:5103/connectors/2/test

# Response:
{
  "success": true,
  "message": "SFTP connection successful",
  "filesFound": 12
}

# Manual Run
curl -X POST http://localhost:5103/connectors/2/run

# Downloads files but doesn't save them!
```

**To Make Fully Functional:**
1. Add CSV parser to read file content
2. Add V1→V2 transformation for bank files
3. Persist to `sp_v2_bank_transactions` table
4. Create scheduled job in daily-sftp-sync.js

---

### 3. BANK_API (Bank API Integration) - **TEST CONNECTION WORKING**

**Example:** BOB API, ICICI API

**What Works:**
- ✅ **Test Connection**:
  - Validates API endpoint
  - Tests authentication (Bearer/API Key)
  - Returns HTTP status code
  
**Implementation:**
```javascript
// services/recon-api/services/api-connector-service.js

async function testApiConnection(config) {
  const url = `${config.baseUrl}${config.endpoint || ''}`;
  
  const headers = { 'Accept': 'application/json' };
  
  if (config.authType === 'bearer') {
    headers['Authorization'] = `Bearer ${config.token}`;
  } else if (config.authType === 'apiKey') {
    headers['X-API-Key'] = config.apiKey;
  }
  
  const response = await fetch(url, { method: 'GET', headers });
  
  return {
    success: response.ok,
    statusCode: response.status
  };
}
```

**What's Partially Working:**
- ⚠️ **Manual Run (API Call)**:
  - Fetches data from API
  - Supports JSON/CSV/XML response formats
  - URL templating ({date}, {cycleDate}, {YYYYMMDD})
  - **BUT**: Does NOT parse or persist data yet

**What's NOT Working:**
- ❌ **Scheduled Runs**: No cron job setup
- ❌ **Data Parsing**: Raw response returned
- ❌ **Data Transformation**: No V1→V2 mapping
- ❌ **Reconciliation Integration**: Not feeding into recon

**Configuration:**
```json
{
  "connector_type": "BANK_API",
  "connection_config": {
    "baseUrl": "https://api.bob.com",
    "endpoint": "/v1/reconciliation/{YYYYMMDD}",
    "authType": "bearer",
    "token": "xxx",
    "responseFormat": "json"
  }
}
```

**Current Behavior:**
```bash
# Test Connection
curl -X POST http://localhost:5103/connectors/3/test

# Response:
{
  "success": true,
  "statusCode": 200
}

# Manual Run
curl -X POST http://localhost:5103/connectors/3/run

# Fetches data but doesn't save it!
```

---

## Complete Feature Matrix

### Test Connection

| Feature | PG_API | BANK_SFTP | BANK_API |
|---------|--------|-----------|----------|
| Validate credentials | ✅ | ✅ | ✅ |
| Check connectivity | ✅ | ✅ | ✅ |
| List remote files | N/A | ✅ | N/A |
| Verify API endpoint | ✅ | N/A | ✅ |
| Return success/failure | ✅ | ✅ | ✅ |
| Log test run | ✅ | ✅ | ✅ |

### Manual Run

| Feature | PG_API | BANK_SFTP | BANK_API |
|---------|--------|-----------|----------|
| Trigger on demand | ✅ | ✅ | ✅ |
| Fetch data from source | ✅ | ✅ | ✅ |
| Parse response | ✅ | ❌ | ❌ |
| Transform V1→V2 | ✅ | ❌ | ❌ |
| Save to database | ✅ | ❌ | ❌ |
| Update run history | ✅ | ✅ | ✅ |

### Scheduled Runs

| Feature | PG_API | BANK_SFTP | BANK_API |
|---------|--------|-----------|----------|
| Cron job configured | ✅ | ❌ | ❌ |
| Daily execution | ✅ | ❌ | ❌ |
| Pause/Resume | ✅ | ✅ (UI only) | ✅ (UI only) |
| Batch job logging | ✅ | ❌ | ❌ |

### Data Pipeline

| Feature | PG_API | BANK_SFTP | BANK_API |
|---------|--------|-----------|----------|
| Download/Fetch | ✅ | ✅ | ✅ |
| Parse CSV/JSON | ✅ | ❌ | ❌ |
| V1→V2 mapping | ✅ | ❌ | ❌ |
| Deduplication | ✅ | ❌ | ❌ |
| Database insert | ✅ | ❌ | ❌ |
| Reconciliation ready | ✅ | ❌ | ❌ |

---

## UI Capabilities

### What Users Can Do NOW:

1. **Create Any Connector Type**
   - ✅ Fill out form with SFTP/API details
   - ✅ Save to database
   - ✅ View in connectors list

2. **Test Connection**
   - ✅ Click "Test" button
   - ✅ Get success/failure message
   - ✅ See test run in history

3. **Manual Run**
   - ✅ Click "Run" button
   - ✅ Trigger data fetch
   - ⚠️ SFTP/API: Data fetched but NOT saved

4. **Pause/Resume**
   - ✅ Toggle connector status
   - ✅ Prevents scheduled runs (when implemented)

5. **View History**
   - ✅ See all test/manual runs
   - ✅ View success/failure status
   - ✅ See error messages

---

## To Make SFTP/API Fully Functional

### For BANK_SFTP:

**Step 1: Add CSV Parser**
```javascript
// In sftp-connector-service.js
const Papa = require('papaparse');

function parseCsvFile(fileContent) {
  const result = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true
  });
  return result.data;
}
```

**Step 2: Add Bank Mapping**
```javascript
// Create services/recon-api/services/bank-mapper.js
function mapBankToV2(bankData, bankCode) {
  // Use existing v1-column-mapper.js logic
  return bankData.map(row => ({
    transaction_id: row.UTR,
    amount_paise: parseFloat(row.AMOUNT) * 100,
    transaction_date: parseDate(row.TXN_DATE),
    // ... more mappings
  }));
}
```

**Step 3: Persist to Database**
```javascript
// In connectors.js run handler
const files = await downloadSftpFiles(config, cycleDate);
for (const file of files) {
  const bankData = parseCsvFile(file.content);
  const v2Data = mapBankToV2(bankData, connector.source_entity);
  await insertBankTransactions(v2Data);
}
```

**Step 4: Add Scheduler**
```javascript
// Create jobs/daily-bank-sync.js
cron.schedule('0 19 * * *', async () => {
  const connectors = await getActiveSftpConnectors();
  for (const connector of connectors) {
    await runConnector(connector.id);
  }
});
```

---

### For BANK_API:

**Step 1: Add Response Parser**
```javascript
function parseApiResponse(data, format) {
  if (format === 'json') {
    return Array.isArray(data) ? data : data.records || data.transactions;
  } else if (format === 'csv') {
    return Papa.parse(data, { header: true }).data;
  } else if (format === 'xml') {
    return parseXml(data);
  }
}
```

**Step 2-4:** Same as SFTP (mapping, persistence, scheduler)

---

## Realistic Timeline

### Already Done (Today):
- ✅ Test connection for SFTP
- ✅ Test connection for API
- ✅ File download logic
- ✅ API fetch logic
- ✅ UI for all connector types

### Can Be Done Tomorrow (4-6 hours):
- [ ] CSV/JSON parser integration
- [ ] Bank data V1→V2 mapping
- [ ] Database persistence for bank data
- [ ] Test with real bank file

### Can Be Done This Week (2-3 days):
- [ ] Scheduled SFTP/API jobs
- [ ] Multi-connector parallel execution
- [ ] Retry logic for failed runs
- [ ] Email notifications

---

## Production Readiness

| Connector Type | Status | Ready For |
|----------------|--------|-----------|
| **PG_API (SabPaisa)** | 🟢 Production Ready | Production use (pending IP whitelist) |
| **BANK_SFTP** | 🟡 Test Ready | Testing connections, NOT production |
| **BANK_API** | 🟡 Test Ready | Testing connections, NOT production |

---

## Recommendation

**For Your Question: "Can I create SFTP/API connections seamlessly?"**

**Short Answer:** 
- **PG_API**: YES - Fully seamless, production ready
- **SFTP/API**: YES for testing connections, NO for production use yet

**Action Plan:**

1. **Use Now (Today):**
   - ✅ Create SFTP/API connectors
   - ✅ Test connectivity
   - ✅ Verify credentials work
   - ✅ List remote files (SFTP)

2. **Wait for Full Implementation (This Week):**
   - ⏳ Automated daily sync
   - ⏳ Data persistence
   - ⏳ Reconciliation integration

3. **Production Use:**
   - **PG_API**: Deploy now (just need IP whitelist)
   - **SFTP/API**: Wait for full implementation

---

## Summary

**YES, you can create SFTP/API connectors seamlessly!**

The UI, database schema, and connection logic are all working. You can:
- ✅ Add any bank SFTP/API connector
- ✅ Test if credentials are valid
- ✅ Verify connectivity
- ✅ See test results in history

**BUT** - to use them in production reconciliation, we need to add:
- CSV/JSON parsing
- Bank data transformation
- Database persistence
- Scheduled jobs

**Estimated time to make fully production-ready:** 2-3 days

---

**Questions?**
- Need SFTP/API implemented urgently? → Prioritize which bank first
- Just testing connections? → Use current version
- Want to see demo? → I can create test SFTP/API connector

