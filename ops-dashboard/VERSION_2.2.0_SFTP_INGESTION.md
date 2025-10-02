# Version 2.2.0 - SFTP Bank File Ingestion Pipeline
**Release Date**: September 19, 2025
**Previous Version**: 2.1.1

## 🎯 Major Feature: SFTP Bank File Ingestion Pipeline

### Overview
Implemented a comprehensive SFTP bank file ingestion pipeline that provides:
- Automated file detection and validation
- "Expected vs Received" tracking for cut-off windows
- Real-time Connector Health monitoring
- Complete isolation with feature flag control
- Admin-only access with RBAC

### Key Components

#### 1. Database Schema (New Tables)
- `ingested_files` - Registry of all processed files
- `file_expectations` - Expected files per window
- `connector_health` - Health snapshot for dashboard
- `bank_ingest_configs` - Bank SFTP configurations
- `ingest_alerts` - Alert history audit trail

#### 2. Backend Services
- **Location**: `/services/api/ingest/`
- **Port**: 5106
- **Files**:
  - `server.js` - Express API server
  - `watcher.ts` - SFTP polling service
  - `sftp-client.ts` - SFTP connection handler
  - `config.ts` - Configuration management
  - `mock-data.js` - Mock data for testing

#### 3. Frontend Integration
- **Modified**: `/src/components/Overview/ConnectorHealthMini.tsx`
  - Integrated SFTP health data into existing Connector Health card
  - Combined display of API connectors and SFTP ingestion status
  - No duplicate UI components

#### 4. Configuration
- **Feature Flag**: `FEATURE_BANK_SFTP_INGESTION` (default: false)
- **Environment Variables**:
  ```
  FEATURE_BANK_SFTP_INGESTION=true
  VITE_FEATURE_BANK_SFTP_INGESTION=true
  SFTP_POLL_INTERVAL_MS=60000
  SFTP_STAGING_DIR=/tmp/sftp-staging
  ```

### Pre-configured Banks
1. **AXIS Bank**
   - Cutoffs: 11:30, 15:30, 20:00
   - Completion: marker (.ok) or rename
   - Pattern: AXIS_SETTLE_%Y-%m-%d_%SEQ.csv

2. **HDFC Bank**
   - Cutoffs: 10:00, 14:00, 18:00, 22:00
   - Completion: rename method
   - Pattern: HDFC_SETTLEMENT_%Y%m%d_%SEQ.csv

3. **ICICI Bank**
   - Cutoffs: 09:30, 21:30
   - Completion: marker (.complete)
   - Pattern: ICICI_%Y%m%d_SETTLE.csv

### API Endpoints
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

### File Processing States
1. **SEEN** - File detected on SFTP
2. **COMPLETE** - Completion marker/condition met
3. **DOWNLOADED** - File downloaded to staging
4. **VALIDATED** - Passed validation checks
5. **FAILED** - Processing failed

### Health Status Rules
- **HEALTHY** ✅ - All expected files received within grace period
- **DEGRADED** ⚠️ - Some files missing after grace period
- **DOWN** ❌ - All files missing OR last file > 6 hours old
- **UNKNOWN** ❓ - Initial state or no data

### Files Modified/Created

#### New Files Created
```
/services/api/ingest/
├── server.js
├── config.ts
├── sftp-client.ts
├── watcher.ts
├── mock-data.js
├── seed-mock-data.js
├── package.json
└── tsconfig.json

/src/features/ingest/
├── ConnectorHealthCard.tsx
└── ConnectorHealthCardSimple.tsx

/db/migrations/
└── 003_create_ingestion_tables.sql

Root Files:
├── start-ingestion-demo.sh
├── test-ingestion.sh
└── SFTP_INGESTION_README.md
```

#### Modified Files
```
/.env.development - Added feature flags
/start-services.sh - Added ingestion service startup
/src/components/Overview/ConnectorHealthMini.tsx - Integrated SFTP data
/src/pages/Overview.tsx - Cleaned up imports
```

### Breaking Changes
None - Feature is completely isolated behind feature flag

### Migration Steps
1. Run database migration: `psql -d settlepaisa_ops < db/migrations/003_create_ingestion_tables.sql`
2. Set environment variables in `.env.development`
3. Restart services with `./start-services.sh`
4. Enable feature flag when ready for production

### Rollback Instructions
1. Set `FEATURE_BANK_SFTP_INGESTION=false`
2. Stop ingestion service
3. Optionally drop ingestion tables (data preserved)

### Testing
- Test script: `./test-ingestion.sh`
- Demo script: `./start-ingestion-demo.sh`
- Mock SFTP mode: `USE_MOCK_SFTP=true`

### Security Considerations
- Admin-only access enforced
- No modification to existing reconciliation code
- Isolated namespace `/api/ingest/*`
- Feature flag for complete isolation
- Encrypted credential storage in database

### Performance Impact
- Minimal - Separate service on port 5106
- 1-minute polling interval (configurable)
- No impact when feature disabled
- Efficient database queries with proper indexing

### Known Issues
None at release

### Future Enhancements
- [ ] PGP verification support
- [ ] Advanced checksum validation
- [ ] Manifest file parsing
- [ ] Kafka event integration
- [ ] Multi-tenant support
- [ ] File archival system

## Version History
- **2.1.1** - Enterprise-grade service monitoring
- **2.1.0** - Versioning system with rollback
- **2.0.0** - Manual Upload/Connectors integration
- **1.0.0** - Initial release