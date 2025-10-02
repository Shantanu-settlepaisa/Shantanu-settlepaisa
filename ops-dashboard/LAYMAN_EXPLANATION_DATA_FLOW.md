# Data Flow Explained in Simple Terms
## Manual Upload vs Connectors vs Analytics

**Date:** October 2, 2025  
**Audience:** Non-technical stakeholders

---

## 🎯 The Big Picture (Simple Version)

Think of your settlement system like a **restaurant**:

| Concept | Restaurant Analogy | SettlePaisa Reality |
|---------|-------------------|---------------------|
| **Manual Upload** | Customer walks in with order | Ops team uploads CSV files |
| **Connector** | Food delivery app (Swiggy/Zomato) | Automated data fetching |
| **Analytics** | Kitchen dashboard showing orders | Settlement Analytics UI |

---

## 📤 Method 1: Manual Upload (Current - Working)

### **What Happens:**

```
Step 1: Ops Team Gets Files
├─ Bank sends email with CSV file
├─ PG sends CSV download link
└─ Ops downloads to computer

Step 2: Ops Opens Dashboard
├─ Goes to http://localhost:5174/ops/recon-workspace
└─ Sees "Upload Files" button

Step 3: Uploads Files
├─ Clicks "Choose Files"
├─ Selects: bank_statement.csv, pg_transactions.csv
├─ Clicks "Upload"
└─ System saves to database

Step 4: Data Available
├─ Files processed and inserted into sp_v2_transactions
├─ Shows up in dashboard
└─ Ready for reconciliation
```

### **Real Example:**

```
Monday 9 AM:
Ops receives email from HDFC Bank
├─ Subject: "Settlement file for Oct 1, 2025"
├─ Attachment: HDFC_SETTLE_2025-10-01.csv
└─ Contains: 1,500 transactions, ₹45 lakhs

Ops Person:
1. Downloads file
2. Opens SettlePaisa dashboard
3. Clicks "Upload Bank File"
4. Selects HDFC_SETTLE_2025-10-01.csv
5. Clicks Submit

System:
├─ Reads CSV (1,500 rows)
├─ Validates data
├─ Inserts into sp_v2_transactions
└─ Shows success: "1,500 transactions uploaded"

Result:
✅ Data now in database
✅ Visible in analytics
✅ Ready for reconciliation
```

### **Problems with Manual Upload:**

❌ **Slow** - Someone has to do it manually  
❌ **Error-Prone** - Can upload wrong file  
❌ **Delayed** - Depends on when ops team checks email  
❌ **Not Scalable** - What if 10 banks, 100 merchants?  

---

## 🔌 Method 2: Connectors (Future - Automated)

### **What is a Connector?**

A **connector** is like a **robot** that automatically:
1. Checks for new data
2. Downloads it
3. Processes it
4. Saves to database

**No human needed!**

---

### **Example 1: Bank SFTP Connector**

```
How HDFC Bank Works Today (Manual):
├─ Bank generates file at 3:00 PM
├─ Uploads to SFTP server
├─ Sends email to ops team
├─ Ops downloads at 4:00 PM (1 hour delay!)
├─ Ops uploads to dashboard at 4:15 PM (1.25 hour delay!)
└─ Data finally available

With Connector (Automated):
├─ Bank generates file at 3:00 PM
├─ Uploads to SFTP server
├─ Connector checks every 60 seconds
├─ 3:01 PM: Connector sees new file
├─ 3:01 PM: Connector downloads automatically
├─ 3:01 PM: Connector processes and saves
└─ 3:02 PM: Data available (only 2 minute delay!)
```

### **Real Example:**

```
HDFC Bank Configuration:
{
  "bank": "HDFC",
  "cutoff_times": ["10:00 AM", "2:00 PM", "6:00 PM", "10:00 PM"],
  "sftp": {
    "host": "sftp.hdfcbank.com",
    "username": "sabpaisa_user",
    "folder": "/outbound/settlement"
  }
}

What Connector Does:
Every 60 seconds:
├─ 10:00:30 - Check SFTP folder
├─ 10:00:30 - Empty, nothing to do
├─ 10:01:30 - Check again
├─ 10:01:30 - Found: HDFC_SETTLE_2025-10-02_01.csv
├─ 10:01:35 - Download file (5 seconds)
├─ 10:01:40 - Validate: 1,200 rows, ₹38 lakhs
├─ 10:01:45 - Insert into database
└─ 10:01:50 - Done! Mark as processed

Result:
✅ File processed in 20 seconds
✅ No human involved
✅ Instant availability
✅ Dashboard updates automatically
```

---

### **Example 2: Payment Gateway Connector**

```
How Razorpay Works:

Option A: Webhook (Push - Real-time)
├─ Transaction happens: Customer pays ₹5,000
├─ Razorpay instantly sends webhook to us:
│   POST http://our-server.com/webhook/razorpay
│   {
│     "txn_id": "pay_123abc",
│     "amount": "5000",
│     "status": "captured",
│     "merchant": "KAPR63"
│   }
├─ Our server receives and validates
└─ Saves to database instantly (< 1 second!)

Option B: Polling (Pull - Scheduled)
├─ Every 5 minutes, our connector asks Razorpay:
│   GET https://api.razorpay.com/v1/payments?from=10:00&to=10:05
├─ Razorpay returns list of transactions
├─ We save to database
└─ 5-minute delay (acceptable)

Result:
✅ No manual work
✅ Near real-time data
✅ Automatic updates
```

---

## 📊 Method 3: Analytics (How Dashboard Shows Data)

### **What is Analytics?**

Analytics = **Reports and Graphs** showing what's happening with settlements

---

### **Simple Example:**

```
You want to know:
❓ "How many transactions were settled today?"

Manual Way (Without Analytics):
1. Open database tool
2. Write SQL query:
   SELECT COUNT(*) FROM transactions WHERE settled_date = '2025-10-02'
3. Run query
4. Get number: 1,500
5. Calculate amount manually

With Analytics Dashboard:
1. Open http://localhost:5174/ops/analytics
2. See big card:
   ┌─────────────────────────┐
   │ Settled Transactions    │
   │                         │
   │      1,500              │
   │   ₹45,67,890            │
   │                         │
   │   ↑ +150 from yesterday │
   └─────────────────────────┘
3. Done! (2 seconds)
```

---

### **How Analytics Gets Data (Behind the Scenes):**

```
Step 1: Browser Makes Request
├─ You open analytics page
└─ Browser calls: GET http://localhost:5107/analytics/kpis

Step 2: Analytics API Queries Database
├─ API receives request
├─ Runs SQL query:
│   SELECT 
│     COUNT(*) as settled_count,
│     SUM(amount_paise) as settled_amount
│   FROM sp_v2_transactions
│   WHERE settlement_batch_id IS NOT NULL
│     AND DATE(settled_at) = CURRENT_DATE
└─ Gets result: {count: 1500, amount: 4567890}

Step 3: API Returns to Browser
└─ Sends JSON: {"settled_count": 1500, "settled_amount": 4567890}

Step 4: Browser Shows Pretty UI
└─ React component renders cards and charts
```

---

## 🎯 Putting It All Together

### **Scenario: Monday Morning Settlement Report**

```
WITHOUT Connectors (Manual):
├─ 9:00 AM - Ops checks email
├─ 9:15 AM - Downloads 3 bank files (HDFC, AXIS, ICICI)
├─ 9:30 AM - Opens dashboard, uploads files one by one
├─ 9:45 AM - All files uploaded
├─ 10:00 AM - Opens analytics to see report
└─ 10:05 AM - Manually calculates discrepancies

Total Time: 65 minutes
Human Effort: High
Errors: Possible (wrong file, missed email)

WITH Connectors (Automated):
├─ 8:00 AM - Banks upload files to SFTP
├─ 8:01 AM - Connectors auto-download
├─ 8:02 AM - Data in database
├─ 9:00 AM - Ops opens analytics dashboard
└─ Dashboard shows everything automatically:
    ├─ Settled: 1,500 txns, ₹45L
    ├─ Unsettled: 200 txns, ₹8L
    ├─ Settlement Rate: 88.2%
    └─ By Bank: HDFC 40%, AXIS 35%, ICICI 25%

Total Time: 2 minutes (just open dashboard)
Human Effort: Zero
Errors: None
```

---

## 📈 Analytics Dashboard - What You'll See

### **Tile 1: Settled Transactions**
```
┌────────────────────────────────┐
│ ✅ Settled Transactions        │
│                                │
│        1,500                   │
│     ₹45,67,890                 │
│                                │
│  ↑ +150 (+11%) from yesterday  │
└────────────────────────────────┘
```
**What it means:** Today, 1,500 transactions were settled, totaling ₹45.67 lakhs. That's 150 more than yesterday (good trend!)

---

### **Tile 2: Unsettled Transactions**
```
┌────────────────────────────────┐
│ ⚠️ Unsettled Transactions      │
│                                │
│         200                    │
│      ₹8,23,450                 │
│                                │
│  ↓ -50 (-20%) from yesterday   │
└────────────────────────────────┘
```
**What it means:** 200 transactions still pending settlement (₹8.23 lakhs). Decreased from yesterday (good, clearing backlog!)

---

### **Tile 3: Settlement Rate**
```
┌────────────────────────────────┐
│ 📊 Settlement Rate             │
│                                │
│       88.2%                    │
│                                │
│  ↑ +2.1% from last week        │
└────────────────────────────────┘
```
**What it means:** 88.2% of transactions are settled. Formula: 1500/(1500+200) = 88.2%. Improving!

---

### **Tile 4: Payment Mode Breakdown (Donut Chart)**
```
┌────────────────────────────────┐
│ 💳 Payment Mode Distribution   │
│                                │
│        ╱──────╲                │
│       │  📱61% │  UPI           │
│       │  💳29% │  CARD          │
│       │  🏦10% │  NETBANKING    │
│        ╲──────╱                │
│                                │
│  UPI dominates (as expected)   │
└────────────────────────────────┘
```
**What it means:** Most transactions (61%) via UPI, followed by Cards (29%)

---

### **Tile 5: Settlement Funnel**
```
┌────────────────────────────────┐
│ 🔄 Settlement Pipeline         │
│                                │
│  Captured:      2,000  100%    │
│       ↓                        │
│  Reconciled:    1,800   90%    │
│       ↓                        │
│  Settled:       1,500   75%    │
│       ↓                        │
│  Paid Out:      1,200   60%    │
│                                │
└────────────────────────────────┘
```
**What it means:** 
- 2,000 transactions captured
- 1,800 matched with bank (90% reconciliation rate)
- 1,500 settlement batches created (75% settlement rate)
- 1,200 actually paid to merchants (60% payout rate)

**Action:** Why only 60% paid? Check approval queue!

---

## 🔄 Complete Flow (Layman Terms)

### **Example: One Transaction's Journey**

```
Monday 10:00 AM
└─ Customer buys product for ₹5,000 on merchant's website

Monday 10:00:01
└─ Payment captured by Razorpay
    ├─ Transaction ID: pay_ABC123
    ├─ Amount: ₹5,000
    └─ Status: SUCCESS

Monday 10:00:02 (With Connector)
└─ Razorpay sends webhook to our server
    └─ POST /webhook/razorpay
        {"txn_id": "pay_ABC123", "amount": 5000, "status": "captured"}

Monday 10:00:03
└─ Our PG Ingestion Server receives and saves
    └─ INSERT INTO sp_v2_transactions (...)

Monday 10:00:05
└─ Analytics Dashboard updates (user refreshes page)
    ├─ Unsettled count: 199 → 200
    └─ Unsettled amount: ₹8.18L → ₹8.23L

Tuesday 10:00 AM (Next day, T+1 settlement)
└─ Settlement Scheduler runs
    ├─ Finds transaction (eligible for settlement)
    ├─ Calculates: Amount ₹5,000 - Commission ₹100 - GST ₹18 = ₹4,882
    └─ Creates settlement batch

Tuesday 10:01 AM
└─ Analytics Dashboard updates
    ├─ Unsettled: 200 → 199
    ├─ Settled: 1,500 → 1,501
    └─ Settlement Rate: 88.2% → 88.3%

Tuesday 11:00 AM (After Approval)
└─ Manager approves settlement batch
    └─ Queues bank transfer

Tuesday 3:00 PM (After Bank Transfer)
└─ Money credited to merchant's account
    └─ Analytics "Paid Out" count increases
```

---

## 💡 Key Differences Summary

### **Manual Upload:**
```
Human Process:
1. Wait for email
2. Download file
3. Open dashboard
4. Upload file
5. Verify

Time: 15-30 minutes per file
Errors: Possible
Scalability: Poor
```

### **Connectors:**
```
Automated Process:
1. Connector checks every 60 seconds
2. Auto-downloads when file appears
3. Auto-validates
4. Auto-saves to database

Time: 1-2 minutes (automatic)
Errors: Rare (validated)
Scalability: Excellent
```

### **Analytics:**
```
What You See:
├─ Numbers (1,500 settled, ₹45L)
├─ Charts (donut, line, funnel)
├─ Trends (↑ +11% from yesterday)
└─ Insights (UPI dominates 61%)

How It Works:
├─ API queries database every time you visit
├─ Calculates metrics on the fly
├─ Returns JSON data
└─ React displays pretty charts

Benefit:
├─ Instant insights
├─ No manual calculation
└─ Real-time updates
```

---

## 🎯 Bottom Line (Super Simple)

### **Without My System:**
- ❌ Manual work every day
- ❌ Slow (30+ minutes)
- ❌ Error-prone
- ❌ No visibility

### **With Connectors + Analytics:**
- ✅ Automatic (zero manual work)
- ✅ Fast (1-2 minutes)
- ✅ Accurate (validated)
- ✅ Full visibility (dashboard)

---

## 📋 What I'm Building (Simple Terms)

### **Settlement Analytics API**
```
What: Backend service that answers questions
Port: 5107

Questions it answers:
├─ How many settled today? → API returns: 1,500
├─ How much settled? → API returns: ₹45,67,890
├─ What's the settlement rate? → API returns: 88.2%
├─ Which payment mode most? → API returns: UPI 61%
└─ What's the trend? → API returns: ↑ +11%

How:
├─ You open dashboard
├─ Dashboard calls API
├─ API queries database
├─ API returns data
└─ Dashboard shows pretty charts
```

### **9 Analytics Tiles**
```
1. Settled Transactions - How many settled, how much
2. Unsettled Transactions - How many pending
3. Settlement Rate - Percentage (settled/total)
4. Avg Settlement Time - How long it takes
5. Payment Mode Donut - UPI vs Card vs NetBanking
6. GMV Trend Chart - Daily trend line
7. Settlement Funnel - Pipeline visualization
8. Settlement Rate Table - Yesterday/Week/Month
9. Failure Analysis - Why transactions failed
```

**Timeline:** 4-5 hours to build all 9 tiles with real data queries

---

**Does this make sense? Any part you want me to explain more?**
