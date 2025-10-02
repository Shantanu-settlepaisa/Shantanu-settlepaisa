# SettlePaisa V1 Backend Context Document

**Version:** 1.0  
**Date:** September 30, 2024  
**Purpose:** Complete backend context for SettlePaisa V1 system integration with V2 Ops Dashboard  

## Executive Summary

SettlePaisa V1 is a comprehensive payment settlement platform with JWT-based authentication and RESTful APIs. This document provides complete context for integrating V1 backend services with the SettlePaisa 2.0 Ops Dashboard.

## Architecture Overview

### Environment Configuration
- **Production**: `https://settlepaisaapi.sabpaisa.in/`
- **Staging**: `https://settlepaisainternalapi.sabpaisa.in/`
- **Development**: `http://localhost:18000/`

### Authentication
- **Type**: Bearer Token (JWT)
- **Format**: `Authorization: Bearer <JWT_TOKEN>`
- **Basic Auth** (Swagger UI): `admin / Settlepaisa@2day`

## API Service Modules

### 1. Authentication & User Management (`/auth/*`)

**Core Functions:**
- User registration and authentication
- Role-based access control (RBAC)
- Permission management
- User status management

**Key Endpoints:**
```
POST /auth/signup                    - User registration
POST /auth/login                     - User authentication
POST /auth/forgotPassword            - Password reset request
POST /auth/resetPasswordToken        - Reset password with token
GET  /auth/get_user                  - Get current user details
GET  /auth/get_user_manager_list     - List user managers
GET  /auth/get_module_with_permission - Get modules with permissions
POST /auth/save_role                 - Create new role
GET  /auth/get_role_list_detail      - List roles with details
POST /auth/map_user_with_role        - Assign role to user
POST /auth/user_status_change        - Update user status
POST /auth/add_user_manager          - Add user manager
GET  /auth/get_user_list             - List all users
POST /auth/edit_role                 - Update role
DELETE /auth/delete_role             - Delete role
```

### 2. Master Data Management (`/master_data/*`)

**Core Functions:**
- Service type configuration
- Business data management
- Merchant onboarding and management
- Fee bearer configuration
- Rolling reserve settings

**Key Endpoints:**
```
GET  /master_data/download_service_csv_file     - Download service type template
POST /master_data/upload_service_type_master    - Upload service types
POST /master_data/change_service_status         - Toggle service status
POST /master_data/upload_business_csv_file      - Upload business data
GET  /master_data/download_business_csv_file    - Download business template
GET  /master_data/download_merchant_csv_file    - Download merchant template
GET  /master_data/download_merchant_data        - Export merchant data
POST /master_data/upload_merchant_data_csv      - Import merchant data
GET  /master_data/download_merchant_fee_bearer_sample - Fee bearer template
POST /master_data/upload_merchant_fee_bearer    - Upload fee bearer config
POST /master_data/save_rolling_reserve_subscription - Configure rolling reserve
POST /master_data/save_merchant_fee_bearer      - Save fee bearer settings
GET  /master_data/get_merchant_type             - List merchant types
GET  /master_data/get_merchant_data_byID        - Get merchant by ID
GET  /master_data/get_fee_bearer                - Get fee bearer config
POST /master_data/udate_mercahnt_account        - Update merchant account
GET  /master_data/get_merchant_data             - List all merchants
POST /master_data/set_partner_bank_percentage   - Configure bank percentages
```

### 3. Merchant Data & Reconciliation (`/merchant_data/*`)

**Core Functions:**
- Reconciliation configuration management
- Bank settlement file processing
- Transaction reconciliation
- Settlement reporting

**Key Endpoints:**
```
GET  /merchant_data/get_recon_configs           - List reconciliation configs
GET  /merchant_data/get_recon_config_by_id      - Get specific recon config
DELETE /merchant_data/delete_recon_configs      - Remove recon config
POST /merchant_data/add_recon_config            - Add recon configuration
GET  /merchant_data/get_recon_data              - Get reconciliation data
POST /merchant_data/upload_recon_through_file_type - Upload recon file
GET  /merchant_data/download_recon_excel_file   - Export recon data
GET  /merchant_data/get_bank_data               - Get bank settlement data
POST /merchant_data/recheck_recon_bank          - Re-reconcile bank data
POST /merchant_data/upload_bank_settlement      - Upload bank settlement file
GET  /merchant_data/download_bank_sample        - Download bank file template
GET  /merchant_data/get_merchant_summary        - Merchant dashboard summary
POST /merchant_data/set_merchant_transaction_report - Generate transaction report
GET  /merchant_data/get_settled_transaction     - List settled transactions
GET  /merchant_data/download_merchant_update_sample - Merchant update template
GET  /merchant_data/download_bank_settled_excel_file - Export bank settlements
GET  /merchant_data/get_recon_count_details     - Reconciliation statistics
GET  /merchant_data/get_bank_count_details      - Bank transaction counts
```

### 4. Notifications (`/notif/*`)

**Core Functions:**
- Notification management
- Email configuration
- Role-based notifications

**Key Endpoints:**
```
GET    /notif/get-notifications     - List notifications
POST   /notif/map-notif-emails      - Configure email notifications
DELETE /notif/remove-notif-emails   - Remove notification emails
GET    /notif/get-notif-groups      - List notification groups
POST   /notif/map-notif-role        - Map notifications to roles
DELETE /notif/delete-notif-role     - Remove role notification mapping
POST   /notif/read-notif            - Mark notification as read
```

### 5. Reports & Analytics (`/reports/*`)

**Core Functions:**
- Financial reporting
- Commission calculations
- Partner bank reports
- Ledger management

**Key Endpoints:**
```
GET  /reports/get_duplicate_transaction         - Find duplicate transactions
GET  /reports/get_fee_bearer_data               - Fee bearer report
POST /reports/setMerchantFeeBearer              - Update merchant fee bearer
GET  /reports/get_rolling_reserve_data          - Rolling reserve report
POST /reports/setMerchantLedger                 - Update merchant ledger
GET  /reports/get-fee-bearer-subscription-ledger - Fee subscription ledger
GET  /reports/get_payout                        - List payouts
POST /reports/make_payout                       - Create payout
GET  /reports/get_subscription_ledger           - Subscription ledger
GET  /reports/get_log                           - System logs
GET  /reports/mode_wise_payment_detail          - Payment mode analysis
GET  /reports/download_mode_wise_payment_detail - Export payment analysis
GET  /reports/subvention_monthly_report         - Monthly subvention report
GET  /reports/net_banking_commision_report_details - Net banking commission
GET  /reports/net_banking_commision_report_download - Export NB commission
GET  /reports/subvention_monthly_report_download - Export subvention report
GET  /reports/canara_partner_bank_report        - Canara Bank report
GET  /reports/ubi_partner_bank_report           - UBI Bank report
GET  /reports/indian_bank_mis                   - Indian Bank MIS
GET  /reports/indian_bank                       - Indian Bank report
GET  /reports/onboarding_summary                - Onboarding statistics
GET  /reports/download-fee-bearer-subscription-ledger - Export fee ledger
GET  /reports/download_rolling_reserve_data     - Export rolling reserve
GET  /reports/download_fee_bearer_data          - Export fee bearer data
GET  /reports/download_subscription_ledger      - Export subscription ledger
GET  /reports/download_refund_transction_data   - Export refund data
```

### 6. Stakeholders & Rules Engine (`/stakeholders/*`)

**Core Functions:**
- Business rules management
- Stakeholder configuration
- Commission rules
- Bank routing rules

**Key Endpoints:**
```
GET  /stakeholders/get_internal_rule_by_status  - Get rules by status
POST /stakeholders/clone_rule                   - Duplicate existing rule
POST /stakeholders/add_split_rule_internal      - Add split rule
POST /stakeholders/update_internal_rule         - Update rule
POST /stakeholders/edit_rule_range              - Edit rule range
GET  /stakeholders/get_referral_list_rule       - Referral rules list
GET  /stakeholders/get_referrer_list            - List referrers
GET  /stakeholders/get_bussiness_type           - List business types
GET  /stakeholders/get_mode_referral_list_rule  - Mode-based referral rules
GET  /stakeholders/get_bank_master              - Bank master data
GET  /stakeholders/get_source_clone_bank_list   - Source banks for cloning
GET  /stakeholders/get_mode_bank_list_rule      - Mode-based bank rules
GET  /stakeholders/get_service_type             - Service types
GET  /stakeholders/get_stakeholder_type         - Stakeholder types
GET  /stakeholders/get_service_mapper_details   - Service mapping details
GET  /stakeholders/get_bank_summary             - Bank summary report
```

## Data Models

### Core Transaction Model
```json
{
  "transaction_id": "string",
  "merchant_id": "string",
  "amount": "number",
  "status": "SUCCESS|FAILED|PENDING",
  "payment_mode": "UPI|NEFT|RTGS|IMPS|CARD|WALLET",
  "utr": "string",
  "created_at": "datetime"
}
```

### Settlement Model
```json
{
  "settlement_id": "string",
  "merchant_id": "string",
  "gross_amount": "number",
  "commission": "number",
  "gst": "number",
  "tds": "number",
  "reserve_amount": "number",
  "net_amount": "number",
  "status": "PENDING|PROCESSING|COMPLETED|FAILED",
  "cycle_date": "date"
}
```

### Merchant Model
```json
{
  "merchant_id": "string",
  "name": "string",
  "gstin": "string",
  "pan": "string",
  "risk_score": "number",
  "kyc_status": "PENDING|VERIFIED|REJECTED",
  "bank_details": {
    "account_number": "string",
    "ifsc_code": "string"
  }
}
```

## Business Logic

### Settlement Calculation Formula
```
Gross Amount = Sum of all transactions
Commission = Gross Amount × Commission Rate (1.5% - 2.1%)
GST = Commission × 18%
TDS = Gross Amount × TDS Rate (1% - 2%)
Rolling Reserve = Gross Amount × Reserve Rate (3% - 18%)
Net Settlement = Gross Amount - Commission - GST - TDS - Rolling Reserve
```

### Commission Tiers (V1 Rates)
- **Tier 1**: Under ₹25L - 2.1%
- **Tier 2**: ₹25L to ₹75L - 1.9%
- **Tier 3**: ₹75L to ₹2Cr - 1.7%
- **Tier 4**: Above ₹2Cr - 1.5%

## Database Schema Integration

### V1-Compatible Tables (V2 Implementation)
```sql
-- Core reconciliation tables
sp_v2_merchants
sp_v2_transactions_v1
sp_v2_settlement_batches
sp_v2_settlement_items
sp_v2_bank_files
sp_v2_utr_credits
sp_v2_recon_matches
sp_v2_rolling_reserve_ledger
sp_v2_commission_tiers
```

### Key Reconciliation Views
```sql
-- Dashboard summaries
v_reconciliation_summary
v_unmatched_transactions
v_unmatched_bank_credits
```

## Security & Compliance

### Authentication Flow
1. POST `/auth/login` with credentials
2. Receive JWT token
3. Include `Authorization: Bearer <token>` in all requests
4. Token expiry: 24 hours (configurable)

### Data Protection
- All monetary values stored in paise (1 INR = 100 paise)
- Sensitive data encrypted at rest
- API rate limiting: 1000 requests/hour per user
- Audit logging for all financial operations

## Error Handling

### Standard HTTP Status Codes
- `200` - Success
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid/expired token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": [
      {
        "field": "amount",
        "message": "Amount must be greater than 0"
      }
    ]
  }
}
```

## Integration Points with V2 Ops Dashboard

### 1. Authentication Integration
```javascript
// Login to V1 system
const response = await fetch('https://settlepaisaapi.sabpaisa.in/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});
const { token } = await response.json();
```

### 2. Merchant Data Fetching
```javascript
// Get merchant list for dropdown
const merchants = await fetch('https://settlepaisaapi.sabpaisa.in/master_data/get_merchant_data', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### 3. Reconciliation Data
```javascript
// Get reconciliation statistics
const reconStats = await fetch('https://settlepaisaapi.sabpaisa.in/merchant_data/get_recon_count_details', {
  headers: { 'Authorization': `Bearer ${token}` },
  params: { from_date: '2024-01-01', to_date: '2024-12-31' }
});
```

### 4. Reports Integration
```javascript
// Get settlement reports
const settlements = await fetch('https://settlepaisaapi.sabpaisa.in/merchant_data/get_settled_transaction', {
  headers: { 'Authorization': `Bearer ${token}` },
  params: { merchant_id: 'MERCHANT_ID', cycle_date: '2024-09-30' }
});
```

## Performance Considerations

### API Response Times
- Authentication: < 200ms
- Merchant data: < 500ms
- Reconciliation queries: < 2s
- Report generation: < 10s

### Caching Strategy
- Merchant data: 1 hour TTL
- Commission tiers: 24 hours TTL
- Bank master data: 24 hours TTL
- Real-time data: No caching

## Monitoring & Alerts

### Health Check Endpoints
```
GET /health         - Basic health check
GET /health/deep    - Database connectivity check
GET /metrics        - Prometheus metrics
```

### Key Metrics to Monitor
- API response times
- Authentication success rate
- Database connection pool status
- Error rates by endpoint
- Settlement processing delays

## Migration Notes

### V1 to V2 Data Mapping
- V1 transaction IDs → V2 `pgw_ref`
- V1 settlement batches → V2 `sp_v2_settlement_batches`
- V1 bank files → V2 `sp_v2_bank_files`
- V1 UTR matching → V2 `sp_v2_recon_matches`

### Compatibility Layer
The V2 system maintains compatibility with V1 APIs through facade pattern:
- V1 endpoints proxy to V2 backend
- Data transformation between V1/V2 formats
- Gradual migration of frontend components

## Development Guidelines

### Local Development Setup
```bash
# Clone V1 API repository
git clone <v1-api-repo>
cd settlepaisa-v1-api

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with database credentials

# Start development server
npm run dev
# Server runs on http://localhost:18000
```

### Testing Strategy
- Unit tests: Jest framework
- Integration tests: Supertest
- Load testing: Artillery
- E2E testing: Playwright

### Deployment Pipeline
1. Code commit triggers CI/CD
2. Automated testing (unit + integration)
3. Docker image build
4. Staging deployment
5. Smoke tests
6. Production deployment (blue-green)

This context document provides the foundation for integrating SettlePaisa V1 backend services with the V2 Ops Dashboard, ensuring seamless data flow and maintaining backward compatibility.