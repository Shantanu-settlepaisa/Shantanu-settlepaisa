# Versioning and Rollback Guide

## Overview
The Ops Dashboard uses semantic versioning and Git tags for version management. This guide explains how to use the versioning system for releases and rollbacks.

## Current Version
- **Version**: 2.1.0
- **Released**: 2025-09-18
- **Status**: Stable

## Quick Start

### Check Current Version
```bash
./scripts/version-manager.sh current
```

### List All Versions
```bash
./scripts/version-manager.sh list
```

### Create a New Version
```bash
# Create a patch version (bug fixes)
./scripts/version-manager.sh tag 2.1.1

# Create a minor version (new features)
./scripts/version-manager.sh tag 2.2.0

# Create a major version (breaking changes)
./scripts/version-manager.sh tag 3.0.0
```

### Create a Backup
```bash
./scripts/version-manager.sh backup
```

### Rollback to Previous Version
```bash
# Rollback to version 2.0.0
./scripts/version-manager.sh rollback 2.0.0
```

## Detailed Commands

### 1. Version Tagging
Creates a new version with Git tag and updates VERSION file:
```bash
./scripts/version-manager.sh tag <version> [message]

# Examples:
./scripts/version-manager.sh tag 2.1.1 "Hotfix for reconciliation bug"
./scripts/version-manager.sh tag 2.2.0 "Add new reporting features"
```

### 2. Backup Management
Creates timestamped backups of current state:
```bash
# Create backup
./scripts/version-manager.sh backup

# Backups are stored in .backups/ directory
ls -la .backups/
```

### 3. Version Rollback
Safely rollback to a previous version:
```bash
# Rollback to specific version
./scripts/version-manager.sh rollback 2.0.0

# This will:
# 1. Create a backup of current state
# 2. Stash uncommitted changes
# 3. Checkout the tagged version
# 4. Update VERSION file
# 5. Reinstall dependencies if needed
```

### 4. Version Comparison
Compare changes between two versions:
```bash
./scripts/version-manager.sh compare 2.0.0 2.1.0
```

### 5. Version Export
Export a specific version as tarball:
```bash
./scripts/version-manager.sh export 2.1.0
# Creates: exports/ops-dashboard-2.1.0.tar.gz
```

## Version History

### v2.1.0 (Current)
- Added Recon Rule Settings feature
- Fixed reconciliation data display issues
- Added version management system

### v2.0.0
- Complete dashboard implementation
- New architecture with React + TypeScript + Vite
- Enhanced reconciliation engine

### v1.0.0
- Initial release
- Basic reconciliation functionality

## Rollback Scenarios

### Scenario 1: Feature Causing Issues
If a new feature is causing problems:
```bash
# 1. Create backup
./scripts/version-manager.sh backup

# 2. Rollback to last stable version
./scripts/version-manager.sh rollback 2.0.0

# 3. Create hotfix branch
git checkout -b hotfix/critical-bug

# 4. Fix the issue and create new version
./scripts/version-manager.sh tag 2.0.1 "Critical bug fix"
```

### Scenario 2: Emergency Rollback
For immediate rollback in production:
```bash
# Quick rollback (automatically creates backup)
./scripts/version-manager.sh rollback 2.0.0

# Restart services
./start-services.sh
npm run dev -- --port 5174
```

### Scenario 3: Rollback with Data Migration
If database schema changed:
```bash
# 1. Backup current database
pg_dump ops_dashboard > backup_$(date +%Y%m%d).sql

# 2. Rollback application
./scripts/version-manager.sh rollback 2.0.0

# 3. Apply database migrations if needed
# (Check migration scripts in db/migrations/)
```

## Best Practices

### Before Creating a New Version
1. Run tests: `npm test`
2. Build project: `npm run build`
3. Check for lint errors: `npm run lint`
4. Update CHANGELOG.md
5. Commit all changes

### Version Numbering
- **MAJOR** (X.0.0): Breaking changes, API incompatibilities
- **MINOR** (0.X.0): New features, backwards compatible
- **PATCH** (0.0.X): Bug fixes, small improvements

### Backup Strategy
- Create backups before major changes
- Keep at least 5 recent backups
- Store critical backups externally
- Test rollback procedure regularly

### Git Tag Management
```bash
# Push tags to remote
git push origin v2.1.0

# Delete local tag
git tag -d v2.1.0

# Delete remote tag
git push origin --delete v2.1.0

# List tags with details
git tag -n
```

## Troubleshooting

### Issue: Rollback Fails
```bash
# Check git status
git status

# Force checkout if needed
git checkout -f v2.0.0

# Reset if necessary (CAUTION: loses changes)
git reset --hard v2.0.0
```

### Issue: Dependencies Mismatch
```bash
# Clear node_modules
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Issue: Services Not Starting
```bash
# Kill existing processes
pkill -f "node.*ops-dashboard"

# Restart services
./start-services.sh
```

## Recovery from Backup

### Restore from Backup Tarball
```bash
# 1. Extract backup
cd .backups
tar -xzf backup_v2.1.0_20250918_120000.tar.gz

# 2. Review backup contents
cat backup_v2.1.0_20250918_120000/metadata.json

# 3. Restore files
cp -r backup_v2.1.0_20250918_120000/src ../
cp -r backup_v2.1.0_20250918_120000/services ../
cp backup_v2.1.0_20250918_120000/package*.json ../

# 4. Reinstall dependencies
cd ..
npm install
```

## CI/CD Integration

### Automated Versioning
```yaml
# .github/workflows/release.yml example
- name: Create Version
  run: |
    VERSION=$(cat VERSION)
    ./scripts/version-manager.sh tag $VERSION "Automated release"
    git push origin v$VERSION
```

### Rollback Pipeline
```yaml
# .github/workflows/rollback.yml example
- name: Rollback Version
  run: |
    ./scripts/version-manager.sh rollback ${{ github.event.inputs.version }}
```

## Support

For version-related issues:
1. Check CHANGELOG.md for version history
2. Review git logs: `git log --oneline -10`
3. Check backup directory: `ls -la .backups/`
4. Contact: ops-team@settlepaisa.com