# Recon Rule Settings - Feature Guide

## Overview
The Recon Rule Settings feature allows you to configure and manage reconciliation matching rules for the SettlePaisa payment gateway. This is a powerful rule engine that determines how transactions are matched between your Payment Gateway (PG) and Bank statements.

---

## Accessing the Feature

**URL**: `http://localhost:5174/ops/settings`

**Requirements**: Admin access only

---

## Main Features

### 1. **New Rule** ✅ Working
- **Button**: Blue "New Rule" button in the top-right
- **Action**: Creates a new draft rule with default settings
- **Auto-behavior**: Automatically selects the newly created rule for editing
- **Default Settings**:
  - Name: "New Rule"
  - Scope: Global (All transactions)
  - Match Chain: UTR only
  - Status: Draft

### 2. **Import** 🟡 Partial (File picker only)
- **Button**: "Import" button with upload icon
- **Format**: JSON
- **Status**: Opens file picker but doesn't process upload yet
- **Future**: Will allow bulk import of rules from JSON file

### 3. **Export** ✅ Working
- **Button**: "Export" button with download icon
- **Format**: JSON
- **Action**: Downloads all rules as `recon-rules-YYYY-MM-DD.json`
- **Use case**: Backup, migration, or sharing rule configurations

### 4. **Delete** ✅ Working (NEW)
- **Button**: Red "Delete" button in the rule editor (right side)
- **Location**: Only visible when viewing a rule (not in edit mode)
- **Confirmation**: Shows browser confirmation dialog before deleting
- **Action**: Permanently deletes the rule and refreshes the list

---

## Rule Configuration Tabs

When you select a rule, you'll see 6 tabs on the right panel:

### Tab 1: **Definition** 📋
**Purpose**: Core matching logic configuration

**Settings**:
- **Match Chain**: Sequential steps for matching PG → Bank records
  - Example: `["UTR", "amount", "date"]` means:
    1. First, try to match by UTR (Unique Transaction Reference)
    2. If UTR doesn't match, fall back to amount + date
    3. Each step narrows down potential matches
  
- **Scope**: Who does this rule apply to?
  - **Global**: All transactions (default)
  - **Custom**: Specific merchant, acquirer, or payment mode
  - Example: Create a stricter rule for high-value merchants

**When to Edit**:
- Adding new matching fields (RRN, Transaction ID, etc.)
- Creating merchant-specific rules
- Changing match priority order

---

### Tab 2: **Tolerances** 🎯
**Purpose**: Define acceptable differences during matching

**Settings**:
- **Amount Tolerance (paise)**: Absolute difference allowed
  - Example: `100` = ₹1.00 difference is acceptable
  - Use case: Gateway fees, rounding differences

- **Amount Tolerance (%)**: Percentage-based difference
  - Example: `0.5` = 0.5% variance allowed
  - Use case: High-value transactions where ₹1 is negligible

- **Date Tolerance (days)**: How many days apart can dates be?
  - Example: `1` = Transaction can be ±1 day from bank date
  - Use case: Settlement delays, timezone differences

**When to Edit**:
- High false positives (too many exceptions)
- Gateway-specific settlement patterns
- Different tolerance for different payment modes

---

### Tab 3: **Exceptions** ⚠️
**Purpose**: Define what exceptions to raise when matching fails

**Settings**:
- **When**: Trigger condition (e.g., `AMOUNT_MISMATCH`, `UTR_NOT_FOUND`)
- **Reason**: Human-readable explanation
- **Severity**: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`

**Example Exception Mapping**:
```
When: AMOUNT_MISMATCH
Reason: "Amount difference detected"
Severity: HIGH
```

**When to Edit**:
- Customizing exception priorities
- Adding new exception types
- Routing specific errors to specific teams

---

### Tab 4: **De-dup** 🛡️
**Purpose**: Handle duplicate records in bank feeds

**Settings**:
- **Dedup Key**: Field to identify duplicates (UTR, RRN, TXNID)
- **Window (hours)**: How far back to check for duplicates
  - Example: `24` = Look for duplicates in last 24 hours
  
- **Strategy**: 
  - **First Write Wins**: Keep the earliest record
  - **Latest**: Keep the most recent record

**When to Edit**:
- Bank sends duplicate records
- Multiple data sources for same transaction
- Webhook retry logic causing duplicates

---

### Tab 5: **Auto-actions** ⚡
**Purpose**: Automated responses to matching outcomes

**Settings**:
- **When**: Trigger condition
- **Action**: What to do automatically

**Example Auto-actions**:
```
When: MATCH_SUCCESS
Action: AUTO_APPROVE

When: AMOUNT_MISMATCH_UNDER_1_RUPEE
Action: FLAG_FOR_REVIEW
```

**When to Edit**:
- Automating exception resolution
- Creating approval workflows
- Reducing manual intervention

---

### Tab 6: **Versions** 🕐
**Purpose**: View rule change history

**Display**:
- Version number
- Date of change
- Author (who made the change)
- Summary of changes

**Use case**:
- Audit trail
- Rollback to previous version
- Understanding rule evolution

---

## Rule Actions

### **Edit** ✏️
- Click "Edit" button in rule header
- Modify any settings in the tabs
- Click "Save" to apply changes (increments version)
- Click "Cancel" to discard changes

### **Duplicate** 📋
- Creates a copy of the current rule
- Useful for creating variations
- Example: Copy "Global UTR Rule" → Customize for specific merchant

### **Simulate** ▶️
- Tests the rule against past data (7-day window)
- Shows impact metrics:
  - **Matched**: How many more/fewer matches
  - **Unmatched**: How many more/fewer unmatched records
  - **Value Impact**: Additional reconciled amount (₹)
  
**Example Output**:
```
Matched: 1602 (+27)
Unmatched: 648 (-27)
Value Impact: +₹8,500
```

**Use case**: 
- Before publishing a rule to production
- A/B testing different matching strategies
- Estimating improvement from rule changes

---

## Rule Lifecycle

```
1. DRAFT → Create and test rule
   ↓
2. SIMULATE → Verify impact on past data
   ↓
3. CANARY → Test on 5-10% of live traffic (optional)
   ↓
4. LIVE → Full production deployment
   ↓
5. ARCHIVED → Deactivate but keep for history
```

**Status Meanings**:
- **Draft** (Gray): Work in progress, not active
- **Canary** (Yellow): Testing on subset of transactions
- **Live** (Green): Active in production
- **Archived** (Red): Disabled, historical record

---

## Common Use Cases

### Use Case 1: **Fix Low Match Rate for Specific Merchant**
1. Click "New Rule"
2. Change scope to that merchant ID
3. Add merchant-specific match fields (e.g., merchant_order_id)
4. Set tighter tolerances (0 paise difference)
5. Simulate to verify improvement
6. Publish to Live

### Use Case 2: **Handle Gateway Fee Differences**
1. Select existing "Global UTR Rule"
2. Click "Duplicate"
3. Go to Tolerances tab
4. Set Amount Tolerance = 100 paise (₹1)
5. Add exception: "When AMOUNT_MISMATCH_UNDER_1_RUPEE → Severity: LOW"
6. Simulate and publish

### Use Case 3: **Reduce Duplicate Bank Records**
1. Select rule
2. Go to De-dup tab
3. Set Dedup Key = "UTR"
4. Set Window = 24 hours
5. Set Strategy = "First Write Wins"
6. Save

### Use Case 4: **Export Rules for Staging Environment**
1. Click "Export" button
2. Download JSON file
3. Upload to staging server
4. Use "Import" to load rules

---

## Technical Details

### API Endpoints (Port 5109)
- `GET /api/recon-rules/rules` - List all rules with filters
- `GET /api/recon-rules/rules/:id` - Get single rule details
- `POST /api/recon-rules/rules` - Create new rule
- `PUT /api/recon-rules/rules/:id` - Update existing rule
- `DELETE /api/recon-rules/rules/:id` - Delete rule ✅ NEW
- `POST /api/recon-rules/rules/:id/duplicate` - Duplicate rule
- `POST /api/recon-rules/rules/:id/simulate` - Simulate rule impact

### Database Table
**Table**: `sp_v2_recon_rules` (PostgreSQL on port 5433)

**Schema**:
```sql
CREATE TABLE sp_v2_recon_rules (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  scope TEXT,
  scope_type VARCHAR(50),
  match_chain TEXT[], 
  tolerances JSONB,
  exceptions JSONB,
  dedupe JSONB,
  auto_actions JSONB,
  status VARCHAR(50),
  priority INTEGER,
  version INTEGER,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## Best Practices

### 1. **Start with Simulation**
Never publish a rule directly to Live. Always simulate first to avoid breaking existing matches.

### 2. **Use Descriptive Names**
- ❌ Bad: "Rule 1", "Test Rule"
- ✅ Good: "High Value Strict (Merchant X)", "UPI Tolerance Rule"

### 3. **Version Control Your Rules**
Use Export feature regularly to backup your rule configurations.

### 4. **Test with Canary**
For high-impact changes, use Canary status to test on 5-10% of traffic first.

### 5. **Document Changes**
Use the description field to explain why a rule was created or modified.

### 6. **Delete Test Rules**
Clean up draft rules that are no longer needed to avoid clutter.

---

## Troubleshooting

### Problem: "Failed to create rule"
**Solution**: 
- Ensure Recon Rules API is running on port 5109
- Check browser console for detailed error
- Verify database connection

### Problem: Rule list not refreshing after create/delete
**Solution**: Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)

### Problem: Simulate shows no impact
**Solution**: 
- Verify there's data in the simulation window (last 7 days)
- Check if rule scope matches available transactions
- Ensure match_chain fields exist in data

### Problem: Delete button not showing
**Solution**: 
- Ensure you're not in Edit mode (if editing, cancel first)
- Delete button is only visible when viewing a rule

---

## Changelog

### Version 2.21.0 (Current)
- ✅ Fixed "New Rule" creation error
- ✅ Added Delete button and functionality
- ✅ Improved state management (Zustand refresh mechanism)
- ✅ Removed page reloads for better UX
- ✅ Auto-selection of newly created rules

### Version 2.11.0
- Initial Recon Rule Settings implementation
- Export/Import buttons (import partial)
- 6-tab rule editor
- Simulation feature

---

## Future Enhancements

1. **Import Functionality**: Complete JSON import processing
2. **Bulk Operations**: Select and delete multiple rules
3. **Rule Templates**: Pre-configured rules for common scenarios
4. **Advanced Simulation**: Compare multiple rules side-by-side
5. **Rule Testing**: Live test with sample transactions
6. **Conflict Detection**: Warn if rules overlap or contradict
7. **Performance Metrics**: Track rule execution time and success rate

---

## Support

For questions or issues with Recon Rule Settings:
1. Check browser console for errors
2. Verify all services are running (ports 5109, 5174)
3. Review API logs at `/tmp/recon-rules-api.log`
4. Contact Ops team for rule design consultation
