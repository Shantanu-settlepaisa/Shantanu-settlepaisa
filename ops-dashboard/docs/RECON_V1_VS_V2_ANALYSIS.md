# SettlePaisa Reconciliation Engine: V1 vs V2 Deep Analysis

## 🎯 **Executive Summary**

V2's reconciliation engine is **architecturally superior** to V1 but **missing critical SabPaisa integration points** and **production-ready features**. This analysis focuses ONLY on reconciliation capabilities.

### **Quick Verdict**
- **✅ V2 Matching Algorithm**: Better than V1 (multi-tier, confidence scoring, reason classification)
- **✅ V2 Architecture**: Modern, scalable, better separation of concerns
- **❌ V2 SabPaisa Integration**: Missing - needs PG/Bank API connectors
- **❌ V2 Production Features**: No audit trail, workflow management, approval chains

---

## 📊 **V1 Reconciliation Architecture (Production)**

### **V1 Recon Data Flow**
```
SabPaisa PG System
    │
    ├─► transactions table (live PG data)
    │   ├─ transaction_id, utr, rrn
    │   ├─ amount_paise, status
    │   └─ merchant_id, created_at
    │
    ▼
Bank SFTP/API
    │
    ├─► bank_statements table (bank data)
    │   ├─ bank_ref, utr
    │   ├─ amount_paise, transaction_date
    │   └─ debit_credit, description
    │
    ▼
Reconciliation Engine
    │
    ├─► reconciliation_matches (auto + manual)
    │   ├─ transaction_id ↔ bank_entry_id
    │   ├─ match_type, confidence_score
    │   └─ matched_by, matched_at
    │
    └─► reconciliation_exceptions (unmatched)
        ├─ reason_id, severity
        ├─ resolution_status
        └─ assigned_to, resolved_by
```

### **V1 Core Recon Tables** (From Production Schema)
```sql
-- PRIMARY RECON TABLES IN V1

transactions                     -- PG transactions (source of truth)
├─ id, transaction_id, utr, rrn
├─ merchant_id, amount_paise
├─ status (captured/settled/refunded)
├─ payment_method, bank
└─ Direct integration with SabPaisa PG

bank_statements                  -- Bank reconciliation data
├─ id, bank_id, statement_date
├─ file_name, file_hash
└─ Bank connector integration

bank_statement_entries           -- Individual bank transactions
├─ id, statement_id, utr
├─ amount_paise, transaction_date
├─ description, debit_credit
└─ Line-level bank data

reconciliation_matches           -- Successful matches
├─ id, transaction_id, bank_entry_id
├─ match_type (EXACT|FUZZY|MANUAL)
├─ match_confidence, match_score
├─ matched_by, matched_at
└─ Linkage table

reconciliation_exceptions        -- Unmatched items
├─ id, transaction_id, bank_entry_id
├─ reason_id → exception_reasons
├─ severity (LOW|MEDIUM|HIGH|CRITICAL)
├─ status (OPEN|INVESTIGATING|RESOLVED)
├─ assigned_to, resolution_notes
└─ Exception management

exception_reasons                -- Master reason codes
├─ id, reason_code, reason_label
├─ severity, description
└─ Standardized exception taxonomy

-- WORKFLOW & AUDIT TABLES

recon_jobs                       -- Job tracking
├─ job_id, cycle_date
├─ pg_file_path, bank_file_path
├─ status, started_at, completed_at
├─ matched_count, exception_count
└─ Job orchestration

recon_job_audit                  -- Detailed audit trail
├─ job_id, action_type
├─ actor_id, timestamp
├─ old_value, new_value
└─ Complete audit log

recon_approvals                  -- Approval workflow
├─ job_id, approver_id
├─ approval_status, comments
├─ approved_at
└─ Maker-checker pattern
```

### **V1 Matching Logic** (Inferred from Schema)
```javascript
// V1 appears to use simpler matching logic based on schema

function v1_match_transaction(pgTxn, bankEntries) {
  // Stage 1: Exact UTR match
  const exactMatch = bankEntries.find(b => 
    b.utr === pgTxn.utr && 
    b.amount_paise === pgTxn.amount_paise
  );
  
  if (exactMatch) {
    return {
      match: exactMatch,
      type: 'EXACT',
      confidence: 100
    };
  }
  
  // Stage 2: UTR match with amount tolerance
  const fuzzyMatch = bankEntries.find(b =>
    b.utr === pgTxn.utr &&
    Math.abs(b.amount_paise - pgTxn.amount_paise) < 100 // ₹1 tolerance
  );
  
  if (fuzzyMatch) {
    return {
      match: fuzzyMatch,
      type: 'FUZZY',
      confidence: 85
    };
  }
  
  // Stage 3: Manual matching required
  return {
    match: null,
    type: 'UNMATCHED',
    reason: classify_exception_reason(pgTxn, bankEntries)
  };
}

// V1 Exception Classification (based on reason_codes table)
function classify_exception_reason(pgTxn, bankEntries) {
  if (!pgTxn.utr) return 'UTR_MISSING';
  if (bankEntries.length === 0) return 'BANK_FILE_MISSING';
  
  const utrMatch = bankEntries.find(b => b.utr === pgTxn.utr);
  if (utrMatch && utrMatch.amount_paise !== pgTxn.amount_paise) {
    return 'AMOUNT_MISMATCH';
  }
  
  return 'PG_TXN_MISSING_IN_BANK';
}
```

---

## 🚀 **V2 Reconciliation Architecture (Current State)**

### **V2 Recon Data Flow**
```
Mock PG API (Port 5101)
    │
    ├─► In-memory transaction generation
    │   └─ No actual SabPaisa integration ❌
    │
    ▼
Mock Bank API (Port 5102)
    │
    ├─► Simulated bank statement data
    │   └─ No actual bank connector ❌
    │
    ▼
Recon Engine (services/recon-api)
    │
    ├─► ReconciliationEngine.js
    │   ├─ Multi-tier matching (EXACT → STRONG → HEURISTIC)
    │   ├─ Confidence scoring (0-100)
    │   ├─ 17 reason code classification
    │   └─ Advanced exception handling
    │
    ▼
Database (PostgreSQL)
    │
    ├─► recon_job table
    ├─► recon_match table
    ├─► recon_unmatched table
    └─► normalized_transaction table
```

### **V2 Core Recon Tables** (From Your V2 Schema)
```sql
-- V2 RECON TABLES (CURRENT)

recon_job                        -- Job orchestration ✓
├─ job_id, cycle_date
├─ pg_file_path, bank_file_path
├─ status, matched_count
├─ unmatched_pg_count, unmatched_bank_count
└─ Good job tracking

recon_match                      -- Match records ✓
├─ match_id, job_id
├─ pg_txn_id, bank_txn_id
├─ match_type, confidence_score
└─ Similar to V1

recon_unmatched                  -- Unmatched tracking ✓
├─ unmatched_id, job_id, txn_id
├─ source (PG|BANK)
├─ reason, resolution_status
└─ Good structure

normalized_transaction           -- Normalized data ✓
├─ txn_id, job_id, source
├─ transaction_id, amount, status
├─ transaction_date, raw_data
└─ Better normalization layer

-- V2 CONNECTOR TABLES (BETTER THAN V1) ✓

recon_connector                  -- Data source config
├─ id, name, type, provider
├─ merchant_id, acquirer_code
└─ Flexible connector framework

recon_connector_run              -- Execution tracking
├─ id, connector_id, cycle_date
├─ started_at, finished_at
├─ files_discovered, files_downloaded
└─ Automated job tracking

recon_ingested_file              -- File lineage
├─ id, connector_id, cycle_date
├─ remote_path, local_uri, sha256
├─ pgp_verified, dedupe_key
└─ Better file tracking than V1

-- V2 MISSING TABLES (Critical Gaps) ❌

reconciliation_exceptions        -- ❌ No dedicated exception table
exception_reasons                -- ❌ No master reason codes
recon_approvals                  -- ❌ No approval workflow
recon_job_audit                  -- ❌ No detailed audit trail
manual_match_history             -- ❌ No manual match tracking
resolution_templates             -- ❌ No exception resolution guides
```

### **V2 Matching Algorithm** (Superior to V1)
```javascript
// V2 Advanced Multi-Tier Matching (from reconciliation-engine.js)

class ReconciliationEngine {
  
  // Match Tiers (V2 Advantage)
  MATCH_TIERS = {
    EXACT: 'A',      // 100% confidence - All fields match
    STRONG: 'B',     // 85-99% confidence - Minor variance allowed
    HEURISTIC: 'C'   // 70-84% confidence - Fuzzy matching
  };
  
  // Tolerances (Configurable per merchant - V2 Advantage)
  DEFAULT_TOLERANCES = {
    amountPaise: 100,        // ₹1.00 tolerance
    amountPercent: 0.001,    // 0.1% variance
    dateWindowDays: 2,       // T+2 settlement
    feeVariancePercent: 0.02 // 2% fee variance
  };
  
  // 17 Reason Codes (More granular than V1)
  REASON_CODES = {
    BANK_FILE_MISSING,
    PG_TXN_MISSING_IN_BANK,
    BANK_TXN_MISSING_IN_PG,
    UTR_MISSING_OR_INVALID,
    UTR_MISMATCH,
    DATE_OUT_OF_WINDOW,
    AMOUNT_MISMATCH,
    FEE_MISMATCH,
    ROUNDING_ERROR,
    STATUS_MISMATCH,
    DUPLICATE_BANK_ENTRY,
    DUPLICATE_PG_ENTRY,
    CURRENCY_MISMATCH,
    SCHEME_OR_MID_MISMATCH,
    FEES_VARIANCE,
    PARTIAL_CAPTURE_OR_REFUND_PENDING,
    SPLIT_SETTLEMENT_UNALLOCATED
  };
  
  // Advanced Matching Logic
  matchTransaction(pgTxn, bankIndex, usedBankRecords, cycleDate) {
    const utr = pgTxn.utr.toUpperCase();
    const potentialMatches = bankIndex.get(utr) || [];
    
    if (potentialMatches.length === 0) {
      return {
        matched: false,
        potentialMatches: [],
        closestMatch: null
      };
    }
    
    // Stage 1: Exact Match (Tier A)
    for (const bankTxn of potentialMatches) {
      if (usedBankRecords.has(bankTxn)) continue;
      
      if (this.isExactMatch(pgTxn, bankTxn)) {
        usedBankRecords.add(bankTxn);
        return {
          matched: true,
          match: this.createMatch(pgTxn, bankTxn, 'EXACT', 100),
          tier: 'A'
        };
      }
    }
    
    // Stage 2: Strong Match (Tier B)
    for (const bankTxn of potentialMatches) {
      if (usedBankRecords.has(bankTxn)) continue;
      
      const score = this.calculateMatchScore(pgTxn, bankTxn);
      if (score >= 85) {
        usedBankRecords.add(bankTxn);
        return {
          matched: true,
          match: this.createMatch(pgTxn, bankTxn, 'STRONG', score),
          tier: 'B'
        };
      }
    }
    
    // Stage 3: Heuristic Match (Tier C)
    const heuristicMatch = this.findHeuristicMatch(
      pgTxn, 
      potentialMatches, 
      usedBankRecords
    );
    
    if (heuristicMatch && heuristicMatch.score >= 70) {
      usedBankRecords.add(heuristicMatch.bankTxn);
      return {
        matched: true,
        match: this.createMatch(
          pgTxn, 
          heuristicMatch.bankTxn, 
          'HEURISTIC', 
          heuristicMatch.score
        ),
        tier: 'C'
      };
    }
    
    // No match found
    return {
      matched: false,
      potentialMatches,
      closestMatch: this.findClosestMatch(pgTxn, potentialMatches)
    };
  }
  
  // Exact Match Criteria
  isExactMatch(pgTxn, bankTxn) {
    return (
      pgTxn.utr === bankTxn.UTR &&
      Math.abs(pgTxn.amount - bankTxn.AMOUNT) === 0 &&
      this.isWithinDateWindow(pgTxn.captured_at, bankTxn.DATE, 0)
    );
  }
  
  // Confidence Score Calculation (V2 Advantage)
  calculateMatchScore(pgTxn, bankTxn) {
    let score = 0;
    const weights = {
      utr: 40,      // UTR match is most important
      amount: 30,   // Amount match
      date: 20,     // Date proximity
      other: 10     // Additional fields
    };
    
    // UTR match
    if (pgTxn.utr === bankTxn.UTR) {
      score += weights.utr;
    }
    
    // Amount match
    const amountDiff = Math.abs(pgTxn.amount - bankTxn.AMOUNT);
    const amountPercent = amountDiff / pgTxn.amount;
    
    if (amountDiff <= this.tolerances.amountPaise) {
      score += weights.amount;
    } else if (amountPercent <= this.tolerances.amountPercent) {
      score += weights.amount * 0.8;
    }
    
    // Date proximity
    const dateDiff = this.getDateDiffDays(pgTxn.captured_at, bankTxn.DATE);
    if (dateDiff === 0) {
      score += weights.date;
    } else if (dateDiff <= this.tolerances.dateWindowDays) {
      score += weights.date * (1 - dateDiff / this.tolerances.dateWindowDays);
    }
    
    // Additional matching signals
    if (pgTxn.merchant_id === bankTxn.MERCHANT_ID) {
      score += weights.other * 0.5;
    }
    
    return Math.round(score);
  }
  
  // Advanced Exception Classification (V2 Advantage)
  classifyUnmatchedReason(pgTxn, potentialMatches, cycleDate) {
    // Check for missing UTR
    if (!pgTxn.utr || pgTxn.utr.trim() === '') {
      return {
        code: 'UTR_MISSING_OR_INVALID',
        detail: 'PG transaction has no UTR',
        isException: true
      };
    }
    
    // Check for duplicates
    if (potentialMatches.length > 1) {
      return {
        code: 'DUPLICATE_BANK_ENTRY',
        detail: `Multiple bank entries with UTR ${pgTxn.utr}`,
        isException: true
      };
    }
    
    // Check for amount mismatch with UTR match
    if (potentialMatches.length === 1) {
      const bankTxn = potentialMatches[0];
      const amountDiff = Math.abs(pgTxn.amount - bankTxn.AMOUNT);
      
      if (amountDiff > this.tolerances.amountPaise) {
        return {
          code: 'AMOUNT_MISMATCH',
          detail: `UTR matches but amount differs by ₹${(amountDiff / 100).toFixed(2)}`,
          isException: true
        };
      }
      
      // Check date window
      const dateDiff = this.getDateDiffDays(pgTxn.captured_at, bankTxn.DATE);
      if (dateDiff > this.tolerances.dateWindowDays) {
        return {
          code: 'DATE_OUT_OF_WINDOW',
          detail: `Transaction date is ${dateDiff} days apart (> ${this.tolerances.dateWindowDays} days)`,
          isException: true
        };
      }
    }
    
    // No bank record found
    return {
      code: 'PG_TXN_MISSING_IN_BANK',
      detail: 'No matching bank transaction found',
      isException: false
    };
  }
}
```

---

## 🔥 **CRITICAL GAPS: What V2 MUST Implement**

### **1. SabPaisa PG Integration** ❌ **CRITICAL**

**V1 Has:**
```sql
-- Direct integration with SabPaisa production tables
transactions                     -- Live PG data
├─ Real-time transaction ingestion
├─ Status updates (captured/settled/refunded)
├─ Payment method tracking
└─ Direct merchant linkage

-- V1 Query Pattern
SELECT t.* 
FROM transactions t
WHERE t.created_at::date = $1
  AND t.status = 'captured'
  AND t.merchant_id = $2
ORDER BY t.created_at;
```

**V2 Has:**
```javascript
// Mock API - NOT REAL INTEGRATION ❌
// services/mock-pg-api/index.js

app.get('/api/pg/transactions', (req, res) => {
  // Generates FAKE data
  const mockData = generateMockTransactions(req.query.cycle);
  res.json(mockData);
});
```

**What V2 NEEDS:**
```javascript
// REQUIRED: Real SabPaisa PG API Integration

// services/sabpaisa-pg-connector/index.js
class SabPaisaPGConnector {
  constructor(config) {
    this.baseUrl = config.SABPAISA_PG_API_URL;
    this.apiKey = config.SABPAISA_API_KEY;
    this.database = config.SABPAISA_DB_CONFIG;
  }
  
  // Option 1: Direct DB Query (Recommended)
  async fetchTransactionsByCycle(cycleDate, merchantId) {
    const query = `
      SELECT 
        txn_id,
        merchant_id,
        order_id,
        amount,
        payment_mode,
        status,
        utr,
        rrn,
        bank_name,
        captured_at,
        settled_at,
        gateway_response
      FROM sabpaisa_production.transactions
      WHERE DATE(captured_at) = $1
        AND status = 'SUCCESS'
        AND merchant_id = $2
      ORDER BY captured_at
    `;
    
    return await this.database.query(query, [cycleDate, merchantId]);
  }
  
  // Option 2: API Integration (If SabPaisa provides REST API)
  async fetchViaAPI(cycleDate, merchantId) {
    const response = await axios.get(`${this.baseUrl}/api/v1/transactions`, {
      headers: { 'X-API-Key': this.apiKey },
      params: {
        from_date: cycleDate,
        to_date: cycleDate,
        merchant_id: merchantId,
        status: 'SUCCESS'
      }
    });
    
    return this.normalizeResponse(response.data);
  }
  
  // Normalization for V2 recon engine
  normalizeResponse(apiData) {
    return apiData.map(txn => ({
      transaction_id: txn.txn_id,
      utr: txn.utr,
      rrn: txn.rrn,
      amount: txn.amount,
      captured_at: txn.captured_at,
      payment_method: txn.payment_mode,
      bank: txn.bank_name,
      merchant_id: txn.merchant_id,
      status: txn.status,
      raw_data: txn
    }));
  }
}

// Usage in recon job
async function fetchPGTransactions(cycleDate, merchantId) {
  const connector = new SabPaisaPGConnector({
    SABPAISA_PG_API_URL: process.env.SABPAISA_PG_URL,
    SABPAISA_API_KEY: process.env.SABPAISA_API_KEY,
    SABPAISA_DB_CONFIG: {
      host: process.env.SABPAISA_DB_HOST,
      database: process.env.SABPAISA_DB_NAME,
      user: process.env.SABPAISA_DB_USER,
      password: process.env.SABPAISA_DB_PASS
    }
  });
  
  return await connector.fetchTransactionsByCycle(cycleDate, merchantId);
}
```

---

### **2. Bank SFTP/API Integration** ❌ **CRITICAL**

**V1 Has:**
```sql
-- Bank connector framework
bank_connectors                  -- Connector configurations
├─ connector_name, connector_type (SFTP/API)
├─ connection_config (JSONB)
├─ sftp_host, sftp_port, sftp_user
└─ last_sync_at, sync_frequency_minutes

bank_statements                  -- Statement tracking
├─ bank_id, statement_date
├─ file_name, file_hash
└─ status (RECEIVED|PROCESSED|FAILED)

-- V1 SFTP Ingestion Logic
function ingestBankStatements(cycleDate) {
  // 1. Connect to bank SFTP
  const conn = new SFTPClient();
  await conn.connect({
    host: 'bank.sftp.server.com',
    port: 22,
    username: 'settlepaisa',
    privateKey: fs.readFileSync('/path/to/key')
  });
  
  // 2. Download files matching pattern
  const files = await conn.list('/incoming');
  const pattern = `BANK_RECON_${cycleDate.replace(/-/g, '')}.csv`;
  const targetFile = files.find(f => f.name.includes(pattern));
  
  // 3. Parse and store
  const data = await parseCSV(targetFile);
  await storeBankStatements(data, cycleDate);
}
```

**V2 Has:**
```javascript
// Mock Bank API - NOT REAL ❌
// services/mock-bank-api/index.js

app.get('/api/bank/statements', (req, res) => {
  // Generates FAKE bank data
  const mockData = generateMockBankStatements(req.query.cycle);
  res.json(mockData);
});
```

**What V2 NEEDS:**
```javascript
// REQUIRED: Real Bank Connector System

// services/bank-connector/SFTPConnector.js
class BankSFTPConnector {
  constructor(config) {
    this.config = config;
    this.sftp = new Client();
  }
  
  async fetchStatementFiles(cycleDate, bank) {
    // Connect to bank SFTP
    await this.sftp.connect({
      host: this.config.BANK_SFTP_HOST,
      port: this.config.BANK_SFTP_PORT,
      username: this.config.BANK_SFTP_USER,
      privateKey: fs.readFileSync(this.config.BANK_SFTP_KEY_PATH)
    });
    
    // File naming pattern per bank
    const patterns = {
      'HDFC': `HDFC_RECON_${cycleDate.replace(/-/g, '')}.csv`,
      'ICICI': `ICICI_SETTLEMENT_${cycleDate}.txt`,
      'AXIS': `AXIS_UTR_${cycleDate}.csv`
    };
    
    const pattern = patterns[bank];
    const remoteDir = this.config.BANK_REMOTE_DIR;
    
    // List and download matching files
    const files = await this.sftp.list(remoteDir);
    const matchedFile = files.find(f => f.name.includes(pattern));
    
    if (!matchedFile) {
      throw new Error(`NO_BANK_FILES: No file found matching ${pattern}`);
    }
    
    // Download file
    const localPath = `/tmp/${matchedFile.name}`;
    await this.sftp.fastGet(`${remoteDir}/${matchedFile.name}`, localPath);
    
    // Verify checksum if available
    if (matchedFile.checksum) {
      await this.verifyChecksum(localPath, matchedFile.checksum);
    }
    
    return {
      fileName: matchedFile.name,
      localPath,
      fileSize: matchedFile.size,
      remoteModified: matchedFile.modifyTime
    };
  }
  
  async parseAndNormalize(filePath, bank) {
    // Bank-specific CSV parsers
    const parsers = {
      'HDFC': this.parseHDFCFormat,
      'ICICI': this.parseICICIFormat,
      'AXIS': this.parseAXISFormat
    };
    
    const rawData = await this.readCSV(filePath);
    const parser = parsers[bank];
    
    return rawData.map(row => parser(row));
  }
  
  parseHDFCFormat(row) {
    return {
      bank_ref: row['Transaction ID'],
      utr: row['UTR'],
      amount: parseFloat(row['Amount']) * 100, // Convert to paise
      transaction_date: this.parseDate(row['Date'], 'DD/MM/YYYY'),
      description: row['Description'],
      debit_credit: row['Type']
    };
  }
}

// Integration in recon job
async function fetchBankStatements(cycleDate, bank) {
  const connector = new BankSFTPConnector({
    BANK_SFTP_HOST: process.env.BANK_SFTP_HOST,
    BANK_SFTP_PORT: process.env.BANK_SFTP_PORT,
    BANK_SFTP_USER: process.env.BANK_SFTP_USER,
    BANK_SFTP_KEY_PATH: process.env.BANK_SFTP_KEY_PATH,
    BANK_REMOTE_DIR: '/incoming'
  });
  
  const fileInfo = await connector.fetchStatementFiles(cycleDate, bank);
  const normalized = await connector.parseAndNormalize(fileInfo.localPath, bank);
  
  return normalized;
}
```

---

### **3. Exception Management Workflow** ⚠️ **IMPORTANT**

**V1 Has:**
```sql
-- Complete exception lifecycle
reconciliation_exceptions
├─ Exception creation from recon job
├─ Assignment to ops team members
├─ Investigation workflow
├─ Resolution with reason codes
└─ Approval chain

-- V1 Exception Workflow
1. Auto-created from recon job
2. Classified by severity (LOW/MEDIUM/HIGH/CRITICAL)
3. Assigned to specific team member
4. Investigation notes captured
5. Resolution with standard reason codes
6. Approval by senior ops member
7. Closed with audit trail
```

**V2 Has:**
```javascript
// Basic exception tracking only
recon_unmatched table
├─ reason field (text)
├─ resolution_status
└─ No workflow, no assignment, no approval
```

**What V2 NEEDS:**
```sql
-- Enhanced exception management

CREATE TABLE reconciliation_exceptions (
    id UUID PRIMARY KEY,
    job_id UUID NOT NULL,
    exception_type VARCHAR(50) NOT NULL,
    pg_transaction_id UUID,
    bank_entry_id UUID,
    reason_code VARCHAR(50) NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    
    -- Workflow fields
    status VARCHAR(30) DEFAULT 'OPEN' CHECK (status IN (
        'OPEN', 'ASSIGNED', 'INVESTIGATING', 
        'PENDING_APPROVAL', 'RESOLVED', 'CLOSED'
    )),
    assigned_to VARCHAR(100),
    assigned_at TIMESTAMP,
    
    -- Resolution fields
    resolution_type VARCHAR(50),
    resolution_notes TEXT,
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMP,
    
    -- Approval fields (for high-value exceptions)
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    approval_comments TEXT,
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (job_id) REFERENCES recon_job(job_id),
    FOREIGN KEY (reason_code) REFERENCES exception_reasons(reason_code)
);

-- Exception reason master
CREATE TABLE exception_reasons (
    reason_code VARCHAR(50) PRIMARY KEY,
    reason_label VARCHAR(200) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT,
    auto_resolution_possible BOOLEAN DEFAULT FALSE,
    resolution_template TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Exception workflow history
CREATE TABLE exception_workflow_history (
    id UUID PRIMARY KEY,
    exception_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_status VARCHAR(30),
    new_status VARCHAR(30),
    actor VARCHAR(100) NOT NULL,
    comments TEXT,
    timestamp TIMESTAMP DEFAULT NOW(),
    
    FOREIGN KEY (exception_id) REFERENCES reconciliation_exceptions(id)
);
```

---

### **4. Manual Matching Interface** ⚠️ **IMPORTANT**

**V1 Has:**
```sql
-- Manual match tracking
manual_matches
├─ Created by ops user
├─ PG transaction linked to Bank entry
├─ Justification notes required
├─ Approval workflow
└─ Audit trail

-- V1 Manual Match Workflow
1. Ops user identifies potential match
2. Creates manual link with justification
3. Senior ops approves/rejects
4. Match recorded with confidence = 'MANUAL'
5. Full audit trail maintained
```

**V2 Has:**
```javascript
// No manual matching capability ❌
// All matching is automatic
```

**What V2 NEEDS:**
```javascript
// Manual matching API endpoint

app.post('/recon/manual-match', async (req, res) => {
  const { 
    jobId, 
    pgTransactionId, 
    bankEntryId, 
    justification,
    createdBy 
  } = req.body;
  
  // Validate both records exist
  const pgTxn = await getPGTransaction(pgTransactionId);
  const bankEntry = await getBankEntry(bankEntryId);
  
  if (!pgTxn || !bankEntry) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  // Check for existing matches
  const existingMatch = await checkExistingMatch(pgTransactionId, bankEntryId);
  if (existingMatch) {
    return res.status(409).json({ error: 'Match already exists' });
  }
  
  // Create manual match (pending approval)
  const manualMatch = await createMatch({
    job_id: jobId,
    pg_txn_id: pgTransactionId,
    bank_txn_id: bankEntryId,
    match_type: 'MANUAL',
    confidence_score: null, // Manual matches don't have auto confidence
    matched_by: createdBy,
    justification: justification,
    requires_approval: true,
    approval_status: 'PENDING',
    created_at: new Date()
  });
  
  // Trigger approval workflow
  await notifyApprovers(manualMatch);
  
  res.json({
    success: true,
    matchId: manualMatch.id,
    status: 'PENDING_APPROVAL'
  });
});

// Approval endpoint
app.post('/recon/approve-manual-match/:matchId', async (req, res) => {
  const { matchId } = req.params;
  const { approved, comments, approver } = req.body;
  
  const match = await getMatch(matchId);
  
  if (match.match_type !== 'MANUAL') {
    return res.status(400).json({ error: 'Only manual matches require approval' });
  }
  
  if (approved) {
    // Approve match
    await updateMatch(matchId, {
      approval_status: 'APPROVED',
      approved_by: approver,
      approved_at: new Date(),
      approval_comments: comments
    });
    
    // Update job counters
    await updateJobCounters(match.job_id);
    
  } else {
    // Reject match
    await updateMatch(matchId, {
      approval_status: 'REJECTED',
      rejected_by: approver,
      rejected_at: new Date(),
      rejection_reason: comments
    });
  }
  
  res.json({ success: true });
});
```

---

### **5. Audit Trail & Compliance** ⚠️ **IMPORTANT**

**V1 Has:**
```sql
-- Complete audit logging
recon_job_audit
├─ Every action logged
├─ Old/new values captured
├─ Actor identification
└─ Compliance-ready

-- V1 tracks:
- Job creation/execution
- Match creation/modification
- Exception creation/resolution
- Manual interventions
- Approval actions
- Configuration changes
```

**V2 Has:**
```javascript
// Console.log only ❌
// No persistent audit trail
```

**What V2 NEEDS:**
```sql
-- Comprehensive audit system

CREATE TABLE recon_audit_log (
    id UUID PRIMARY KEY,
    job_id UUID,
    entity_type VARCHAR(50) NOT NULL, -- 'JOB', 'MATCH', 'EXCEPTION', 'CONFIG'
    entity_id UUID,
    action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT'
    old_value JSONB,
    new_value JSONB,
    actor_id VARCHAR(100) NOT NULL,
    actor_ip VARCHAR(45),
    actor_role VARCHAR(50),
    timestamp TIMESTAMP DEFAULT NOW(),
    request_id UUID,
    
    -- Compliance fields
    business_justification TEXT,
    approval_required BOOLEAN DEFAULT FALSE,
    approval_status VARCHAR(20),
    
    INDEX idx_audit_job (job_id),
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_actor (actor_id),
    INDEX idx_audit_timestamp (timestamp)
);

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_recon_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO recon_audit_log (
        entity_type,
        entity_id,
        action,
        old_value,
        new_value,
        actor_id,
        timestamp
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        row_to_json(OLD),
        row_to_json(NEW),
        current_setting('app.current_user', true),
        NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to key tables
CREATE TRIGGER audit_recon_matches
AFTER INSERT OR UPDATE OR DELETE ON recon_match
FOR EACH ROW EXECUTE FUNCTION audit_recon_changes();

CREATE TRIGGER audit_recon_exceptions
AFTER INSERT OR UPDATE OR DELETE ON reconciliation_exceptions
FOR EACH ROW EXECUTE FUNCTION audit_recon_changes();
```

---

## 📊 **Feature Comparison Matrix**

| Feature | V1 (Production) | V2 (Current) | V2 Advantage | Gap Severity |
|---------|----------------|--------------|--------------|--------------|
| **Matching Algorithm** | Simple 2-tier | Advanced 3-tier | ✅ V2 Better | N/A |
| **Confidence Scoring** | Basic | Advanced (0-100) | ✅ V2 Better | N/A |
| **Reason Classification** | ~8 codes | 17 codes | ✅ V2 Better | N/A |
| **Configurable Tolerances** | ❌ Hardcoded | ✅ Per-merchant | ✅ V2 Better | N/A |
| **SabPaisa PG Integration** | ✅ Direct DB | ❌ Mock API | V1 Better | 🔴 CRITICAL |
| **Bank SFTP/API** | ✅ Live connectors | ❌ Mock API | V1 Better | 🔴 CRITICAL |
| **Exception Workflow** | ✅ Full workflow | ❌ Basic tracking | V1 Better | 🟡 HIGH |
| **Manual Matching** | ✅ With approval | ❌ None | V1 Better | 🟡 HIGH |
| **Audit Trail** | ✅ Complete | ❌ Console logs | V1 Better | 🟡 HIGH |
| **Approval Workflow** | ✅ Maker-checker | ❌ None | V1 Better | 🟡 HIGH |
| **Connector Framework** | ❌ Basic | ✅ Advanced | ✅ V2 Better | N/A |
| **File Lineage** | ❌ Basic | ✅ SHA256, PGP | ✅ V2 Better | N/A |
| **Job Orchestration** | ✅ Basic | ✅ Advanced | ✅ V2 Better | N/A |
| **Error Handling** | Basic | Advanced | ✅ V2 Better | N/A |

---

## 🎯 **IMPLEMENTATION ROADMAP**

### **Phase 1: Integration Layer** (Week 1-2) 🔴 **CRITICAL**
```bash
Priority 1: SabPaisa PG Integration
├─ Create SabPaisaPGConnector service
├─ Implement DB query or API integration
├─ Add normalization layer
├─ Test with production data (staging env)
└─ Replace mock-pg-api usage

Priority 2: Bank Connector Integration
├─ Create BankSFTPConnector service
├─ Implement bank-specific file parsers (HDFC, ICICI, AXIS)
├─ Add checksum verification
├─ Test with real bank files
└─ Replace mock-bank-api usage

Priority 3: Database Schema Updates
├─ Add reconciliation_exceptions table
├─ Add exception_reasons master table
├─ Add manual_match_history table
├─ Add recon_audit_log table
└─ Create necessary indexes
```

### **Phase 2: Workflow & UI** (Week 3-4) 🟡 **HIGH**
```bash
Priority 4: Exception Management
├─ Build exception assignment logic
├─ Create investigation workflow
├─ Add resolution templates
├─ Build approval chain
└─ Exception dashboard UI

Priority 5: Manual Matching
├─ Create manual match API endpoints
├─ Build approval workflow
├─ Create manual match UI
├─ Add justification requirement
└─ Implement audit trail

Priority 6: Audit & Compliance
├─ Implement comprehensive audit logging
├─ Create audit trail UI
├─ Add compliance reports
├─ Build data retention policies
└─ Export capabilities
```

### **Phase 3: Production Readiness** (Week 5-6) 🟢 **IMPORTANT**
```bash
Priority 7: Testing & Validation
├─ Integration testing with staging SabPaisa
├─ Real bank file processing tests
├─ Load testing (10K+ transactions/day)
├─ Accuracy validation against V1
└─ UAT with ops team

Priority 8: Monitoring & Alerting
├─ Add performance monitoring
├─ Create reconciliation health dashboard
├─ Set up error alerting
├─ Add SLA tracking
└─ Build reporting

Priority 9: Documentation & Training
├─ API documentation
├─ Ops team training materials
├─ Runbook for common issues
├─ Data dictionary
└─ Rollback procedures
```

---

## 💡 **CRITICAL QUESTIONS FOR YOU**

### **SabPaisa Integration**
1. **How does V1 access SabPaisa PG data?**
   - Direct database query?
   - REST API?
   - Message queue?

2. **What is the SabPaisa production database schema?**
   - Table names for transactions?
   - Primary keys and relationships?
   - Data retention policies?

3. **Authentication mechanism?**
   - Database credentials?
   - API keys?
   - OAuth?

4. **Real-time or batch?**
   - Do you need real-time transaction updates?
   - Or end-of-day batch reconciliation?

### **Bank Integration**
5. **Which banks are integrated in V1?**
   - HDFC, ICICI, AXIS, SBI?
   - SFTP or API?

6. **File formats per bank?**
   - CSV column mappings?
   - Date formats?
   - Amount precision?

7. **File delivery schedule?**
   - When do banks upload files (EOD, T+1)?
   - What happens if file is late/missing?

8. **Credentials & access?**
   - SFTP keys available?
   - API credentials?
   - IP whitelisting required?

---

## 🏆 **CONCLUSION**

### **V2 Reconciliation Engine: The Verdict**

✅ **V2 is BETTER at matching logic** - More sophisticated algorithm, better accuracy

✅ **V2 has BETTER architecture** - Scalable, maintainable, modern tech stack

❌ **V2 is NOT INTEGRATED** - No real SabPaisa or bank connectors

❌ **V2 is NOT PRODUCTION-READY** - Missing critical workflow, audit, approval features

### **Recommended Action**

**DO NOT** replace V1 with V2 yet. Instead:

1. **Keep V1 running** for production reconciliation
2. **Build Phase 1** integration layer in V2 (SabPaisa + Banks)
3. **Run parallel** for 1-2 months to validate accuracy
4. **Gradual migration** - Start with low-value merchants
5. **Full cutover** only after 99.5%+ accuracy achieved

**Estimated Timeline:** 6-8 weeks to production parity

---

## 📂 **File Location**
```bash
/Users/shantanusingh/ops-dashboard/docs/RECON_V1_VS_V2_ANALYSIS.md
```

This analysis gives you the complete picture of what V2 needs to become the best recon engine integrated with SabPaisa production system.