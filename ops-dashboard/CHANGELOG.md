# Changelog

All notable changes to the Ops Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-09-18

### Added
- Recon Rule Settings feature with complete CRUD operations
  - Feature flag: FEATURE_RECON_RULE_SETTINGS
  - Admin-only access with RBAC
  - Backend API at /api/recon-rules with all endpoints
  - Frontend components: RuleList, RuleEditor, ReconRuleSettings
  - Import/Export functionality
  - Simulation capability (mock data)
- Version management system
  - Semantic versioning support
  - Git tag-based versioning
  - Backup and rollback capabilities
  - Version comparison tools

### Fixed
- Manual Upload data display issues
  - Fixed Bank Amount column showing blank
  - Fixed Status column showing blank
  - Fixed Exceptions tab showing "No results found"
- Reconciliation tab filtering
  - Fixed tab counts not matching displayed results
  - Fixed Unmatched Bank entries appearing in Exceptions tab
  - Removed duplicate client-side filtering
- API status mapping
  - Fixed status normalization between API and frontend
  - Fixed filtering for exceptions vs unmatchedBank

### Changed
- ReconResultsTable now relies on API filtering instead of client-side filtering
- Status values normalized to uppercase in frontend
- API properly maps frontend status filters to backend values

## [2.0.0] - 2025-09-17

### Added
- Complete Ops Dashboard implementation
- Reconciliation Workspace with Manual Upload and Connectors
- Overview page with KPIs and analytics
- Exceptions management
- Disputes and Chargebacks workflow
- Reports and Analytics sections
- Data Sources management
- Settlement pipeline visualization

### Changed
- Migrated from version 1.x architecture
- New React + TypeScript + Vite stack
- Enhanced reconciliation engine

### Fixed
- Initial bug fixes and optimizations

## [1.0.0] - 2025-09-01

### Added
- Initial release of Ops Dashboard
- Basic reconciliation functionality
- Simple overview page
- Manual file upload capability