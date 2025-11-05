# SettlePaisa Ops Dashboard

A powerful, production-grade operations console for PA/PG→Bank→Merchant reconciliation workflows.

## Features

- 🎯 **Real-time KPI Monitoring** - Track reconciliation status, exceptions, and settlement values
- 📊 **Reconciliation Workspace** - Kanban/List views with file upload and normalization
- 💰 **Settlement Management** - Detailed breakdown with fee/tax analysis
- ⚠️ **Exception Handling** - Work queue with investigation and resolution workflow
- 🔌 **Data Source Monitoring** - Real-time connectivity and sync status
- 📈 **Analytics & Reports** - Trends, insights, and automated report generation
- 🔒 **Role-Based Access** - Secure access for sp-ops, sp-finance, sp-compliance

## Quick Start

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser
http://localhost:5174
```

### Demo Login

In demo mode, any credentials work. Select your role during login:
- **Operations**: sp-ops role
- **Finance**: sp-finance role
- **Compliance**: sp-compliance role

## Development

### Environment Variables

Create `.env.development`:

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_USE_MOCK_API=true
VITE_DEMO_MODE=true
```

### Project Structure

```
src/
├── components/      # Reusable UI components
├── layouts/         # Layout components
├── lib/            # Utilities and API clients
├── pages/          # Page components
│   └── ops/        # Ops dashboard pages
├── router.tsx      # Application routing
└── main.tsx        # Entry point
```

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## API Integration

The dashboard can work in two modes:

1. **Mock Mode** (default): Uses mock data for development
2. **API Mode**: Connects to real backend APIs

Toggle via `VITE_USE_MOCK_API` environment variable.

### API Endpoints

- `/ops/overview/*` - Dashboard metrics and KPIs
- `/ops/recon/*` - Reconciliation management
- `/ops/settlements/*` - Settlement details
- `/ops/exceptions/*` - Exception handling
- `/ops/analytics/*` - Analytics and reports

## Key Technologies

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Styling
- **React Router v6** - Routing
- **Zustand** - State management
- **Lucide React** - Icons

## RBAC Implementation

### Supported Roles

- `sp-ops` - Full operations access
- `sp-finance` - Financial operations
- `sp-compliance` - Compliance and audit
- `auditor` - Read-only (future)
- `merchant-*` - No access to ops dashboard

### Access Control

- Route-level protection via `ProtectedRoute` component
- API authorization via `X-User-Role` header
- UI element visibility based on user role

## Security Features

### Authentication & Authorization
- **JWT-based authentication** with database session tracking
- **Password hashing** using bcryptjs (10 rounds)
- **Role-based access control (RBAC)** with 4 roles: ADMIN, OPS_MANAGER, OPS_VIEWER, FINANCE
- **Session management** with token revocation support

### API Protection
- **CORS whitelist** (production/staging/local origins only)
- **Rate limiting**:
  - General API: 100 requests/15 minutes
  - Authentication: 5 failed attempts/15 minutes
  - File uploads: 10 uploads/hour
- **Input validation** and SQL injection prevention
- **Parameterized queries** for all database operations

### Transport Security
- **HTTPS/TLS** enforced in production via ALB
- **SSL/TLS database connections** to Amazon RDS
- **No secrets in code** - all credentials in environment variables

### Documentation
- **Security implementation**: [`SECURITY_FIXES_COMPLETE_NOV5.md`](./SECURITY_FIXES_COMPLETE_NOV5.md)
- **Security audit**: [`security/README.md`](./security/README.md)
- **Vulnerability reporting**: See [`SECURITY.md`](./SECURITY.md)

For detailed security documentation, see [SECURITY.md](./SECURITY.md).

## Reconciliation Workflow

1. **File Upload** - Manual upload or SFTP/API ingestion
2. **Normalization** - Template-based field mapping
3. **Matching** - Auto-match with confidence scoring
4. **Exception Resolution** - Investigation and resolution

## Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Docker build
docker build -t settlepaisa-ops-dashboard .
```

## Testing

### Test Infrastructure
- **Framework**: Jest 30.2.0
- **Total Tests**: 71 tests (58 passing - 81.7%)
- **Coverage Target**: 60% (branches, functions, lines, statements)
- **Coverage Reports**: `coverage/lcov-report/index.html`

### Test Suites
- **Reconciliation Matching** (58 tests) - UTR matching, confidence scoring
- **Settlement Calculator** (19 tests) - Commission, GST, reserve calculations
- **Authentication** (70+ tests) - JWT, password validation, RBAC
- **API Integration** (5 tests) - HTTP endpoint testing
- **React Components** (12 tests) - UI component testing

### Running Tests

```bash
# Run all tests
npm test

# Generate coverage report
npm run test:coverage

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run in watch mode
npm run test:watch
```

For detailed testing documentation, see [TESTING.md](./TESTING.md).

## Contributing

1. Create feature branch
2. Make changes
3. Run linter: `npm run lint`
4. Build: `npm run build`
5. Submit PR

## Support

- Engineering: engineering@settlepaisa.com
- Operations: ops@settlepaisa.com

## License

Private - SettlePaisa Internal Use Only

---

### Generate complete data/schema context
```bash
make data-context
# Outputs (in docs/context/):
# - DATASET_DICTIONARY.md           (tables, columns, PK/FK)
# - VIEWS_AND_LINEAGE.md            (views, materialized views, Mermaid lineage)
# - OPS_TILE_MAP.md                 (Tile → API → SQL/View → Tables)
# - SCHEMA_CONTEXT.md               (counts & pointers)
# - context_index.json              (machine-readable index)
```

**Version**: 1.0.0  
**Last Updated**: 2025-09-09