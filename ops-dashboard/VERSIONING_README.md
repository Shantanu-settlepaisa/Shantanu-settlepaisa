# Version Control System for Ops Dashboard

## Overview
This versioning system provides complete backup and rollback capabilities for the Ops Dashboard, allowing you to save snapshots of the current state and restore to any previous version instantly.

## Quick Start

### Create a Backup
```bash
# Create a backup of current state
./backup-v2.1.0.sh

# Or use the version control manager
./version-control.sh backup
```

### List Available Backups
```bash
./version-control.sh list
```

### Rollback to Previous Version
```bash
# Rollback to latest v2.1.0
./rollback-v2.1.0-complete.sh

# Or rollback to specific backup
./rollback-v2.1.0-complete.sh versions/v2.1.0_20250918_084808

# Or use the version control manager
./version-control.sh rollback v2.1.0
```

## Version 2.1.0 - Settlement Pipeline Fix

### Release Details
- **Version**: 2.1.0
- **Date**: September 18, 2025
- **Status**: Stable

### Key Features
1. **Fixed Settlement Pipeline Display**
   - Numbers now add up correctly: 2250 = 237 + 575 + 1338 + 100
   - Mutually-exclusive state model implemented

2. **Fixed BigInt Conversion Error**
   - `/api/pipeline/summary` endpoint now handles missing dates properly
   - Default date range: 14 days

3. **Added Info Icon with Tooltip**
   - Settlement lifecycle explanation
   - Visual guide for each pipeline stage

4. **Fixed Tab Badge Counts**
   - Manual Upload and Connectors now show correct counts
   - Split Unmatched tab into PG and Bank tabs

### Data Distribution
```
Total Captured: 2250 transactions
├── In Settlement: 237 (10.5%)
├── Sent to Bank: 575 (25.6%)
├── Credited: 1338 (59.5%)
└── Unsettled: 100 (4.4%)
```

## Files Included in Backups

### Backend
- `services/overview-api/index.js` - Main API server
- `services/overview-api/analytics-endpoints.js` - Analytics endpoints
- `services/overview-api/analytics-v3-endpoints.js` - V3 analytics
- `services/overview-api/package.json` - Dependencies

### Frontend Components
- `src/components/SettlementPipeline.tsx` - Pipeline visualization
- `src/components/ManualUploadEnhanced.tsx` - Manual upload UI
- `src/components/ConnectorsAutomated.tsx` - Connectors UI

### Frontend Pages
- `src/pages/Overview.tsx` - Main overview page
- `src/pages/ops/OverviewConsistent.tsx` - Consistent overview

### Hooks & Utilities
- `src/hooks/opsOverview.ts` - Data fetching hooks
- `src/router.tsx` - Application routing

### Configuration
- `package.json` - Project dependencies
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Vite build configuration
- `tailwind.config.js` - Tailwind CSS configuration

## Backup Structure
```
versions/
└── v2.1.0_20250918_084808/
    ├── manifest.json           # Version metadata
    ├── state-snapshot.json     # System state at backup time
    ├── services/              # Backend services
    │   └── overview-api/
    ├── src/                   # Frontend source
    │   ├── components/
    │   ├── pages/
    │   ├── hooks/
    │   └── router.tsx
    └── *.config.*             # Configuration files
```

## Manifest File
Each backup includes a `manifest.json` with:
- Version number and name
- Timestamp
- Description of changes
- List of modifications
- Service port mappings

## Version Control Commands

### Main Script: `version-control.sh`

```bash
# List all backups
./version-control.sh list

# Create new backup
./version-control.sh backup

# Rollback to version
./version-control.sh rollback v2.1.0

# Show backup info
./version-control.sh info versions/v2.1.0_20250918_084808

# Compare current with backup
./version-control.sh compare versions/v2.1.0_20250918_084808

# Clean old backups (keeps last 5 per version)
./version-control.sh clean
```

## Testing After Rollback

### 1. Verify API Endpoints
```bash
# Test pipeline endpoint
curl -s 'http://localhost:5105/api/pipeline/summary' | python3 -m json.tool

# Expected output:
{
    "ingested": 2250,
    "inSettlement": 237,
    "reconciled": 575,
    "settled": 1338,
    "unsettled": 100
}
```

### 2. Check Dashboard
- Open http://localhost:5174/ops/overview
- Verify Settlement Pipeline shows: 237 + 575 + 1338 + 100 = 2250
- Check for info icon (ℹ️) with tooltip
- Confirm tab badges show correct counts

### 3. Verify Services
```bash
# Check running services
lsof -i :5105  # Overview API
lsof -i :5174  # Frontend
```

## Rollback Safety

The rollback process:
1. Stops all services gracefully
2. Backs up current state (optional)
3. Restores files from backup
4. Restarts services automatically
5. Creates rollback log for audit

## Troubleshooting

### Service Won't Start
```bash
# Kill stuck processes
lsof -ti:5105 | xargs kill -9

# Restart manually
cd services/overview-api && node index.js > /tmp/overview-api.log 2>&1 &
```

### Frontend Not Updating
```bash
# Clear Vite cache
rm -rf node_modules/.vite

# Restart dev server
npm run dev -- --port 5174
```

### Backup Missing Files
```bash
# Create manual backup
./version-control.sh backup
```

## Best Practices

1. **Before Major Changes**: Always create a backup
2. **Daily Backups**: Run `./version-control.sh backup` daily
3. **Test Rollbacks**: Periodically test rollback process
4. **Clean Old Backups**: Run `./version-control.sh clean` weekly
5. **Document Changes**: Update VERSION_*.md files

## Support Files

- `VERSION_2.1.0_SETTLEMENT_PIPELINE.md` - Detailed version documentation
- `backup-v2.1.0.sh` - Version-specific backup script
- `rollback-v2.1.0-complete.sh` - Version-specific rollback script
- `version-control.sh` - Master version control manager

## Recovery Procedure

If something goes wrong:

1. **Stop all services**
   ```bash
   pkill -f node
   ```

2. **Find latest working backup**
   ```bash
   ./version-control.sh list
   ```

3. **Rollback to that version**
   ```bash
   ./version-control.sh rollback versions/[backup_dir]
   ```

4. **Verify restoration**
   ```bash
   curl -s 'http://localhost:5105/api/pipeline/summary' | python3 -m json.tool
   ```

## Contact
For issues or questions about the versioning system, check the backup logs in the `versions/` directory or the rollback logs in the project root.