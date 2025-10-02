# SFTP Bank File Ingestion Pipeline

## Overview
This feature implements a robust, enterprise-grade SFTP file ingestion pipeline for bank settlement files. It provides automated detection, validation, tracking of "expected vs received" files for each cut-off window, and surfaces Connector Health in the Ops dashboard.

## Architecture

### Components
1. **SFTP Watcher Service** - Polls configured banks' SFTP servers every minute
2. **Ingestion API** - REST API for health monitoring and management (port 5106)
3. **ConnectorHealthCard** - React component for dashboard visualization
4. **Database Tables** - PostgreSQL tables for tracking files, expectations, and health

### Feature Flag
- **Name**: `FEATURE_BANK_SFTP_INGESTION`
- **Default**: `false`
- **Behavior**: When disabled, scheduler stops, APIs return 404, UI card hidden

## Quick Start

### 1. Enable the Feature
```bash
# In .env.development
FEATURE_BANK_SFTP_INGESTION=true
SFTP_POLL_INTERVAL_MS=60000
SFTP_STAGING_DIR=/tmp/sftp-staging
```

### 2. Run Database Migration
```bash
psql -U postgres -d settlepaisa_ops < db/migrations/003_create_ingestion_tables.sql
```

### 3. Start Services
```bash
# Start all services including ingestion
./start-services.sh

# Or start ingestion service separately
cd services/api/ingest
npm install
npx ts-node server.ts
```

### 4. Test the Pipeline
```bash
./test-ingestion.sh
```

## Configuration

### Bank Configuration Structure
```json
{
  "bank": "AXIS",
  "sftp": {
    "host": "sftp.axisbank.com",
    "port": 22,
    "user": "svc_axis",
    "path": "/outbound/settlement"
  },
  "filename": {
    "pattern": "AXIS_SETTLE_%Y-%m-%d_%SEQ.csv",
    "seq_width": 2
  },
  "timezone": "Asia/Kolkata",
  "cutoffs": ["11:30", "15:30", "20:00"],
  "grace_minutes": 60,
  "completion": {
    "method": "marker_or_rename",
    "marker_suffix": ".ok",
    "temp_suffixes": [".part", ".tmp"]
  },
  "validation": {
    "min_size_bytes": 1024,
    "header_required": true
  }
}
```

### Supported Banks (Pre-configured)
- **AXIS** - 3 daily windows (11:30, 15:30, 20:00)
- **HDFC** - 4 daily windows (10:00, 14:00, 18:00, 22:00)
- **ICICI** - 2 daily windows (09:30, 21:30)

## API Endpoints

All endpoints require admin role (`X-User-Role: admin`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ingest/configs` | GET | List bank configurations |
| `/api/ingest/health` | GET | Connector health status |
| `/api/ingest/files` | GET | List ingested files |
| `/api/ingest/expectations` | GET | Expected vs received files |
| `/api/ingest/reconcile` | POST | Recompute expectations |
| `/api/ingest/pull-now` | POST | Trigger immediate poll |
| `/api/ingest/alerts` | GET | Recent alerts |

## File Processing Flow

1. **Detection** - Poll SFTP directory every minute
2. **Completion Check** - Verify marker/rename/checksum
3. **Download** - Download to staging with resume support
4. **Validation** - Check size, header, row count
5. **Recording** - Update database tables
6. **Event Publishing** - Emit file_ingested event
7. **Health Update** - Update connector health status

## Health Status Rules

- **HEALTHY** - All expected files received within grace period
- **DEGRADED** - Some files missing after grace period
- **DOWN** - All files missing OR last file > 6 hours old
- **UNKNOWN** - Initial state or no data

## Database Schema

### Tables
- `ingested_files` - Registry of all files seen/processed
- `file_expectations` - Expected files per window
- `connector_health` - Health snapshot for dashboard
- `bank_ingest_configs` - Bank SFTP configurations
- `ingest_alerts` - Alert history for audit

## UI Component

The `ConnectorHealthCard` component displays:
- Summary chips (Healthy/Degraded/Down counts)
- Per-bank status with last file time, expected/received counts, lag
- Drill-down drawer with:
  - Files tab - List of processed files with status
  - Windows tab - Expected vs received for each window
  - Actions - Recompute expectations, Poll now

## Testing

### Manual Testing
```bash
# Test with mock SFTP
export USE_MOCK_SFTP=true
./test-ingestion.sh

# Check logs
tail -f /tmp/ingest-api.log
```

### Acceptance Criteria
✅ Feature flag controls all functionality
✅ Admin-only access enforced
✅ Scheduler polls per configuration
✅ Files transition through states correctly
✅ Expectations tracked per window
✅ Health status updates appropriately
✅ UI card shows only when enabled
✅ Completeness logic works for all methods
✅ Idempotent file processing

## Production Deployment

1. **Set Environment Variables**
```bash
FEATURE_BANK_SFTP_INGESTION=true
DB_HOST=your-db-host
DB_PASSWORD=your-db-password
```

2. **Configure Real SFTP Credentials**
Update `bank_ingest_configs` table with actual SFTP credentials

3. **Set Up Monitoring**
- Monitor `/api/ingest/health` endpoint
- Set up alerts for DOWN status
- Track lag_minutes metric

4. **Configure Alerts**
- Slack webhook for missing files
- Email alerts for validation failures
- PagerDuty for DOWN status

## Troubleshooting

### Common Issues

1. **Files not being detected**
   - Check SFTP credentials in bank_ingest_configs
   - Verify file path and naming pattern
   - Check completion markers

2. **Health showing DEGRADED/DOWN**
   - Check file_expectations table
   - Verify cutoff times and grace period
   - Check ingested_files for failures

3. **API returns 404**
   - Verify FEATURE_BANK_SFTP_INGESTION=true
   - Check service is running on port 5106

4. **Access denied (403)**
   - Ensure X-User-Role header is 'admin' or 'sp-ops'

## Security Considerations

- SFTP credentials stored encrypted in database
- Admin-only access to all endpoints
- No modification of reconciliation engine
- Isolated under /api/ingest/* namespace
- Feature flag for complete isolation

## Future Enhancements

- [ ] PGP verification support
- [ ] Checksum validation (SHA256, MD5)
- [ ] Manifest file parsing
- [ ] Kafka integration for events
- [ ] Advanced retry logic
- [ ] File archival after processing
- [ ] Dashboard analytics for trends
- [ ] Multi-tenant support