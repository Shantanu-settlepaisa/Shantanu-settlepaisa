# Dispute Ingestion API Documentation

## Overview
The Dispute Ingestion API allows payment gateway systems (like SabPaisa) to push chargeback and dispute data into SettlePaisa V2. This API is compatible with V1's chargeback ingestion format but adapted for the V2 database schema.

## Endpoint

```
POST /v1/merchant/disputes/ingest
```

## Request Format

### Headers
```
Content-Type: application/json
X-Idempotency-Key: <unique-key> (optional)
```

### Request Body

```json
{
  "source": "VISA|MASTERCARD|RUPAY|UPI|BANK|MANUAL",
  "merchantId": "MERCHANT_ID",
  "payload": {
    "networkCaseId": "Case ID from card network",
    "txnRef": "Transaction reference (UTR/RRN/ARN)",
    "originalAmount": "1000.00",
    "chargebackAmount": "1000.00",
    "fees": "50.00",
    "reasonCode": "FRAUD_CARD_NOT_PRESENT",
    "receivedAt": "2024-09-15T10:30:00Z",
    "deadline": "2024-10-15T23:59:59Z"
  },
  "idempotencyKey": "unique-request-identifier"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | String | Yes | Dispute source: VISA, MASTERCARD, RUPAY, UPI, BANK, MANUAL |
| `merchantId` | String | No | Merchant ID (defaults to MERCH001) |
| `payload` | Object | Yes | Dispute details |
| `idempotencyKey` | String | No | Unique key for idempotent requests |

#### Payload Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `networkCaseId` | String | No | Card network case number (VISA case number, MC chargeback ref) |
| `txnRef` | String | Yes | Transaction reference (UTR/ARN/RRN) |
| `originalAmount` | String | No | Original transaction amount in INR (e.g., "5000.00") |
| `chargebackAmount` | String | Yes | Disputed amount in INR (e.g., "5000.00") |
| `fees` | String | No | Dispute/chargeback fees in INR (e.g., "250.00") |
| `reasonCode` | String | Yes | Dispute reason code (e.g., "FRAUD_CARD_NOT_PRESENT", "4837") |
| `receivedAt` | String (ISO8601) | No | When dispute was received (defaults to now) |
| `deadline` | String (ISO8601) | No | Evidence submission deadline |

## Response Format

### Success Response (201 Created)

```json
{
  "success": true,
  "dispute": {
    "disputeId": "DIS-1759672527324-TM7Y0Y",
    "merchantId": "MERCH001",
    "transactionId": "TXN-20240901-0001",
    "caseNumber": "VISA-2024-001234",
    "disputeAmountPaise": "500000",
    "disputeType": "CHARGEBACK",
    "status": "UNDER_REVIEW",
    "reason": "FRAUD_CARD_NOT_PRESENT",
    "disputeDate": "2024-09-15T10:30:00.000Z",
    "dueDate": "2024-10-15T23:59:59.000Z"
  }
}
```

### Error Response (400 Bad Request)

```json
{
  "error": "source and payload are required"
}
```

```json
{
  "error": "payload must contain: txnRef, chargebackAmount, reasonCode"
}
```

### Error Response (500 Internal Server Error)

```json
{
  "error": "Failed to ingest dispute",
  "details": "Database error details"
}
```

## Example Requests

### VISA Chargeback

```bash
curl -X POST http://localhost:8080/v1/merchant/disputes/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "source": "VISA",
    "merchantId": "MERCH001",
    "payload": {
      "networkCaseId": "VISA-2024-001234",
      "txnRef": "TXN-20240901-0001",
      "originalAmount": "5000.00",
      "chargebackAmount": "5000.00",
      "fees": "250.00",
      "reasonCode": "FRAUD_CARD_NOT_PRESENT",
      "receivedAt": "2024-09-15T10:30:00Z",
      "deadline": "2024-10-15T23:59:59Z"
    },
    "idempotencyKey": "visa-dispute-001"
  }'
```

### Mastercard Chargeback

```bash
curl -X POST http://localhost:8080/v1/merchant/disputes/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "source": "MASTERCARD",
    "merchantId": "MERCH001",
    "payload": {
      "networkCaseId": "MC-4567890123",
      "txnRef": "TXN-20240925-0045",
      "originalAmount": "12500.00",
      "chargebackAmount": "12500.00",
      "fees": "500.00",
      "reasonCode": "4837_NO_CARDHOLDER_AUTHORIZATION",
      "receivedAt": "2024-09-25T14:20:00Z",
      "deadline": "2024-10-25T23:59:59Z"
    },
    "idempotencyKey": "mastercard-dispute-001"
  }'
```

### UPI Dispute

```bash
curl -X POST http://localhost:8080/v1/merchant/disputes/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "source": "UPI",
    "merchantId": "MERCH001",
    "payload": {
      "txnRef": "432187654321",
      "chargebackAmount": "1500.00",
      "reasonCode": "CUSTOMER_DISPUTE_UNAUTHORIZED",
      "receivedAt": "2024-09-28T08:15:00Z",
      "deadline": "2024-10-05T23:59:59Z"
    },
    "idempotencyKey": "upi-dispute-001"
  }'
```

## Integration with V1 Chargeback Service

This V2 API is designed to be compatible with V1's chargeback ingestion format. The main differences:

### V1 Format
- Endpoint: `POST /v1/chargebacks/ingest`
- Java-based service (Chargeback Processor on port 8082)
- Multiple payload types: `VisaChargebackPayload`, `MastercardChargebackPayload`, `GenericChargebackPayload`

### V2 Format
- Endpoint: `POST /v1/merchant/disputes/ingest`
- Node.js Express service (Merchant API on port 8080)
- Unified payload format with `source` field to differentiate

### Field Mapping

| V1 Field | V2 Field | Notes |
|----------|----------|-------|
| `caseNumber` / `chargebackRefNumber` | `networkCaseId` | Card network case ID |
| `arn` / `acquirerRefNumber` | `txnRef` | Transaction reference |
| `transactionAmount` / `originalAmount` | `originalAmount` | Original txn amount |
| `disputeAmount` / `chargebackAmount` | `chargebackAmount` | Disputed amount |
| `liabilityShift` / `interchangeFee` | `fees` | Dispute fees |
| `reasonCode` / `messageReasonCode` | `reasonCode` | Reason code |
| `chargebackDate` / `createDate` | `receivedAt` | Dispute received date |
| `dueDate` / `responseDeadline` | `deadline` | Evidence deadline |

## Database Schema

Disputes are stored in the `sp_v2_disputes` table:

```sql
CREATE TABLE sp_v2_disputes (
  id                    BIGSERIAL PRIMARY KEY,
  dispute_id            VARCHAR(50) UNIQUE NOT NULL,
  merchant_id           VARCHAR(50) NOT NULL,
  transaction_id        VARCHAR(50) NOT NULL,
  case_number           VARCHAR(50),
  dispute_amount_paise  BIGINT NOT NULL,
  dispute_type          VARCHAR(30) NOT NULL,
  dispute_reason        VARCHAR(100),
  dispute_date          TIMESTAMP NOT NULL,
  due_date              TIMESTAMP,
  status                VARCHAR(30) NOT NULL DEFAULT 'UNDER_REVIEW',
  merchant_response     TEXT,
  merchant_evidence     JSONB,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);
```

### Status Values
- `OPEN` - New dispute, not yet reviewed
- `UNDER_REVIEW` - Merchant reviewing evidence
- `MERCHANT_WON` - Dispute won by merchant
- `MERCHANT_LOST` - Dispute lost by merchant
- `WITHDRAWN` - Dispute withdrawn by customer
- `EXPIRED` - Evidence deadline passed

### Dispute Types
- `CHARGEBACK` - Full chargeback
- `RETRIEVAL_REQUEST` - Information request
- `PRE_ARBITRATION` - Pre-arbitration dispute
- `ARBITRATION` - Full arbitration

## Additional Metadata Stored

The API stores additional ingestion metadata in the `merchant_evidence` JSONB field:

```json
{
  "source": "VISA",
  "originalAmountPaise": 500000,
  "feesPaise": 25000,
  "idempotencyKey": "visa-dispute-001",
  "ingestedAt": "2024-09-30T10:30:00.000Z"
}
```

## Future Enhancements

1. **Idempotency Implementation**: Prevent duplicate ingestion using `idempotencyKey`
2. **Webhook Notifications**: Notify merchants when disputes are received
3. **Audit Trail**: Create `sp_v2_dispute_audit` table for tracking state changes
4. **Auto-matching**: Automatically match disputes to transactions and settlements
5. **Bulk Ingestion**: Support CSV upload for multiple disputes

## Related Endpoints

- `GET /v1/merchant/disputes` - List all disputes
- `GET /v1/merchant/disputes/:disputeId` - Get dispute details
- `POST /v1/merchant/disputes/:disputeId/evidence` - Submit evidence
- `GET /v1/merchant/disputes/export` - Export disputes to CSV

## Support

For integration support or questions:
- Technical: api-support@settlepaisa.in
- Documentation: /Users/shantanusingh/ops-dashboard/services/merchant-api/README.md
