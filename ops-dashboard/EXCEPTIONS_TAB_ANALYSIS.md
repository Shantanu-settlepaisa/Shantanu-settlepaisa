# Exceptions Tab - Complete Analysis & Gap Report

**Date**: 2025-10-02  
**Version**: v2.4.0  
**Analyst**: Claude Code

---

## 📊 CURRENT IMPLEMENTATION STATUS

### ✅ **What's Implemented (Frontend)**

1. **Exception Command Center UI** (`src/pages/ops/Exceptions.tsx`)
   - KPI tiles (Open, Investigating, Snoozed, SLA Breached, Resolved 7d, Last 24h Inflow)
   - Saved Views dropdown
   - Search by ID, transaction, UTR
   - Filter panel
   - Bulk actions modal
   - Export modal (CSV/XLSX)
   - Exception drawer with 3 tabs (Details, Timeline, Data)

2. **Exception Types System** (`src/types/exceptions.ts`)
   - Status: open, investigating, snoozed, resolved, wont_fix, escalated
   - Severity: low, medium, high, critical
   - Reasons: AMOUNT_MISMATCH, DATE_MISMATCH, FEE_MISMATCH, BANK_FILE_AWAITED, PG_ONLY, BANK_ONLY, DUPLICATE, REFUND_PENDING, MISSING_UTR, STATUS_MISMATCH, MERCHANT_MISMATCH
   - Bulk Actions: assign, investigate, resolve, wont_fix, snooze, escalate, tag, reprocess
   - SLA configs with default hours to resolve per severity

3. **Exception Drawer Actions**
   - Investigate (change status to investigating)
   - Snooze (set snooze date)
   - Resolve (mark as RECONCILED) ✅ **CONNECTED TO REAL API**
   - Reprocess (re-run reconciliation logic)

### ✅ **What's Implemented (Backend API)**

**Route**: `/exceptions` (port 5103)

1. **GET /exceptions** - List all exceptions
   - Filters: status, severity, merchantId, dateFrom, dateTo
   - Pagination: limit, offset
   - Source: `sp_v2_transactions` WHERE status='EXCEPTION'

2. **GET /exceptions/:id** - Get single exception details
   - Joins with `sp_v2_bank_statements` on UTR
   - Returns PG + Bank data

3. **POST /exceptions/:id/resolve** - Resolve exception
   - Updates transaction status from EXCEPTION → RECONCILED
   - Returns updated transaction

4. **POST /exceptions/manual-match** - Manually link PG with Bank
   - Updates PG transaction to RECONCILED
   - Marks bank statement as processed
   - Creates match record in `sp_v2_recon_matches`
   - **USES TRANSACTION** (BEGIN/COMMIT/ROLLBACK)

5. **POST /exceptions/bulk-resolve** - Bulk resolve
   - Updates multiple transactions to RECONCILED
   - Uses `WHERE id = ANY($1)` for efficiency

### ✅ **What's Implemented (Database)**

**Current Schema**:

1. **sp_v2_transactions** (Main table)
   ```sql
   - id (PRIMARY KEY)
   - transaction_id
   - merchant_id
   - amount_paise
   - status ('RECONCILED', 'EXCEPTION', 'PENDING')
   - source_type ('MANUAL_UPLOAD', 'CONNECTOR', 'API')
   - utr, rrn
   - created_at, updated_at
   ```

2. **sp_v2_exception_reasons** (Reference table)
   ```sql
   - reason_code (UNIQUE)
   - reason_label
   - description
   - default_severity ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')
   - is_active
   ```

3. **sp_v2_exceptions_summary** (Dashboard aggregates)
   ```sql
   - summary_date
   - reason_code
   - severity
   - exception_count
   - total_amount_paise
   - manual_upload_count, connector_count
   - UNIQUE(summary_date, reason_code, severity)
   ```

4. **sp_v2_recon_matches** (Match records)
   ```sql
   - item_id (PG transaction ID)
   - utr_id (Bank statement ID)
   - match_type ('AUTO', 'MANUAL')
   - matched_by
   - match_score
   - amount_difference_paise
   ```

---

## ❌ **CRITICAL GAPS - WHAT'S MISSING**

### 🚨 **GAP #1: No Dedicated Exception Tracking Table**

**Problem**: Currently exceptions are tracked in `sp_v2_transactions` with `status='EXCEPTION'`, but there's NO dedicated exception management table.

**What You Need**:
```sql
CREATE TABLE sp_v2_exception_workflow (
    id BIGSERIAL PRIMARY KEY,
    exception_id VARCHAR(50) NOT NULL UNIQUE,  -- EXC_20251002_001
    transaction_id BIGINT NOT NULL REFERENCES sp_v2_transactions(id),
    bank_statement_id BIGINT REFERENCES sp_v2_bank_statements(id),
    
    -- Classification
    reason VARCHAR(50) NOT NULL,  -- AMOUNT_MISMATCH, etc.
    severity VARCHAR(20) NOT NULL,  -- CRITICAL, HIGH, MEDIUM, LOW
    status VARCHAR(20) NOT NULL DEFAULT 'open',  -- open, investigating, snoozed, resolved, wont_fix, escalated
    
    -- Workflow fields
    assigned_to VARCHAR(100),
    assigned_to_name VARCHAR(255),
    assigned_at TIMESTAMP WITH TIME ZONE,
    tags TEXT[],  -- Array of tags
    
    -- SLA tracking
    sla_due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    sla_breached BOOLEAN DEFAULT FALSE,
    last_transition_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Snooze
    snooze_until TIMESTAMP WITH TIME ZONE,
    snoozed_by VARCHAR(100),
    snooze_reason TEXT,
    
    -- Resolution
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100),
    resolution VARCHAR(50),  -- MANUAL_MATCH, AUTO_CORRECTED, ACCOUNTING_ADJUSTMENT, WONT_FIX
    resolution_note TEXT,
    
    -- Variance tracking
    pg_amount_paise BIGINT,
    bank_amount_paise BIGINT,
    amount_delta_paise BIGINT,
    
    -- Source tracking
    source_job_id VARCHAR(100),
    rule_applied VARCHAR(100),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_exception_status (status),
    INDEX idx_exception_severity (severity),
    INDEX idx_exception_reason (reason),
    INDEX idx_exception_sla (sla_due_at, sla_breached),
    INDEX idx_exception_assigned (assigned_to),
    INDEX idx_exception_created (created_at DESC)
);
```

**Why This Matters**: Without this table, you can't track:
- Who worked on which exception
- When status changed from open → investigating → resolved
- SLA breach history
- Assignment history
- Snooze history

---

### 🚨 **GAP #2: No Exception Activity/Timeline Table**

**Problem**: When an Ops user resolves an exception, there's NO audit trail or timeline.

**What You Need**:
```sql
CREATE TABLE sp_v2_exception_actions (
    id BIGSERIAL PRIMARY KEY,
    exception_id VARCHAR(50) NOT NULL REFERENCES sp_v2_exception_workflow(exception_id),
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(255),
    action VARCHAR(50) NOT NULL,  -- CREATED, ASSIGNED, INVESTIGATED, RESOLVED, SNOOZED, etc.
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- State changes
    before_status VARCHAR(20),
    after_status VARCHAR(20),
    before_severity VARCHAR(20),
    after_severity VARCHAR(20),
    before_assigned_to VARCHAR(100),
    after_assigned_to VARCHAR(100),
    
    -- Action details
    note TEXT,
    metadata JSONB,  -- Flexible storage for action-specific data
    
    -- Index
    INDEX idx_exception_action_exception (exception_id, timestamp DESC),
    INDEX idx_exception_action_user (user_id, timestamp DESC)
);
```

**Why This Matters**: Without this table, you can't:
- Show timeline in Exception Drawer
- Audit who did what and when
- Track average resolution time
- Identify which users are most active
- Generate compliance reports

---

### 🚨 **GAP #3: No Database Triggers for Status Updates**

**Your Requirement**: "All the tables which are interlinked with each other must work on triggers and update the status or column accordingly."

**What You Need**:

#### **Trigger 1: Auto-create exception workflow record when transaction marked EXCEPTION**
```sql
CREATE OR REPLACE FUNCTION fn_create_exception_workflow()
RETURNS TRIGGER AS $$
BEGIN
    -- Only fire when status changes TO 'EXCEPTION'
    IF NEW.status = 'EXCEPTION' AND (OLD.status IS NULL OR OLD.status != 'EXCEPTION') THEN
        INSERT INTO sp_v2_exception_workflow (
            exception_id,
            transaction_id,
            reason,
            severity,
            status,
            pg_amount_paise,
            sla_due_at,
            created_at
        ) VALUES (
            'EXC_' || TO_CHAR(NOW(), 'YYYYMMDD') || '_' || LPAD(nextval('exception_seq')::TEXT, 6, '0'),
            NEW.id,
            COALESCE(NEW.exception_reason, 'AMOUNT_MISMATCH'),  -- Default reason
            'MEDIUM',  -- Default severity, can be updated by rules
            'open',
            NEW.amount_paise,
            NOW() + INTERVAL '24 hours',  -- Default SLA
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_exception_workflow
    AFTER INSERT OR UPDATE ON sp_v2_transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_create_exception_workflow();
```

#### **Trigger 2: Update sp_v2_exceptions_summary on exception creation**
```sql
CREATE OR REPLACE FUNCTION fn_update_exception_summary()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'open' THEN
        -- Increment summary counts
        INSERT INTO sp_v2_exceptions_summary (
            summary_date,
            reason_code,
            severity,
            exception_count,
            total_amount_paise,
            manual_upload_count,
            connector_count
        ) VALUES (
            CURRENT_DATE,
            NEW.reason,
            NEW.severity,
            1,
            ABS(NEW.amount_delta_paise),
            CASE WHEN (SELECT source_type FROM sp_v2_transactions WHERE id = NEW.transaction_id) = 'MANUAL_UPLOAD' THEN 1 ELSE 0 END,
            CASE WHEN (SELECT source_type FROM sp_v2_transactions WHERE id = NEW.transaction_id) = 'CONNECTOR' THEN 1 ELSE 0 END
        )
        ON CONFLICT (summary_date, reason_code, severity) DO UPDATE SET
            exception_count = sp_v2_exceptions_summary.exception_count + 1,
            total_amount_paise = sp_v2_exceptions_summary.total_amount_paise + EXCLUDED.total_amount_paise,
            manual_upload_count = sp_v2_exceptions_summary.manual_upload_count + EXCLUDED.manual_upload_count,
            connector_count = sp_v2_exceptions_summary.connector_count + EXCLUDED.connector_count,
            last_updated = NOW();
    ELSIF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
        -- Decrement summary counts when resolved
        UPDATE sp_v2_exceptions_summary
        SET exception_count = exception_count - 1,
            last_updated = NOW()
        WHERE summary_date = CURRENT_DATE
          AND reason_code = NEW.reason
          AND severity = NEW.severity;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_exception_summary
    AFTER INSERT OR UPDATE ON sp_v2_exception_workflow
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_exception_summary();
```

#### **Trigger 3: Log all exception actions to timeline**
```sql
CREATE OR REPLACE FUNCTION fn_log_exception_action()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO sp_v2_exception_actions (
        exception_id,
        user_id,
        user_name,
        action,
        timestamp,
        before_status,
        after_status,
        before_severity,
        after_severity,
        before_assigned_to,
        after_assigned_to
    ) VALUES (
        NEW.exception_id,
        COALESCE(NEW.resolved_by, NEW.assigned_to, 'SYSTEM'),
        COALESCE(NEW.assigned_to_name, 'System'),
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'CREATED'
            WHEN OLD.status != NEW.status THEN 'STATUS_CHANGED'
            WHEN OLD.severity != NEW.severity THEN 'SEVERITY_CHANGED'
            WHEN OLD.assigned_to != NEW.assigned_to THEN 'ASSIGNED'
            ELSE 'UPDATED'
        END,
        NOW(),
        OLD.status,
        NEW.status,
        OLD.severity,
        NEW.severity,
        OLD.assigned_to,
        NEW.assigned_to
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_exception_action
    AFTER INSERT OR UPDATE ON sp_v2_exception_workflow
    FOR EACH ROW
    EXECUTE FUNCTION fn_log_exception_action();
```

#### **Trigger 4: Sync transaction status when exception resolved**
```sql
CREATE OR REPLACE FUNCTION fn_sync_transaction_status()
RETURNS TRIGGER AS $$
BEGIN
    -- When exception is resolved, update transaction to RECONCILED
    IF NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status != 'resolved') THEN
        UPDATE sp_v2_transactions
        SET status = 'RECONCILED',
            updated_at = NOW()
        WHERE id = NEW.transaction_id;
    END IF;
    
    -- When exception is reopened, set transaction back to EXCEPTION
    IF NEW.status IN ('open', 'investigating') AND OLD.status = 'resolved' THEN
        UPDATE sp_v2_transactions
        SET status = 'EXCEPTION',
            updated_at = NOW()
        WHERE id = NEW.transaction_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_transaction_status
    AFTER UPDATE ON sp_v2_exception_workflow
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_transaction_status();
```

---

### 🚨 **GAP #4: No Exception Rules Engine**

**Problem**: You have the type definition for `ExceptionRule` but no backend implementation.

**What You Need**:

```sql
CREATE TABLE sp_v2_exception_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,  -- Lower number = higher priority
    enabled BOOLEAN DEFAULT TRUE,
    
    -- Scope (when to apply this rule)
    scope_reason_codes TEXT[],  -- ['AMOUNT_MISMATCH', 'FEE_MISMATCH']
    scope_amount_delta_gt BIGINT,  -- Greater than (in paise)
    scope_amount_delta_lt BIGINT,  -- Less than (in paise)
    scope_age_gt INTEGER,  -- Age greater than (hours)
    scope_age_lt INTEGER,  -- Age less than (hours)
    scope_acquirers TEXT[],
    scope_merchants TEXT[],
    scope_tags_includes TEXT[],
    scope_tags_excludes TEXT[],
    scope_status TEXT[],
    scope_severity TEXT[],
    
    -- Actions (what to do when rule matches)
    actions JSONB NOT NULL,  -- [{"type": "assign", "params": {"assignTo": "user@example.com"}}, {"type": "setSeverity", "params": {"severity": "high"}}]
    
    -- Metadata
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_applied_at TIMESTAMP WITH TIME ZONE,
    applied_count INTEGER DEFAULT 0,
    
    INDEX idx_rule_priority (priority, enabled)
);
```

**Backend Service**: `services/recon-api/exception-rules-engine.js`
```javascript
async function applyRulesToException(exceptionId) {
  const rules = await pool.query(`
    SELECT * FROM sp_v2_exception_rules
    WHERE enabled = true
    ORDER BY priority ASC
  `);
  
  const exception = await pool.query(`
    SELECT * FROM sp_v2_exception_workflow WHERE exception_id = $1
  `, [exceptionId]);
  
  for (const rule of rules.rows) {
    if (matchesScope(exception.rows[0], rule)) {
      await applyActions(exceptionId, rule.actions);
      await pool.query(`
        UPDATE sp_v2_exception_rules
        SET last_applied_at = NOW(), applied_count = applied_count + 1
        WHERE id = $1
      `, [rule.id]);
    }
  }
}
```

---

### 🚨 **GAP #5: No Saved Views Implementation**

**Problem**: Frontend expects saved views API, but it doesn't exist.

**What You Need**:
```sql
CREATE TABLE sp_v2_exception_saved_views (
    id SERIAL PRIMARY KEY,
    view_name VARCHAR(255) NOT NULL,
    description TEXT,
    query JSONB NOT NULL,  -- {"status": ["open"], "severity": ["high", "critical"]}
    owner_id VARCHAR(100) NOT NULL,
    owner_name VARCHAR(255),
    shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    use_count INTEGER DEFAULT 0,
    
    INDEX idx_saved_view_owner (owner_id)
);
```

**Backend API**: Add to `services/recon-api/routes/exceptions.js`
```javascript
// GET /exceptions/saved-views
router.get('/saved-views', async (req, res) => {
  const { userId } = req.query;
  const result = await pool.query(`
    SELECT * FROM sp_v2_exception_saved_views
    WHERE owner_id = $1 OR shared = true
    ORDER BY use_count DESC, updated_at DESC
  `, [userId]);
  
  res.json({ success: true, data: result.rows });
});

// POST /exceptions/saved-views
router.post('/saved-views', async (req, res) => {
  const { name, description, query, ownerId, ownerName, shared } = req.body;
  const result = await pool.query(`
    INSERT INTO sp_v2_exception_saved_views (view_name, description, query, owner_id, owner_name, shared)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [name, description, JSON.stringify(query), ownerId, ownerName, shared]);
  
  res.json({ success: true, data: result.rows[0] });
});
```

---

### 🚨 **GAP #6: No SLA Auto-calculation**

**Problem**: SLA due dates are hardcoded. You need automatic calculation based on severity + reason.

**What You Need**:

**Function to calculate SLA**:
```sql
CREATE OR REPLACE FUNCTION fn_calculate_sla(
    p_reason VARCHAR,
    p_severity VARCHAR,
    p_created_at TIMESTAMP WITH TIME ZONE
) RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    sla_hours INTEGER;
BEGIN
    -- Default SLA hours by severity
    sla_hours := CASE p_severity
        WHEN 'CRITICAL' THEN 4
        WHEN 'HIGH' THEN 8
        WHEN 'MEDIUM' THEN 24
        WHEN 'LOW' THEN 48
        ELSE 24
    END;
    
    -- Adjust by reason (can be overridden with config table)
    IF p_reason = 'AMOUNT_MISMATCH' AND p_severity = 'CRITICAL' THEN
        sla_hours := 2;  -- Critical amount mismatches need 2hr SLA
    END IF;
    
    RETURN p_created_at + (sla_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;
```

**Update trigger to use this function**:
```sql
-- In fn_create_exception_workflow():
sla_due_at = fn_calculate_sla(
    COALESCE(NEW.exception_reason, 'AMOUNT_MISMATCH'),
    'MEDIUM',
    NOW()
)
```

---

### 🚨 **GAP #7: No Export Implementation**

**Problem**: Export modal exists but no backend to generate CSV/XLSX.

**What You Need**:

Add to `services/recon-api/routes/exceptions.js`:
```javascript
const { Parser } = require('json2csv');

router.post('/export', async (req, res) => {
  const { query, format, template } = req.body;
  
  // Build SQL from query filters
  let sql = `
    SELECT 
      ew.exception_id,
      ew.reason,
      ew.severity,
      ew.status,
      t.transaction_id,
      t.merchant_id,
      t.amount_paise,
      ew.amount_delta_paise,
      t.utr,
      ew.assigned_to_name,
      ew.sla_due_at,
      ew.created_at,
      ew.resolved_at
    FROM sp_v2_exception_workflow ew
    JOIN sp_v2_transactions t ON ew.transaction_id = t.id
    WHERE 1=1
  `;
  
  const params = [];
  let paramIndex = 1;
  
  if (query.status) {
    sql += ` AND ew.status = ANY($${paramIndex})`;
    params.push(query.status);
    paramIndex++;
  }
  
  // ... add more filters ...
  
  const result = await pool.query(sql, params);
  
  // Convert to CSV
  const parser = new Parser();
  const csv = parser.parse(result.rows);
  
  // Store to S3 or return directly
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=exceptions_export_${Date.now()}.csv`);
  res.send(csv);
});
```

---

## 🎯 **RECOMMENDED IMPLEMENTATION PRIORITY**

### **Phase 1: Critical Database Foundation** (Week 1)
1. ✅ Create `sp_v2_exception_workflow` table
2. ✅ Create `sp_v2_exception_actions` table  
3. ✅ Create exception sequence: `CREATE SEQUENCE exception_seq START 1;`
4. ✅ Create trigger: Auto-create exception workflow from transactions
5. ✅ Create trigger: Sync transaction status when exception resolved
6. ✅ Create trigger: Log all actions to timeline

### **Phase 2: Backend API Enhancement** (Week 1-2)
1. ✅ Update `/exceptions` GET to query `sp_v2_exception_workflow` instead of transactions
2. ✅ Add `/exceptions/:id/assign` endpoint
3. ✅ Add `/exceptions/:id/investigate` endpoint
4. ✅ Add `/exceptions/:id/snooze` endpoint
5. ✅ Update `/exceptions/:id/resolve` to write to workflow table + create action record
6. ✅ Add `/exceptions/saved-views` CRUD endpoints
7. ✅ Add `/exceptions/export` endpoint

### **Phase 3: Rules Engine** (Week 2-3)
1. ✅ Create `sp_v2_exception_rules` table
2. ✅ Create rules engine service
3. ✅ Add `/exception-rules` CRUD endpoints
4. ✅ Create trigger to auto-apply rules on exception creation
5. ✅ Add manual "Re-apply Rules" button in UI

### **Phase 4: SLA & Monitoring** (Week 3-4)
1. ✅ Create SLA calculation function
2. ✅ Create SLA breach detection cron job
3. ✅ Add SLA breach notifications
4. ✅ Create `/exceptions/sla-report` endpoint
5. ✅ Add SLA metrics to Overview dashboard

---

## 🔍 **KEY INSIGHTS FROM YOUR REQUIREMENT**

> "This tab is one place of getting all the exception from every recon run and then Ops teams will fix it from here."

**What This Means**:
- ✅ All exceptions should flow into `sp_v2_exception_workflow` regardless of source (Manual Upload, Connector, API)
- ✅ Ops team should have ONE central place to manage all exceptions (current UI design supports this)

> "The exception will would be fixed will be updated here and those shall be update in the recon database also."

**What This Means**:
- ✅ When exception status changes in `sp_v2_exception_workflow`, it MUST trigger update in `sp_v2_transactions`
- ✅ This is a **bidirectional sync** requirement - needs triggers on BOTH tables

> "All the tables which are interlinked with each other must work on triggers and update the status or column accordingly."

**What This Means**:
- ✅ You need **4 core triggers** (listed in Gap #3)
- ✅ Overview dashboard should auto-refresh when exceptions are resolved (invalidate React Query cache)
- ✅ Exception summary counts should update in real-time

---

## 📋 **WHAT'S MISSING - SUMMARY CHECKLIST**

### Database Layer
- [ ] `sp_v2_exception_workflow` table (primary exception tracking)
- [ ] `sp_v2_exception_actions` table (audit trail/timeline)
- [ ] `sp_v2_exception_rules` table (auto-assignment rules)
- [ ] `sp_v2_exception_saved_views` table (filter presets)
- [ ] Exception sequence generator
- [ ] 4 core triggers (create, sync, log, summary update)
- [ ] SLA calculation function
- [ ] SLA breach detection function

### Backend API Layer
- [ ] Exception workflow CRUD endpoints
- [ ] Exception action logging
- [ ] Saved views CRUD
- [ ] Rules engine CRUD
- [ ] Export to CSV/XLSX
- [ ] Bulk operations (assign, tag, snooze)
- [ ] Timeline API (get action history)
- [ ] SLA metrics API

### Frontend Layer
- [ ] Connect drawer timeline tab to real API (currently shows mock data)
- [ ] Connect saved views dropdown to real API (currently shows empty)
- [ ] Connect bulk actions to real API
- [ ] Connect export to real API
- [ ] Add real-time updates (WebSocket or polling)
- [ ] Add exception assignment dropdown
- [ ] Add tag management UI
- [ ] Add snooze date picker (currently not functional)

### Business Logic
- [ ] Auto-severity assignment based on amount delta
- [ ] Auto-assignment rules (e.g., all HDFC exceptions → User A)
- [ ] SLA breach notifications (email/Slack)
- [ ] Exception aging reports
- [ ] Resolution time metrics
- [ ] User performance dashboard

---

## ✅ **WHAT'S WORKING WELL**

1. **Exception Persistence**: All exceptions (including amount mismatches) are now properly saved to `sp_v2_transactions` with status='EXCEPTION' ✅
2. **Manual Resolution**: The "Resolve" button in drawer successfully updates transaction to RECONCILED ✅
3. **UI Design**: The Exception Command Center design is enterprise-grade with all necessary components ✅
4. **Type Safety**: Comprehensive TypeScript types for all exception operations ✅
5. **Bulk Operations**: Infrastructure for bulk actions exists (just needs backend wiring) ✅

---

## 🎨 **BONUS SUGGESTIONS**

### 1. **Exception Auto-healing**
Add ML-based suggestion system:
```sql
CREATE TABLE sp_v2_exception_ml_suggestions (
    id BIGSERIAL PRIMARY KEY,
    exception_id VARCHAR(50) REFERENCES sp_v2_exception_workflow(exception_id),
    suggestion_type VARCHAR(50),  -- LIKELY_MATCH, DUPLICATE, FALSE_POSITIVE
    confidence_score DECIMAL(5,2),  -- 0.00 to 1.00
    suggested_action VARCHAR(50),
    suggested_bank_statement_id BIGINT,
    reasoning TEXT,
    applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. **Exception Chat/Comments**
Allow team collaboration:
```sql
CREATE TABLE sp_v2_exception_comments (
    id BIGSERIAL PRIMARY KEY,
    exception_id VARCHAR(50) REFERENCES sp_v2_exception_workflow(exception_id),
    user_id VARCHAR(100),
    user_name VARCHAR(255),
    comment TEXT NOT NULL,
    mentions TEXT[],  -- [@user1, @user2]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3. **Exception Templates**
For common resolution patterns:
```sql
CREATE TABLE sp_v2_exception_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(255),
    reason VARCHAR(50),
    resolution_steps TEXT[],  -- ["Verify UTR with bank", "Check settlement date", "Approve manual match"]
    auto_apply_rules JSONB,
    created_by VARCHAR(100),
    use_count INTEGER DEFAULT 0
);
```

---

## 🚀 **NEXT STEPS**

1. **Immediate** (Today):
   - Create `sp_v2_exception_workflow` table
   - Create `sp_v2_exception_actions` table
   - Add basic triggers (auto-create workflow, sync status)

2. **This Week**:
   - Wire up Exception Drawer timeline tab to real data
   - Add assign/investigate/snooze endpoints
   - Test full exception lifecycle (create → investigate → resolve)

3. **Next Week**:
   - Implement saved views
   - Add export functionality
   - Create rules engine foundation

4. **Within Month**:
   - SLA tracking and breach detection
   - Performance metrics dashboard
   - User assignment workflows

---

**Would you like me to start implementing any of these missing pieces? Which phase should we tackle first?**
