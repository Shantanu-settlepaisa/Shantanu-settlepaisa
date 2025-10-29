# SettlePaisa 2.0 - Project Context
**Purpose:** Permanent reference for the project architecture and key decisions
**Last Updated:** 2025-10-22
**Update Frequency:** Only when architecture/goals fundamentally change

---

## 🎯 System Overview

**Project:** SettlePaisa 2.0 Ops Dashboard
**Purpose:** Payment gateway settlement, reconciliation, and payout automation system
**Previous Version:** V1 (PHP backend) - manual processes
**Current Version:** V2 (Node.js rewrite) - automated workflows

### Tech Stack
- **Backend:** Node.js (Express)
- **Database:** PostgreSQL 14+
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Process Manager:** PM2
- **Deployment:** AWS EC2 + RDS

---

## 🏗️ Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    SettlePaisa 2.0 Stack                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend (React)                Port 5174                  │
│  ├── Ops Dashboard              /ops/*                      │
│  └── Merchant Dashboard          /merchant/*                │
│                                                              │
│  Backend Services:                                          │
│  ├── PG API                      Port 5101                  │
│  ├── Bank API                    Port 5102                  │
│  ├── Recon API                   Port 5103                  │
│  ├── Overview API                Port 5108                  │
│  ├── Upload API                  Port 5109                  │
│  └── Payout Processor            Port 5110 (Phase 2)        │
│                                                              │
│  Database: PostgreSQL                                        │
│  └── settlepaisa_v2                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Architecture

### Critical: Two Transaction Tables (DO NOT CONFUSE!)

| Table | Schema | Use When | DON'T Use When |
|-------|--------|----------|----------------|
| **`sp_v2_transactions`** | BIGSERIAL id, VARCHAR transaction_id, source_type field | ✅ Manual uploads (CSV)<br>✅ Recon workspace<br>✅ File upload API<br>✅ Transaction counts | ❌ Settlement calculations<br>❌ PG webhooks<br>❌ Joined with settlement_items |
| **`sp_v2_transactions_v1`** | UUID id, TEXT pgw_ref, UUID merchant_id | ✅ PG webhook ingestion<br>✅ Settlement processing<br>✅ Reconciliation amounts<br>✅ FK from settlement_items | ❌ Manual uploads<br>❌ Recon workspace<br>❌ File processing |

**WHY Two Tables?**
- V1 used UUID primary keys
- V2 uses BIGSERIAL for better performance
- Incompatible schemas (can't merge without data migration)
- Both needed during transition period

**Decision Rule:**
1. **Is this a file upload/manual operation?** → Use `sp_v2_transactions`
2. **Is this joined with `sp_v2_settlement_items`?** → Use `sp_v2_transactions_v1`
3. **Does it involve webhooks from Razorpay/PayU?** → Use `sp_v2_transactions_v1`
4. **Is it counting transactions?** → Probably `sp_v2_transactions`
5. **Is it calculating settlement amounts?** → Probably `sp_v2_transactions_v1`

### Core Tables

#### Settlement & Reconciliation
- `sp_v2_settlement_batches` - Settlement calculations per merchant/cycle
- `sp_v2_settlement_items` - Line items (FK to `sp_v2_transactions_v1`)
- `sp_v2_settlement_queue` - Processing queue for settlements
- `sp_v2_settlement_bank_transfers` - Payout tracking
- `sp_v2_recon_matches` - Matched PG↔Bank transactions
- `sp_v2_recon_exceptions` - Unmatched transactions

#### Master Data
- `sp_v2_merchant_configs` - Merchant configuration (bank details, fees, etc.)
- `sp_v2_connectors` - Data source configurations (PG APIs, Bank SFTP)
- `sp_v2_connector_runs` - Ingestion run history

#### File Processing
- `sp_v2_file_uploads` - CSV upload tracking
- `sp_v2_payout_files` - NEFT/RTGS/IMPS file tracking (Phase 2)

---

## 🔌 Service Ports & URLs

### Local Development

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| **Frontend** | 5174 | http://localhost:5174 | Main UI (Ops & Merchant dashboards) |
| **PG API** | 5101 | http://localhost:5101 | Mock PG transaction data |
| **Bank API** | 5102 | http://localhost:5102 | Mock bank statement data |
| **Recon API** | 5103 | http://localhost:5103 | Reconciliation engine |
| **Overview API** | 5108 | http://localhost:5108 | Dashboard metrics & overview |
| **Upload API** | 5109 | http://localhost:5109 | File upload processing |
| **Payout Processor** | 5110 | http://localhost:5110 | NEFT/RTGS/IMPS automation (Phase 2) |

**Important:** Frontend ALWAYS runs on port **5174**, NOT 5173

### Staging Environment

- **EC2 Host:** 13.201.179.44
- **RDS Database:** settlepaisa-v2.xxx.rds.amazonaws.com:5432
- **Overview API:** http://13.201.179.44:5108
- **Frontend:** Served via nginx

### Production Environment

- **Status:** Not yet deployed
- **Readiness:** 75% (as of Oct 22, 2025)
- **Target:** 100% by end of Week 5 (Phase 3 complete)

---

## 📂 Project Structure

```
/Users/shantanusingh/ops-dashboard/
├── src/
│   ├── pages/ops/              # Ops dashboard pages
│   │   ├── Overview.tsx
│   │   ├── OverviewSimple.tsx  # Currently active
│   │   ├── SettlementDetails.tsx
│   │   └── Settlements.tsx
│   ├── components/
│   │   ├── Overview/           # Dashboard components
│   │   └── ManualUploadEnhanced.tsx
│   ├── services/
│   │   ├── overview.ts         # fetchOverview() function
│   │   └── report-generator-v2-db.ts
│   └── router.tsx              # Routes config
│
├── services/
│   ├── api/                    # Upload API (port 5109)
│   │   └── file-upload-v2.cjs
│   ├── mock-pg-api/            # Mock PG data (port 5101)
│   ├── mock-bank-api/          # Mock bank data (port 5102)
│   ├── recon-api/              # Reconciliation (port 5103)
│   ├── overview-api/           # Dashboard data (port 5108)
│   │   ├── index.js
│   │   └── settlements.cjs
│   └── settlement-engine/      # Settlement processing
│       ├── settlement-api.cjs
│       ├── settlement-calculator-v1-logic.cjs
│       └── settlement-queue-processor.cjs
│
├── db/
│   └── migrations/             # Database migrations
│
└── Documentation/              # Context & implementation guides
    ├── CLAUDE.md               # Quick reference
    ├── PROJECT_CONTEXT.md      # This file
    ├── CONVERSATION_HISTORY.md
    ├── KNOWN_ISSUES_AND_WORKAROUNDS.md
    └── Implementation Guides/
        ├── OPS_DASHBOARD_PRODUCTION_READINESS_COMPLETE.md
        ├── PHASE1_CRITICAL_FIXES_IMPLEMENTATION_GUIDE.md
        ├── PAYOUT_AUTOMATION_TECHNICAL_DESIGN.md
        └── BANK_FILE_FORMAT_SPECIFICATIONS.md
```

---

## 🔑 Key Architectural Decisions

### Decision 1: Separate Transaction Tables

**When:** V2 initial architecture
**Why:** V1 used UUID, V2 uses BIGSERIAL - incompatible
**Impact:** Must be careful which table to query
**Reference:** CLAUDE.md lines 79-117

### Decision 2: Settlement Types (Automatic, On-Demand, Instant)

**When:** Oct 2025 (Phase 1 design)
**Why:** Industry standard (Razorpay/Stripe have instant settlements)
**Impact:** Priority queue, SLA monitoring, dynamic fees
**Implementation:** Phase 1 Day 1 Afternoon

### Decision 3: NEFT/RTGS/IMPS File Automation

**When:** Oct 2025 (Phase 2 design)
**Why:** V1 had manual payouts (no automation), V2 needs full automation
**Impact:** SFTP integration, file generation, bank response polling
**Implementation:** Phase 2 (Week 2-3)

### Decision 4: Chargeback/Refund Deduction

**When:** Oct 2025 (Phase 1 design)
**Why:** Critical for financial accuracy (merchants can't be over-credited)
**Impact:** Settlement calculator queries sp_v2_chargebacks and sp_v2_refunds
**Implementation:** Phase 1 Day 1 Morning

---

## ⚠️ Important Constraints & Rules

### File Format Constraints

#### NEFT/RTGS Files
- **Format:** Fixed-width ASCII text
- **Record Length:** MUST be exactly 135 characters (excluding CRLF)
- **Line Ending:** MUST use CRLF (`\r\n`), NOT just LF (`\n`)
- **Encoding:** ASCII only (NOT UTF-8 with BOM)
- **Max Transactions:** 100 per file (NEFT), 50 per file (RTGS recommended)

#### IMPS Files
- **Format:** ISO 20022 XML (pain.001.001.03)
- **Encoding:** UTF-8 with XML declaration
- **Max Amount:** ₹2,00,000 per transaction
- **Max Transactions:** 100 per file (NPCI limit)

### Transfer Mode Constraints

| Mode | Min Amount | Max Amount | Availability | Typical SLA |
|------|-----------|-----------|--------------|-------------|
| **NEFT** | ₹1 | No limit | Mon-Sat, 8 AM - 7 PM | 2-4 hours |
| **RTGS** | ₹2,00,000 | No limit | Mon-Fri, 9 AM - 4:30 PM | 30 minutes |
| **IMPS** | ₹1 | ₹2,00,000 | 24x7 (including holidays) | 15 minutes |

### Database Constraints

1. **NEVER merge `sp_v2_transactions` and `sp_v2_transactions_v1`**
   - Incompatible schemas
   - Different FK constraints
   - Requires full data migration plan

2. **Settlement items MUST reference `sp_v2_transactions_v1`**
   - FK constraint enforced
   - Can't use `sp_v2_transactions` for settlements

3. **Manual uploads MUST use `sp_v2_transactions`**
   - File upload API populates this table
   - Recon workspace reads from this table

---

## 🔐 Credentials & Configuration

### Local Database
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=settlepaisa_v2
DB_USER=postgres
DB_PASSWORD=settlepaisa123
```

### Staging Database (RDS)
```bash
DB_HOST=settlepaisa-v2.xxx.rds.amazonaws.com
DB_PORT=5432
DB_NAME=settlepaisa_v2
DB_USER=admin
DB_PASSWORD=<stored in .env>
```

### SFTP Credentials (Phase 2)
```bash
# Stored in .env, NEVER commit to git
HDFC_SFTP_HOST=sftp.hdfcbank.com
HDFC_SFTP_USER=sabpaisa_prod
HDFC_SFTP_PASSWORD=<encrypted>
HDFC_SFTP_KEY_PATH=/secure/keys/hdfc_rsa_key
```

---

## 🚀 Startup Commands

### Start All Services (Local)

```bash
# Start backend services
./start-services.sh

# Start frontend (always port 5174)
npm run dev -- --port 5174

# Or run in background
npm run dev -- --port 5174 > /tmp/vite.log 2>&1 &
```

### Check Running Services

```bash
# Check if services are running
ps aux | grep node

# Check specific port
lsof -i :5108

# Kill service on port
lsof -ti:5108 | xargs kill -9
```

### Database Access

```bash
# Local
psql -U postgres -d settlepaisa_v2

# Staging
psql -h settlepaisa-v2.xxx.rds.amazonaws.com -U admin -d settlepaisa_v2
```

---

## 📊 Current Production Readiness

**As of:** October 22, 2025
**Status:** 75% ready

### ✅ What V2 Has (That V1 Didn't)
- Settlement batches with approval workflow
- Bank transfer tracking table
- NEFT/RTGS/IMPS mode selection
- Reconciliation engine with exceptions
- File upload processing
- Dashboard with real-time metrics

### ❌ What V2 Still Needs
- Chargeback/refund deduction (Phase 1 Day 1)
- Instant settlement intelligence (Phase 1 Day 1)
- Auto-approval bug fix (Phase 1 Day 2)
- NEFT/RTGS/IMPS file generation (Phase 2)
- SFTP integration (Phase 2)
- Payout automation (Phase 2)

### 📈 Roadmap to 100%
- **Phase 1** (Week 1): 75% → 85-90%
- **Phase 2** (Week 2-3): 85-90% → 95%
- **Phase 3** (Week 4-5): 95% → 100%

**Reference:** See `OPS_DASHBOARD_PRODUCTION_READINESS_COMPLETE.md`

---

## 🎓 Key Learnings & Best Practices

### From V1 Analysis
1. **V1 had manual payouts** - Just marked `is_payout_done='1'`, no bank automation
2. **V1 had 4 settlement models** - Standard, subscription, fee bearer, subvention
3. **V1 used PHP** - V2 rewrite in Node.js for better performance

### Development Best Practices
1. **Always check which transaction table** - Most bugs come from using wrong table
2. **Test with real data** - Mock data hides edge cases
3. **Validate file formats** - Banks reject files with wrong encoding/line endings
4. **Log everything** - Payout operations need full audit trail

### Deployment Best Practices
1. **Run migrations in transaction** - Always use BEGIN/COMMIT
2. **Test on staging first** - Never deploy directly to production
3. **Keep PM2 logs** - `/tmp/*.log` files for debugging
4. **Monitor SFTP uploads** - Banks can silently drop files

---

## 📞 Team Contacts & Resources

### Internal Documentation
- **This File:** PROJECT_CONTEXT.md (permanent reference)
- **History:** CONVERSATION_HISTORY.md (what we've built)
- **Issues:** KNOWN_ISSUES_AND_WORKAROUNDS.md (current bugs)
- **Quick Ref:** CLAUDE.md (port numbers, table guide)

### External Resources
- **NEFT/RTGS Spec:** SFMS documentation (bank provided)
- **IMPS Spec:** ISO 20022 pain.001.001.03 standard
- **NPCI Docs:** https://www.npci.org.in/what-we-do/imps

---

## 🔄 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-22 | Initial creation - project context documented |

---

**Maintained By:** SettlePaisa Engineering Team
**For Questions:** See CONVERSATION_HISTORY.md for implementation details
**For Bugs:** See KNOWN_ISSUES_AND_WORKAROUNDS.md
