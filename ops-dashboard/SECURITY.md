# Security Policy

## Overview

This document outlines the security features and practices implemented in the SettlePaisa 2.0 Ops Dashboard. Our security architecture follows industry best practices and implements multiple layers of protection for authentication, authorization, data protection, and API security.

---

## Implemented Security Features

### 1. Authentication & Authorization

#### JWT-Based Authentication
- **Implementation**: JSON Web Tokens (JWT) using `jsonwebtoken` v9.0.2
- **Token Lifetime**: Configurable via `JWT_EXPIRES_IN` environment variable
- **Secret Management**: JWT secret stored securely in environment variables
- **Session Tracking**: Active sessions tracked in database (`sp_v2_user_sessions` table)
- **Token Validation**: Every request validates token signature and checks active session status
- **Automatic Revocation**: Sessions can be revoked, automatically invalidating all tokens

#### Role-Based Access Control (RBAC)
Four distinct roles with hierarchical permissions:

| Role | Permissions | Use Case |
|------|-------------|----------|
| **ADMIN** | Full system access, user management, configuration | System administrators |
| **OPS_MANAGER** | Operations management, approvals, reporting | Operations team leads |
| **OPS_VIEWER** | Read-only access to operational data | Operations analysts |
| **FINANCE** | Financial data access, settlement approvals | Finance team |

#### Password Security
- **Hashing Algorithm**: bcryptjs with cost factor 10
- **Password Requirements**: Minimum 8 characters (configurable)
- **No Plain Text Storage**: All passwords hashed before database storage
- **Salt Generation**: Automatic unique salt per password

**Implementation Files**:
- `services/shared/authMiddleware.cjs` - Authentication middleware
- `services/overview-api/auth.cjs` - Login, registration, session management
- `services/overview-api/middleware/authMiddleware.cjs` - RBAC authorization

---

### 2. API Security

#### CORS (Cross-Origin Resource Sharing)
- **Configuration**: Whitelist-based origin control
- **Approved Origins**:
  - Production: `https://settlepaisaops.sabpaisa.in`
  - Staging: `http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com`
  - Local Development: `http://localhost:5174`
- **Credentials Support**: Enabled for cookie and authorization header support
- **Method**: Blocks all requests from non-whitelisted origins

**Implementation File**: `services/shared/corsConfig.cjs`

#### Rate Limiting
Protection against brute force attacks and API abuse using `express-rate-limit`:

| Limiter | Limit | Window | Applied To |
|---------|-------|--------|------------|
| **API Limiter** | 100 requests | 15 minutes | All API endpoints |
| **Auth Limiter** | 5 failed attempts | 15 minutes | Login endpoint |
| **Upload Limiter** | 10 uploads | 1 hour | File upload endpoints |
| **Strict Limiter** | 3 requests | 1 hour | Critical operations |

**Features**:
- IP-based tracking for unauthenticated requests
- User ID-based tracking for authenticated requests
- Automatic counter reset after time window
- Skips successful authentication attempts (only counts failures)

**Implementation File**: `services/shared/rateLimiter.cjs`

---

### 3. Data Protection

#### SQL Injection Prevention
- **Method**: Parameterized queries using PostgreSQL prepared statements
- **Library**: `pg` (node-postgres) with parameter binding
- **No String Interpolation**: All user input passed as parameters, never concatenated

**Example**:
```javascript
// ✅ SECURE: Parameterized query
pool.query('SELECT * FROM users WHERE email = $1', [userEmail]);

// ❌ INSECURE: Never used
pool.query(`SELECT * FROM users WHERE email = '${userEmail}'`);
```

#### Input Validation
- **File Uploads**: MIME type validation, file size limits
- **Path Traversal Protection**: Sanitized file paths
- **XSS Prevention**: Input sanitization on all user-provided data
- **Type Validation**: Schema validation for API payloads

#### Sensitive Data Handling
- **No Secrets in Code**: All secrets stored in environment variables
- **Database Credentials**: Loaded from `.env` files, never committed
- **JWT Secret**: Generated securely, stored in environment
- **Session Data**: Encrypted in database

---

### 4. Transport Security

#### HTTPS/TLS
- **Production**: HTTPS enforced via Application Load Balancer (ALB)
- **Certificate**: AWS Certificate Manager (ACM) managed certificates
- **Database**: SSL/TLS connections to Amazon RDS (PostgreSQL)
- **Auto-Detection**: SSL automatically enabled for RDS endpoints

**Implementation**:
```javascript
const isRDS = dbHost.includes('.rds.amazonaws.com');
const pool = new Pool({
  ssl: isRDS ? { rejectUnauthorized: false } : false
});
```

---

### 5. Service-Level Security

#### Protected Services

| Service | Port | Authentication | CORS | Rate Limiting | RBAC |
|---------|------|----------------|------|---------------|------|
| **Overview API** | 5108 | ✅ JWT | ✅ Whitelist | ✅ 100/15min | ✅ All roles |
| **Registration** | 5108 | ✅ JWT | ✅ Whitelist | ✅ 5/15min | ✅ Admin only |
| **Exports API** | 5113 | ✅ JWT | ✅ Whitelist | ✅ 100/15min | ✅ Ops staff |
| **Chargeback API** | 5106 | ✅ JWT | ✅ Whitelist | ✅ 100/15min | ✅ Ops staff |
| **Upload API** | 5107 | ✅ JWT | ✅ Whitelist | ✅ 10/hour | ✅ Ops staff |
| **Recon API** | 5103 | ✅ JWT | ✅ Whitelist | ✅ 100/15min | ✅ Ops staff |
| **Settlement API** | 5104 | ✅ JWT | ✅ Whitelist | ✅ 100/15min | ✅ Manager/Admin |

---

## Security Audit & Compliance

### Compliance Scores
- **Initial Assessment**: 37% compliant (February 2025)
- **Current Status**: 80% compliant (November 2025)
- **Target**: 95% by Q1 2026

### Recent Security Improvements (November 2025)
1. ✅ Secured registration endpoint (admin-only access)
2. ✅ Added full security to Exports API
3. ✅ Added full security to Chargeback API
4. ✅ Implemented rate limiting across all services
5. ✅ Hardened CORS configuration (whitelist-only)
6. ✅ Added database session tracking for JWT tokens

### Security Documentation
- **Security Audit**: [`security/README.md`](./security/README.md)
- **Implementation Guide**: [`SECURITY_FIXES_COMPLETE_NOV5.md`](./SECURITY_FIXES_COMPLETE_NOV5.md)
- **Compliance Checklist**: [`security/reports/CHECKLIST-MAPPING.md`](./security/reports/CHECKLIST-MAPPING.md)
- **Security Testing**: [`TESTING_COVERAGE_ANALYSIS_NOV5.md`](./TESTING_COVERAGE_ANALYSIS_NOV5.md)

---

## Reporting Security Vulnerabilities

### Responsible Disclosure Policy

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly:

**Email**: security@sabpaisa.in

**Please Include**:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Your contact information (optional for acknowledgment)

**Response Timeline**:
- Initial response: Within 48 hours
- Status update: Within 7 days
- Resolution timeline: Depends on severity (Critical: 7 days, High: 14 days, Medium: 30 days)

**Disclosure Policy**:
- Please allow us reasonable time to address the issue before public disclosure
- We will acknowledge your contribution in our security advisories (unless you prefer anonymity)

---

## Security Best Practices for Developers

### When Adding New Endpoints

1. **Always require authentication**:
   ```javascript
   app.use(authenticate);  // Apply to all routes
   ```

2. **Use appropriate authorization**:
   ```javascript
   app.post('/admin-only', authenticate, adminOnly, handler);
   app.get('/ops-only', authenticate, opsStaffOnly, handler);
   ```

3. **Apply rate limiting**:
   ```javascript
   app.post('/critical', apiLimiter, strictLimiter, handler);
   ```

4. **Use CORS whitelist**:
   ```javascript
   app.use(cors(corsConfig));  // Never use cors() without config
   ```

5. **Parameterize all queries**:
   ```javascript
   pool.query('SELECT * FROM table WHERE id = $1', [userId]);
   ```

### Environment Variables

**Required for all services**:
- `JWT_SECRET` - JWT signing secret (minimum 32 characters)
- `JWT_EXPIRES_IN` - Token lifetime (default: 24h)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Database credentials

**Never commit**:
- `.env` files
- `credentials.json` files
- Any file containing secrets or API keys

---

## Security Testing

### Automated Testing
- **Framework**: Jest 30.2.0
- **Authentication Tests**: 70+ test cases covering JWT, password validation, RBAC
- **Integration Tests**: API security endpoint testing
- **Coverage Target**: 60% (branches, functions, lines, statements)

See [`TESTING.md`](./TESTING.md) for detailed testing documentation.

### Security Test Checklist

Before deploying:
- [ ] All endpoints require authentication (except login/public endpoints)
- [ ] RBAC authorization applied to sensitive endpoints
- [ ] Rate limiting configured appropriately
- [ ] CORS whitelist verified
- [ ] No secrets in code or committed files
- [ ] SQL queries parameterized
- [ ] Input validation on all user inputs
- [ ] SSL/TLS enabled for production
- [ ] Session management working correctly

---

## Incident Response

### In Case of Security Breach

1. **Immediate Actions**:
   - Rotate JWT secret (invalidates all tokens)
   - Revoke all active sessions in database
   - Block compromised IP addresses (if applicable)
   - Review access logs for unauthorized access

2. **Investigation**:
   - Identify breach vector
   - Assess data exposure
   - Document timeline of events

3. **Remediation**:
   - Fix vulnerability
   - Deploy patch to production
   - Reset affected user passwords (if needed)

4. **Communication**:
   - Notify affected users (if PII exposed)
   - Report to compliance team
   - Update security documentation

---

## Security Contacts

- **Security Team**: security@sabpaisa.in
- **Infrastructure Team**: ops@sabpaisa.in
- **Compliance Team**: compliance@sabpaisa.in

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | November 5, 2025 | Complete security overhaul: JWT, CORS, rate limiting, RBAC |
| 1.5 | October 2025 | Added authentication to core services |
| 1.0 | September 2025 | Initial security implementation |

---

**Last Updated**: November 5, 2025
**Maintained By**: SettlePaisa Engineering Team
