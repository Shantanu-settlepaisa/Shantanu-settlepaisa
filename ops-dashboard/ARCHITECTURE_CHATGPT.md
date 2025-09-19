# SettlePaisa 2.0 Operations Dashboard - Technical Documentation

## Executive Summary
SettlePaisa 2.0 is a modern payment reconciliation platform built with React, Node.js, and TypeScript. It provides automated and manual reconciliation capabilities for payment gateways and banks, with real-time monitoring and comprehensive exception handling.

## Technology Stack

### Frontend Technologies
| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Core Framework** | React | 18.2.0 | UI component library |
| **Language** | TypeScript | 5.0.2 | Type-safe JavaScript |
| **Build Tool** | Vite | 4.4.5 | Fast development and building |
| **Routing** | React Router DOM | 6.14.1 | Client-side routing |
| **State Management** | React Query | 4.29.19 | Server state management |
| **Styling** | Tailwind CSS | 3.3.0 | Utility-first CSS framework |
| **HTTP Client** | Axios | 1.4.0 | API communication |
| **Charts** | Recharts | 2.7.2 | Data visualization |
| **Icons** | Lucide React | Latest | Icon components |
| **Date Utils** | date-fns | 2.30.0 | Date manipulation |

### Backend Technologies
| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Runtime** | Node.js | 18+ | JavaScript runtime |
| **Framework** | Express.js | 4.18.2 | Web application framework |
| **CORS** | cors | 2.8.5 | Cross-origin resource sharing |
| **UUID** | uuid | 9.0.0 | Unique identifier generation |

### Database Architecture (Planned)
| Component | Technology | Purpose |
|-----------|------------|---------|
| **Primary DB** | PostgreSQL | Transactional data storage |
| **Caching** | Redis | Performance optimization |
| **Queue** | RabbitMQ/SQS | Async job processing |

## System Architecture

### High-Level Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                      │
│                          Port: 5174                          │
├─────────────────────────────────────────────────────────────┤
│                         API Gateway                          │
│                    (Future: Kong/Nginx)                      │
├──────────────┬──────────────┬──────────────┬───────────────┤
│  Recon API   │  Mock PG API │ Mock Bank API│ Overview API  │
│  Port: 5103  │  Port: 5101  │  Port: 5102  │  Port: 5104   │
├──────────────┴──────────────┴──────────────┴───────────────┤
│                      PostgreSQL Database                     │
│              (reconciliation_results, jobs, etc.)            │
└─────────────────────────────────────────────────────────────┘
```

### Microservices Architecture

#### 1. Reconciliation API Service (Port 5103)
Primary service handling reconciliation logic, job management, and data aggregation.

**Key Endpoints:**
- `POST /recon/run` - Initiate reconciliation job
- `GET /recon/jobs/:jobId/summary` - Fetch job summary
- `GET /recon/jobs/:jobId/results` - Fetch detailed results
- `GET /recon/sources/summary` - Aggregated overview data
- `GET /recon/health` - Service health check

#### 2. Mock Payment Gateway API (Port 5101)
Simulates payment gateway data for development and testing.

**Key Endpoints:**
- `GET /api/pg/transactions` - Fetch PG transactions
- `GET /health` - Service health check

#### 3. Mock Bank API (Port 5102)
Simulates bank statement data for development and testing.

**Key Endpoints:**
- `GET /api/bank/:bankName/recon` - Fetch bank reconciliation data
- `GET /health` - Service health check

## Database Schema

### Core Tables

#### reconciliation_jobs
```sql
CREATE TABLE reconciliation_jobs (
    id UUID PRIMARY KEY,
    correlation_id UUID,
    source_type VARCHAR(50), -- 'manual' or 'connector'
    status VARCHAR(50), -- 'pending', 'running', 'completed', 'failed'
    merchant_id VARCHAR(100),
    acquirer_id VARCHAR(100),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    counters JSONB,
    error JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### reconciliation_results
```sql
CREATE TABLE reconciliation_results (
    id UUID PRIMARY KEY,
    job_id UUID REFERENCES reconciliation_jobs(id),
    txn_id VARCHAR(100),
    utr VARCHAR(100),
    rrn VARCHAR(100),
    pg_amount_paise BIGINT,
    bank_amount_paise BIGINT,
    delta_paise BIGINT,
    pg_date DATE,
    bank_date DATE,
    status VARCHAR(50), -- 'MATCHED', 'UNMATCHED_PG', 'UNMATCHED_BANK', 'EXCEPTION'
    reason_code VARCHAR(50),
    reason_label TEXT,
    finalized BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Frontend Architecture

### Component Structure
```
src/
├── pages/               # Page-level components
│   └── ops/
│       ├── Overview.tsx         # Dashboard overview
│       └── ReconWorkspace.tsx   # Workspace for reconciliation
│
├── components/          # Reusable components
│   ├── Overview/        # Overview-specific components
│   ├── recon/          # Reconciliation components
│   ├── connectors/     # Connector-related components
│   └── common/         # Shared components
│
├── services/           # API service layers
│   ├── api.ts          # Base API configuration
│   └── reconciliation.ts # Reconciliation API calls
│
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
├── types/              # TypeScript type definitions
└── shared/             # Shared resources
    └── reconMap.ts     # Data mapping utilities
```

### State Management Strategy
1. **Server State**: React Query for caching and synchronization
2. **Local UI State**: React useState/useContext
3. **Form State**: React Hook Form (planned)
4. **Global State**: Context API for theme, user preferences

## API Design Patterns

### RESTful Conventions
```
GET    /resource          # List resources
GET    /resource/:id      # Get specific resource
POST   /resource          # Create resource
PUT    /resource/:id      # Update resource
DELETE /resource/:id      # Delete resource
```

### Response Format
```json
{
  "success": true,
  "data": {},
  "error": null,
  "metadata": {
    "timestamp": "2025-09-15T10:00:00Z",
    "version": "1.0.0"
  }
}
```

### Error Response Format
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {},
    "hint": "Check the input format"
  }
}
```

## Key Features Implementation

### 1. Manual File Upload
**Tech Stack**: React Dropzone + File API + FormData

**Flow:**
1. User drags/drops files
2. Frontend validates file format
3. Files uploaded to `/recon/upload`
4. Backend processes and returns job ID
5. Frontend polls for job status
6. Results displayed in real-time

### 2. Automated Reconciliation
**Tech Stack**: Node-cron + SFTP Client + REST APIs

**Flow:**
1. Cron job triggers at scheduled time
2. Fetch data from bank APIs/SFTP
3. Fetch data from PG APIs
4. Run reconciliation algorithm
5. Store results in database
6. Send notifications for exceptions

### 3. Reconciliation Algorithm
```javascript
// Pseudo-code for matching logic
function reconcileTransactions(pgData, bankData) {
  const matched = [];
  const unmatchedPG = [];
  const unmatchedBank = [];
  const exceptions = [];
  
  // UTR-based matching
  for (const pgTxn of pgData) {
    const bankTxn = bankData.find(b => b.utr === pgTxn.utr);
    
    if (bankTxn) {
      if (Math.abs(pgTxn.amount - bankTxn.amount) < TOLERANCE) {
        matched.push({ pg: pgTxn, bank: bankTxn });
      } else {
        exceptions.push({ 
          type: 'AMOUNT_MISMATCH', 
          pg: pgTxn, 
          bank: bankTxn 
        });
      }
    } else {
      unmatchedPG.push(pgTxn);
    }
  }
  
  // Find unmatched bank transactions
  unmatchedBank = bankData.filter(b => 
    !matched.some(m => m.bank.utr === b.utr)
  );
  
  return { matched, unmatchedPG, unmatchedBank, exceptions };
}
```

## Development Workflow

### Local Development Setup
```bash
# Clone repository
git clone https://github.com/settlepaisa/ops-dashboard.git
cd ops-dashboard

# Install dependencies
npm install

# Start frontend (Port 5174)
npm run dev

# Start backend services
cd services/recon-api && npm start
cd services/mock-pg-api && npm start
cd services/mock-bank-api && npm start
```

### Environment Configuration
```env
# Frontend (.env.local)
VITE_API_BASE_URL=http://localhost:5103
VITE_ENV=development
VITE_ENABLE_MOCK_DATA=true

# Backend (.env)
NODE_ENV=development
PORT=5103
DATABASE_URL=postgresql://user:pass@localhost:5432/settlepaisa
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

## Security Considerations

### Authentication & Authorization
- JWT-based authentication (planned)
- Role-based access control (RBAC)
- API key authentication for service-to-service

### Data Security
- All sensitive data encrypted at rest
- TLS/SSL for data in transit
- PII data masking in logs
- Input validation and sanitization
- SQL injection prevention via parameterized queries

### API Security
- Rate limiting per endpoint
- Request size limits
- CORS configuration
- API versioning
- Request signing for critical operations

## Performance Optimization

### Frontend Optimization
- Code splitting with React.lazy()
- Image optimization with WebP
- Bundle size optimization
- Virtual scrolling for large lists
- Memoization with React.memo()

### Backend Optimization
- Database connection pooling
- Query optimization with indexes
- Caching with Redis
- Pagination for large datasets
- Async/await for I/O operations

### Monitoring & Observability
- Application Performance Monitoring (APM)
- Error tracking with Sentry
- Logging with Winston/Bunyan
- Metrics with Prometheus
- Distributed tracing

## Testing Strategy

### Frontend Testing
```javascript
// Unit Testing with Jest + React Testing Library
describe('ReconResultsTable', () => {
  test('displays correct matched count', () => {
    const { getByText } = render(
      <ReconResultsTable matchedCount={10} />
    );
    expect(getByText('10')).toBeInTheDocument();
  });
});
```

### Backend Testing
```javascript
// Integration Testing with Mocha/Jest
describe('POST /recon/run', () => {
  it('should create a new reconciliation job', async () => {
    const response = await request(app)
      .post('/recon/run')
      .send({ date: '2025-09-15', merchantId: 'M1' });
    
    expect(response.status).toBe(200);
    expect(response.body.jobId).toBeDefined();
  });
});
```

### E2E Testing
- Cypress for end-to-end testing
- Playwright for cross-browser testing

## Deployment Architecture

### Container Strategy
```dockerfile
# Frontend Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
```

### CI/CD Pipeline
1. **Source Control**: GitHub/GitLab
2. **CI**: GitHub Actions/Jenkins
3. **Container Registry**: Docker Hub/ECR
4. **Orchestration**: Kubernetes/ECS
5. **Monitoring**: DataDog/New Relic

### Infrastructure as Code
```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ops-dashboard
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ops-dashboard
  template:
    metadata:
      labels:
        app: ops-dashboard
    spec:
      containers:
      - name: frontend
        image: settlepaisa/ops-dashboard:latest
        ports:
        - containerPort: 80
```

## Scaling Considerations

### Horizontal Scaling
- Load balancer (AWS ALB/NLB)
- Auto-scaling groups
- Database read replicas
- Caching layer (Redis/Memcached)

### Vertical Scaling
- Optimize database queries
- Increase instance sizes
- Memory optimization
- Connection pooling

## Maintenance & Support

### Logging Standards
```javascript
// Structured logging
logger.info({
  event: 'reconciliation_completed',
  jobId: 'uuid',
  duration: 1234,
  matched: 100,
  exceptions: 5
});
```

### Error Handling
```javascript
// Centralized error handling
class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}
```

## Future Enhancements

### Phase 1 (Q1 2025)
- [ ] PostgreSQL integration
- [ ] Authentication system
- [ ] Real bank API integration
- [ ] Email notifications

### Phase 2 (Q2 2025)
- [ ] Machine learning for auto-matching
- [ ] Advanced analytics dashboard
- [ ] Multi-tenant support
- [ ] API rate limiting

### Phase 3 (Q3 2025)
- [ ] Mobile application
- [ ] Webhook support
- [ ] Audit logging
- [ ] Compliance reporting

## Contact & Resources

### Documentation
- API Documentation: `/docs/api`
- User Guide: `/docs/user-guide`
- Developer Guide: `/docs/developer`

### Support
- GitHub Issues: [github.com/settlepaisa/ops-dashboard/issues]
- Email: tech@settlepaisa.com
- Slack: #ops-dashboard-support

### License
MIT License - See LICENSE file for details

---

*Last Updated: September 2025*
*Version: 2.0.0*