# Staging 2 Configuration Reference

**Environment:** Staging 2
**Server:** EC2 Instance
**IP Address:** `52.66.199.215`
**Last Updated:** October 29, 2025
**Status:** ✅ All services validated and connected to RDS

⚠️ **WARNING:** This file contains sensitive configuration data. DO NOT commit passwords to public repositories.

---

## 📍 Server Details

| Property | Value |
|----------|-------|
| **Server IP** | `52.66.199.215` |
| **Frontend URL** | http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com |
| **Base Directory** | `/home/ec2-user/ops-dashboard/ops-dashboard` |
| **PM2 User** | `ec2-user` |
| **Node Version** | `16.20.2` (via NVM) |

---

## 🗂️ Configuration File Hierarchy

### Master Configuration

**PM2 Ecosystem Config:**
`/home/ec2-user/ops-dashboard/ops-dashboard/ecosystem.config.cjs`

**Purpose:** Defines all 7 services for PM2 process manager
**Usage:**
```bash
pm2 start ecosystem.config.cjs --env staging
pm2 save
```

### Shared Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| **env-loader.cjs** | `services/shared/env-loader.cjs` | Centralized environment loading with validation |
| **health-check.cjs** | `services/shared/health-check.cjs` | Enhanced health check endpoints |
| **env.cjs** | `services/config/env.cjs` | Wrapper around shared env-loader |
| **corsConfig.cjs** | `services/config/corsConfig.cjs` | CORS origin whitelisting |

---

## 🔌 Active Services & Ports

| Service | Port | Entry Point | Status | Database |
|---------|------|-------------|--------|----------|
| **overview-api** | 5108 | `index.js` | ✅ Online | RDS |
| **upload-api** | 5107 | `file-upload-v2.cjs` | ✅ Online | RDS |
| **recon-api** | 5103 | `index.js` | ✅ Online | RDS |
| **settlement-api** | 5110 | `settlement-api.cjs` | ✅ Online | RDS |
| **settlement-queue-processor** | N/A | `settlement-queue-processor.cjs` | ✅ Online | RDS |
| **pg-ingestion** | 5111 | `pg-ingestion-server.cjs` | ✅ Online | RDS |
| **chargeback-api** | 5112 | `index.js` | ✅ Online | Mock (no DB) |

**API Base URL:** `http://52.66.199.215:<port>`

---

## 📋 Service-Specific Configurations

### 1. Overview API (Primary Configuration)

**Location:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/overview-api/.env`

```bash
# Server Configuration
PORT=5108
NODE_ENV=development  # Overridden to 'staging' by PM2

# Database - RDS PostgreSQL
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=settlepaisa_v2
DB_USER=postgres
DB_PASSWORD=SettlePaisa2024

# JWT Authentication (80 characters - strong)
JWT_SECRET=outFBOlSDcZ2G3f3F3/4Tta40vh5meZbF9droa7zJHYhydeBSqjX3FUI6LtSSdlu1y0lqBeYy1/dzzG7
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=7d

# Logging
LOG_LEVEL=info
SERVICE_NAME=overview-api
LOG_DIR=/var/log/ops-dashboard

# CORS
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Working Directory:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/overview-api`
**Entry Point:** `./index.js`
**Actual Port:** `5108`
**Uses Shared Loader:** ✅ Yes (via `config/env.cjs`)

---

### 2. Upload API (File Upload Service)

**Location:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/api/.env`

```bash
# Database - RDS PostgreSQL
DB_USER=postgres
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_NAME=settlepaisa_v2
DB_PASSWORD=SettlePaisa2024
DB_PORT=5432

# Server
PORT=5107
NODE_ENV=production

# CORS
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com

# SabPaisa V1 Database (for migration/sync)
SABPAISA_DB_HOST=3.108.237.99
SABPAISA_DB_NAME=sabpaisa_prod
```

**Working Directory:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/api`
**Entry Point:** `./file-upload-v2.cjs`
**Actual Port:** `5107`
**Uses Shared Loader:** ✅ Yes (directly imports `shared/env-loader.cjs`)
**Note:** JWT_SECRET loaded from `overview-api/.env` via shared loader fallback

---

### 3. Recon API (Reconciliation Engine)

**Location:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/recon-api/.env`

```bash
# Database - RDS PostgreSQL
DB_USER=postgres
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_NAME=settlepaisa_v2
DB_PASSWORD=SettlePaisa2024
DB_PORT=5432

# Server
PORT=5103
NODE_ENV=production

# JWT Authentication (128 characters)
JWT_SECRET=947f5db2aa2186785403ecfaec5d71e3bd1224a913f831ba41dee6f4ec2c1bf2ae37b80b9de8bbfe4ddf271dfeff98636f0dd08cc88360404712f180057d8022

# CORS
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com

# SabPaisa V1 Database (for data sync)
SABPAISA_DB_HOST=3.108.237.99
SABPAISA_DB_NAME=sabpaisa_prod

# Mock API URLs (for testing)
PG_API_URL=http://52.66.199.215:5101
BANK_API_URL=http://52.66.199.215:5102
```

**Working Directory:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/recon-api`
**Entry Point:** `./index.js`
**Actual Port:** `5103`
**Uses Shared Loader:** ✅ Yes (via `config/env.cjs`)

---

### 4. Settlement API

**Location:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/settlement-engine/.env`

```bash
# Database - RDS PostgreSQL
DB_USER=postgres
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_NAME=settlepaisa_v2
DB_PASSWORD=SettlePaisa2024
DB_PORT=5432

# Server
PORT=5109  # Note: Not used, actual port is 5110 from ecosystem config
NODE_ENV=production

# JWT Authentication (128 characters)
JWT_SECRET=947f5db2aa2186785403ecfaec5d71e3bd1224a913f831ba41dee6f4ec2c1bf2ae37b80b9de8bbfe4ddf271dfeff98636f0dd08cc88360404712f180057d8022

# CORS
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
```

**Working Directory:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/settlement-engine`

**Two services run from this directory:**

#### settlement-api
- **Entry Point:** `./settlement-api.cjs`
- **Actual Port:** `5110`
- **Uses Shared Loader:** ✅ Yes (via `config/env.cjs`)

#### settlement-queue-processor
- **Entry Point:** `./settlement-queue-processor.cjs`
- **Port:** N/A (background processor, no HTTP server)
- **Uses Shared Loader:** ✅ Yes (via `config/env.cjs`)

---

### 5. PG Ingestion (Payment Gateway Webhook Receiver)

**Location:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/pg-ingestion/.env`

```bash
# Database - RDS PostgreSQL
DB_USER=postgres
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_NAME=settlepaisa_v2
DB_PASSWORD=SettlePaisa2024
DB_PORT=5432

# Server
PORT=5101  # Note: Not used, actual port is 5111 from ecosystem config
NODE_ENV=production

# JWT Authentication (128 characters)
JWT_SECRET=947f5db2aa2186785403ecfaec5d71e3bd1224a913f831ba41dee6f4ec2c1bf2ae37b80b9de8bbfe4ddf271dfeff98636f0dd08cc88360404712f180057d8022

# CORS
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
```

**Working Directory:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/pg-ingestion`
**Entry Point:** `./pg-ingestion-server.cjs`
**Actual Port:** `5111`
**Uses Shared Loader:** ✅ Yes (directly imports `shared/env-loader.cjs`) - **Updated Oct 28, 2025**

---

### 6. Chargeback API (Mock Service)

**Location:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/chargeback-api/.env`

```bash
# Database - RDS PostgreSQL (Not actually used - mock service)
DB_USER=postgres
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_NAME=settlepaisa_v2
DB_PASSWORD=SettlePaisa2024
DB_PORT=5432

# Server
PORT=5106  # Note: Not used, actual port is 5112 from ecosystem config
NODE_ENV=production

# JWT Authentication (128 characters)
JWT_SECRET=947f5db2aa2186785403ecfaec5d71e3bd1224a913f831ba41dee6f4ec2c1bf2ae37b80b9de8bbfe4ddf271dfeff98636f0dd08cc88360404712f180057d8022

# CORS
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
```

**Working Directory:** `/home/ec2-user/ops-dashboard/ops-dashboard/services/chargeback-api`
**Entry Point:** `./index.js`
**Actual Port:** `5112`
**Uses Shared Loader:** ❌ No (mock service with hardcoded data)

---

## 🗄️ Database Configurations

### Primary Database (SettlePaisa V2)

**Type:** PostgreSQL on AWS RDS
**Endpoint:** `settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com`
**Port:** `5432`
**Database:** `settlepaisa_v2`
**Username:** `postgres`
**Password:** `SettlePaisa2024`

**Used by:** All services

**Connection String:**
```
postgresql://postgres:SettlePaisa2024@settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2
```

### Legacy Database (SabPaisa V1)

**Type:** PostgreSQL
**Endpoint:** `3.108.237.99`
**Port:** `5432` (default)
**Database:** `sabpaisa_prod`
**Username:** `settlepaisainternal` (default)

**Used by:**
- `upload-api` - For V1 to V2 data migration
- `recon-api` - For V1 data synchronization

---

## 🔐 Security Configurations

### JWT Secrets

⚠️ **Two different JWT secrets are currently in use:**

1. **overview-api:** `outFBOlSDcZ2G3f3F3/4Tta40vh5meZbF9droa7zJHYhydeBSqjX3FUI6LtSSdlu1y0lqBeYy1/dzzG7` (80 characters)
2. **Other services:** `947f5db2aa2186785403ecfaec5d71e3bd1224a913f831ba41dee6f4ec2c1bf2ae37b80b9de8bbfe4ddf271dfeff98636f0dd08cc88360404712f180057d8022` (128 characters)

**Note:** Services using the shared env-loader will automatically get JWT_SECRET from `overview-api/.env`, ensuring consistency.

**Token Expiration:**
- **Access Token:** 8 hours
- **Refresh Token:** 7 days

### CORS Configuration

**Allowed Origins:**
- `http://localhost:5174` (local development)
- `http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com` (staging frontend)
- `https://ops.settlepaisa.com` (production - for future use)

**Configuration Location:** `services/config/corsConfig.cjs`

**CORS Settings:**
- **Credentials:** Enabled
- **Methods:** GET, POST, PUT, DELETE, OPTIONS
- **Allowed Headers:** Content-Type, Authorization
- **Max Age:** 86400 seconds (24 hours)

---

## ⚙️ How Configuration Loading Works

### Configuration Loading Flow

```
1. PM2 starts service from ecosystem.config.cjs
   ↓
2. PM2 sets working directory (cwd) and environment variables
   ↓
3. Service loads via one of two methods:

   Method A (Most Services):
   - Import: require('../config/env.cjs')
   - Which calls: initEnv('overview-api')
   - Loads: services/overview-api/.env
   - Returns: Validated config object

   Method B (upload-api, pg-ingestion):
   - Import: require('../shared/env-loader.cjs')
   - Call: initEnv('api', { fallbackToShared: true })
   - Loads: services/api/.env
   - Falls back to: services/overview-api/.env for JWT_SECRET
   - Returns: Validated config object
   ↓
4. Validation checks:
   - DB_HOST must NOT be localhost in staging/production ❌
   - JWT_SECRET must be 64+ characters in production ❌
   - Required environment variables must be set ❌
   ↓
5. If validation fails:
   - Service prints clear error message
   - Service exits with code 1
   - PM2 shows service as "errored"
   ↓
6. If validation passes:
   - Service starts normally
   - Logs: "✅ Configuration validation passed"
   - Shows actual DB host and JWT strength
```

### Services Using Shared Env-Loader

| Service | Method | Validates | Refuses localhost in staging |
|---------|--------|-----------|------------------------------|
| overview-api | Via config/env.cjs | ✅ | ✅ |
| upload-api | Direct import | ✅ | ✅ |
| recon-api | Via config/env.cjs | ✅ | ✅ |
| settlement-api | Via config/env.cjs | ✅ | ✅ |
| settlement-queue-processor | Via config/env.cjs | ✅ | ✅ |
| pg-ingestion | Direct import | ✅ | ✅ |
| chargeback-api | None (mock) | ❌ | N/A |

---

## ⚠️ Important Notes & Known Issues

### Port Configuration Mismatches

Several .env files have PORT values that **don't match** the actual ports services run on:

| Service | .env PORT | Actual Port | Source of Truth |
|---------|-----------|-------------|-----------------|
| settlement-api | 5109 | 5110 | ecosystem.config.cjs |
| pg-ingestion | 5101 | 5111 | ecosystem.config.cjs |
| chargeback-api | 5106 | 5112 | ecosystem.config.cjs |

**Why?** Ecosystem config overrides .env PORT values via `env_staging.PORT`.

**Always check:** `pm2 status` for actual running ports.

### NODE_ENV Discrepancies

- **overview-api/.env:** Says `NODE_ENV=development`
- **Actual runtime:** `NODE_ENV=staging` (set by ecosystem config)
- **Result:** Validation uses `staging` rules, which is correct

### JWT Secret Inconsistencies

Currently two different JWT secrets exist:
1. `overview-api/.env` - 80 characters
2. Other services' `.env` - 128 characters

**Impact:** Services using shared loader get the overview-api secret, which ensures authentication works across services. Services NOT using shared loader might have their own secret.

**Recommendation:** Standardize to one strong JWT secret across all .env files.

### Configuration Validation

As of October 28, 2025, all services now validate configuration on startup:

**Validation Rules:**
- ✅ Database host must NOT be localhost in staging/production
- ✅ JWT secret must be 64+ characters in production
- ✅ Services refuse to start if misconfigured
- ✅ Clear error messages show exactly what's wrong

**Example validation output:**
```
✅ Configuration validation passed
   Environment: staging
   Database: settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2
   JWT Secret: 80 characters (strong: yes)
```

---

## 🔧 Common Operations

### Start All Services
```bash
cd /home/ec2-user/ops-dashboard/ops-dashboard
pm2 start ecosystem.config.cjs --env staging
pm2 save
```

### Restart a Single Service
```bash
pm2 restart overview-api
```

### Check Service Status
```bash
pm2 status
pm2 logs overview-api --lines 50
```

### View Service Health
```bash
curl http://localhost:5108/health  # overview-api
curl http://localhost:5107/health  # upload-api
curl http://localhost:5103/recon/health  # recon-api
```

### Update Configuration
```bash
# Edit .env file
vi services/overview-api/.env

# Restart service with new env
pm2 restart overview-api --update-env

# Or restart all services
pm2 restart ecosystem.config.cjs --env staging --update-env
```

---

## 📝 Maintenance Log

| Date | Change | Modified By |
|------|--------|-------------|
| Oct 28, 2025 | Added PM2 ecosystem config for all services | System |
| Oct 28, 2025 | Added shared env-loader with validation | System |
| Oct 28, 2025 | Updated pg-ingestion to use shared env-loader | System |
| Oct 28, 2025 | Fixed ecosystem config script paths | System |
| Oct 29, 2025 | Created this configuration reference document | System |

---

## 📞 Troubleshooting

### Service Won't Start

**Check logs:**
```bash
pm2 logs <service-name> --err --lines 50
```

**Common issues:**
- Database host is localhost → Fix .env DB_HOST
- JWT secret is weak → Generate stronger secret
- Port already in use → Check `lsof -i :<port>`

### Authentication Fails ("Invalid token")

**Verify JWT secrets match:**
```bash
# Check overview-api secret
grep JWT_SECRET services/overview-api/.env

# Check if service is using shared loader
pm2 logs <service-name> --lines 50 | grep "Configuration validation"
```

### Database Connection Fails

**Verify RDS endpoint:**
```bash
# Test connection
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com -U postgres -d settlepaisa_v2

# Check service logs
pm2 logs <service-name> | grep -i "database\|connection"
```

---

**END OF CONFIGURATION REFERENCE**
