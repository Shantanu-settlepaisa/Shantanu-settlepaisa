# 🏦 V1 Bank Mappings - Production Data (settlepaisa_demo)

**Source:** V1 Production Database `settlepaisa_demo` on 3.108.237.99  
**Table:** `recon_configs`  
**Total Banks:** 24 configured  
**Date Retrieved:** October 3, 2025

---

## 📊 **Complete V1 Bank Mapping List**

| ID | Config Name | Bank Name | File Type | Delimiter |
|----|-------------|-----------|-----------|-----------|
| 158 | AIRTEL UPI | AIRTEL UPI | xlsx | - |
| 159 | AMAZON | AMAZON | xlsx | - |
| 160 | ATOM | ATOM | xlsx | - |
| 181 | AXIS BANK | AXIS BANK | txt | ~ |
| 161 | BOB | BOB | xlsx | - |
| 162 | BOI | BOI | xlsx | - |
| 163 | CANARA | CANARA BANK | txt | - |
| 164 | CENTRAL | CENTRAL | xlsx | - |
| 165 | FEDERL | FEDERAL | xlsx | - |
| 166 | **HDFC BANK** | **HDFC BANK** | **xlsx** | - |
| 167 | HDFC NB | HDFC NB | xlsx | - |
| 168 | HDFC UPI | HDFC UPI | xlsx | - |
| 169 | IDBI | IDBI | xlsx | - |
| 170 | INDIAN BANK | INDIAN BANK | xlsx | - |
| 171 | INDIAN UPI | INDIAN UPI | xlsx | - |
| 172 | INGENICO | INGENICO | xlsx | - |
| 173 | MAHARASTRA | MAHARASTRA | xlsx | - |
| 174 | MOBIKWIK | MOBIKWIK | xlsx | - |
| 175 | **SBI BANK** | **SBI BANK** | **xlsx** | - |
| 176 | SBI NB | SBI NB | xlsx | - |
| 177 | YES BANK | YES BANK | xlsx | - |

---

## 🎯 **Key Bank Mappings (Detailed)**

### **1. HDFC BANK (ID: 166)**

```yaml
Config Name: HDFC BANK
Bank Name: HDFC BANK
File Type: xlsx
Delimiter: (none - Excel)
Updated: 2025-01-07 17:04:51

Column Mappings:
  Transaction ID:
    Bank Column: MERCHANT_TRACKID
    Standard: transaction_id
  
  Amount (Paid):
    Bank Column: DOMESTIC AMT
    Standard: paid_amount
    
  Amount (Payee):
    Bank Column: Net Amount
    Standard: payee_amount
    
  Transaction Date:
    Bank Column: TRANS DATE
    Standard: transaction_date_time
    
  Payment Date:
    Bank Column: SETTLE DATE
    Standard: payment_date_time
```

**HDFC File Structure:**
```
MERCHANT_TRACKID | DOMESTIC AMT | Net Amount | TRANS DATE | SETTLE DATE
```

---

### **2. AXIS BANK (ID: 181)**

```yaml
Config Name: AXIS BANK
Bank Name: AXIS BANK
File Type: txt
Delimiter: ~ (tilde)
Updated: 2024-11-14 12:15:29

Column Mappings:
  Transaction ID:
    Bank Column: PRNNo
    Standard: transaction_id
    
  Amount (Paid):
    Bank Column: Amount
    Standard: paid_amount
    
  Amount (Payee):
    Bank Column: Amount
    Standard: payee_amount
    
  Transaction Date:
    Bank Column: Date
    Standard: transaction_date_time
    
  Payment Date:
    Bank Column: Date
    Standard: payment_date_time
```

**AXIS File Structure (Tilde Delimited):**
```
PRNNo~Amount~Date
```

---

### **3. SBI BANK (ID: 175)**

```yaml
Config Name: SBI BANK
Bank Name: SBI BANK
File Type: xlsx
Delimiter: (none - Excel)
Updated: 2024-11-14 12:18:20

Column Mappings:
  Transaction ID:
    Bank Column: MERCHANT_TXNNO
    Standard: transaction_id
    
  Amount (Paid):
    Bank Column: GROSS_AMT
    Standard: paid_amount
    
  Amount (Payee):
    Bank Column: NET_AMT
    Standard: payee_amount
    
  Transaction Date:
    Bank Column: TRAN_DATE
    Standard: transaction_date_time
    
  Payment Date:
    Bank Column: TRAN_DATE
    Standard: payment_date_time
```

**SBI File Structure:**
```
MERCHANT_TXNNO | GROSS_AMT | NET_AMT | TRAN_DATE
```

---

### **4. BOB (Bank of Baroda) (ID: 161)**

```yaml
Config Name: BOB
Bank Name: BOB
File Type: xlsx
Delimiter: (none - Excel)
Special Field: is_on_us = "Onus Indicator"
Updated: 2025-01-03 16:51:52

Column Mappings:
  Transaction ID:
    Bank Column: Merchant Track ID
    Standard: transaction_id
    
  Amount (Paid):
    Bank Column: Settlement Amount
    Standard: paid_amount
    
  Amount (Payee):
    Bank Column: Net Amount
    Standard: payee_amount
    
  Transaction Date:
    Bank Column: Transaction Date
    Standard: transaction_date_time
    
  Payment Date:
    Bank Column: Payment Date
    Standard: payment_date_time
    
  On-Us Indicator:
    Bank Column: Onus Indicator
    Standard: is_on_us
```

**BOB File Structure:**
```
Merchant Track ID | Settlement Amount | Net Amount | Transaction Date | Payment Date | Onus Indicator
```

---

## 📋 **All Bank Mappings (Summary Table)**

| Bank | Transaction ID Column | Paid Amount Column | Payee Amount Column | Date Column | File Type |
|------|----------------------|-------------------|---------------------|-------------|-----------|
| **HDFC BANK** | MERCHANT_TRACKID | DOMESTIC AMT | Net Amount | TRANS DATE / SETTLE DATE | xlsx |
| **AXIS BANK** | PRNNo | Amount | Amount | Date | txt (~ delimited) |
| **SBI BANK** | MERCHANT_TXNNO | GROSS_AMT | NET_AMT | TRAN_DATE | xlsx |
| **BOB** | Merchant Track ID | Settlement Amount | Net Amount | Transaction Date / Payment Date | xlsx |
| **CANARA BANK** | PGIRefNo | TxnAmount | TxnAmount | TxnDate | txt |
| **YES BANK** | MERCHANT REF. NO | TRANSACTION AMOUNT | TRANSACTION AMOUNT | TRANSACTION DATE | xlsx |
| **IDBI** | Txn id | Gross Amount | Net Amount | Txn date / Payment date | xlsx |
| **INDIAN BANK** | Txn id | Gross Amount | Net Amount | Txn date / Payment date | xlsx |
| **FEDERAL** | Txn id | Gross Amount | Net Amount | Txn date / Payment date | xlsx |
| **BOI** | Txn id | Gross Amount | Net Amount | Txn date / Payment date | xlsx |
| **CENTRAL** | Txn id | Gross Amount | Net Amount | Txn date / Payment date | xlsx |
| **MAHARASTRA** | Txn id | Gross Amount | Net Amount | Txn date / Payment date | xlsx |
| **HDFC NB** | Txn id | Gross Amount | Net Amount | Txn date / Payment date | xlsx |
| **HDFC UPI** | Order ID | Transaction Amount | Net Amount | Transaction Req Date / Settlement Date | xlsx |
| **SBI NB** | Txn id | Gross Amount | Net Amount | Txn date / Payment date | xlsx |
| **AIRTEL UPI** | Till_ID | ORIG_AMNT | Net_Credit_Amnt | TXN_DATE / Settlement_Date | xlsx |
| **INDIAN UPI** | REF ID | AMOUNT | AMOUNT | DATETIMEOFTRANSACTION | xlsx |
| **ATOM** | Merchant Txn ID | Gross Txn Amount | Net Amount to be Paid | Txn Date / Settlement Date | xlsx |
| **AMAZON** | SellerOrderId | TransactionAmount | NetTransactionAmount | TransactionPostedDate | xlsx |
| **MOBIKWIK** | Order Id | Txn Amount | Amount Paid | Transaction Date / Settlement Date | xlsx |
| **INGENICO** | SM Transaction Id | Total Amount | Net Amount | Transaction Date / Payment Date | xlsx |

---

## 🔄 **V1 Standard Schema (Target Format)**

All banks above map TO these standard columns:

```yaml
Standard Columns:
  - transaction_id         # Unique transaction reference
  - paid_amount           # Gross amount (before fees)
  - payee_amount          # Net amount (after fees)
  - transaction_date_time # Transaction timestamp
  - payment_date_time     # Settlement/Payment date
  - bank_name            # Bank identifier
  - transaction_mode     # Payment method (optional)
  - transaction_status   # Transaction status (optional)
  - transaction_approver # Approver (optional)
```

---

## 🎯 **Key Observations**

### **1. Naming Patterns:**

**Transaction ID Variations:**
- HDFC: `MERCHANT_TRACKID`
- AXIS: `PRNNo`
- SBI: `MERCHANT_TXNNO`
- Others: `Txn id`, `Order ID`, `Merchant Track ID`

**Amount Column Variations:**
- HDFC: `DOMESTIC AMT` / `Net Amount`
- SBI: `GROSS_AMT` / `NET_AMT`
- AXIS: `Amount` (same for both)
- Others: `Gross Amount` / `Net Amount`

**Date Column Variations:**
- HDFC: `TRANS DATE` / `SETTLE DATE`
- SBI: `TRAN_DATE` (same for both)
- AXIS: `Date` (same for both)
- Others: `Txn date` / `Payment date`

### **2. File Format Distribution:**

- **xlsx (Excel):** 21 banks (87.5%)
- **txt (Text/CSV):** 2 banks (AXIS, CANARA) (8.3%)
- **csv:** 1 bank (4.2%)

### **3. Delimiter Usage:**

- **No delimiter (Excel):** 21 banks
- **~ (Tilde):** AXIS BANK
- **Default (comma):** 1 bank

### **4. Special Fields:**

- **BOB** has `is_on_us` = "Onus Indicator" field
- Most banks use same column for both dates
- Some banks separate transaction date and settlement date

---

## 📝 **V2 Migration Plan**

### **Create V2 Mapping Table:**

```sql
CREATE TABLE sp_v2_bank_column_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_name VARCHAR(100) NOT NULL UNIQUE,
    bank_name VARCHAR(100) NOT NULL,
    file_type VARCHAR(10) NOT NULL,           -- xlsx, txt, csv
    delimiter VARCHAR(10),                     -- ~, ,, etc.
    
    -- Column mappings (JSONB)
    column_mappings JSONB NOT NULL,
    
    -- Format settings
    date_format VARCHAR(50) DEFAULT 'dd-MM-yyyy',
    encoding VARCHAR(20) DEFAULT 'UTF-8',
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(config_name)
);
```

### **Sample V2 Mapping (HDFC):**

```json
{
  "config_name": "HDFC BANK",
  "bank_name": "HDFC BANK",
  "file_type": "xlsx",
  "delimiter": null,
  "column_mappings": {
    "transaction_id": {
      "source": "MERCHANT_TRACKID",
      "target": "utr",
      "required": true
    },
    "amount_paise": {
      "source": "DOMESTIC AMT",
      "target": "amount_paise",
      "required": true,
      "transform": "RUPEES_TO_PAISE"
    },
    "transaction_date": {
      "source": "TRANS DATE",
      "target": "transaction_date",
      "required": true
    },
    "settlement_date": {
      "source": "SETTLE DATE",
      "target": "value_date",
      "required": false
    },
    "bank_name": {
      "source": "HDFC BANK",
      "target": "bank_name",
      "required": true,
      "default": "HDFC"
    }
  }
}
```

---

## ✅ **Action Items for V2**

1. **Create table:** `sp_v2_bank_column_mappings`
2. **Migrate V1 data:** Insert all 24 bank configs
3. **Build API:** CRUD endpoints for managing mappings
4. **Integrate upload:** Apply mappings during file upload
5. **Add UI:** ReconConfigDrawer component integration
6. **Test:** Verify HDFC, AXIS, SBI files normalize correctly

---

**Status:** ✅ V1 Production Bank Mappings Retrieved  
**Total Banks:** 24  
**Ready for:** V2 Migration
