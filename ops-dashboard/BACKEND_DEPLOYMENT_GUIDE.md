# SettlePaisa Ops Dashboard - Backend Services Deployment Guide

**Version**: 2.0
**Last Updated**: October 28, 2025

---

## 🎯 Quick Start (Recommended)

### Using PM2 Ecosystem (Staging/Production)

```bash
# 1. Navigate to project directory
cd /path/to/ops-dashboard

# 2. Start all services
pm2 start ecosystem.config.js --env staging  # or --env production

# 3. Save PM2 configuration
pm2 save

# 4. Verify all services are running
pm2 status

# 5. Check health of all services
curl http://localhost:5108/health  # overview-api
curl http://localhost:5107/health  # upload-api
curl http://localhost:5103/health  # recon-api
```

**That's it!** All services will:
- ✅ Load environment variables correctly
- ✅ Validate configuration on startup
- ✅ Refuse to start if misconfigured
- ✅ Auto-restart on failure
- ✅ Resume after server reboot (`pm2 resurrect`)

---

## 📋 Prerequisites

### Required
- Node.js 16+ installed
- PM2 installed globally: `npm install -g pm2`
- PostgreSQL database (RDS for staging/production)
- `.env` files configured (see Environment Setup below)

### Optional
- Git (for deployment via PM2 deploy)
- SSH keys for server access

---

## 🔧 Environment Setup

### 1. Create .env Files

Each service needs its .env file. Start from examples:

```bash
cd services/overview-api
cp .env.example .env
# Edit .env with your values

cd ../api
cp .env.example .env
# Edit .env with your values
```

### 2. Required Environment Variables

#### Overview API (services/overview-api/.env)

**CRITICAL**: This is the primary .env that all services share for common config.

```bash
# Database - MUST point to RDS in staging/production
DB_HOST=your-db.region.rds.amazonaws.com  # NOT localhost!
DB_PORT=5432
DB_NAME=settlepaisa_v2
DB_USER=postgres
DB_PASSWORD=your-strong-password

# JWT - MUST be strong (64+ characters)
JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=7d

# Application
NODE_ENV=staging  # or production
PORT=5108
LOG_LEVEL=info

# CORS
CORS_ORIGIN=http://your-frontend-domain.com
```

#### Upload API (services/api/.env)

```bash
# Service-specific config
PORT=5107
NODE_ENV=staging

# NOTE: JWT_SECRET should NOT be in this file
# It will be loaded from overview-api/.env automatically
# Only put service-specific overrides here
```

---

## 🚀 Deployment Methods

### Method 1: PM2 Ecosystem (Recommended)

```bash
# Clone/pull latest code
cd /path/to/ops-dashboard
git pull origin main

# Install dependencies
npm install

# Start with ecosystem
pm2 start ecosystem.config.js --env staging

# Save configuration
pm2 save

# Set up startup script (first time only)
pm2 startup
```

### Method 2: Manual PM2 Start (Not Recommended)

Only use if ecosystem.config.js doesn't work.

```bash
# Must set --cwd for each service
pm2 start services/overview-api/index.js --name overview-api --cwd services/overview-api
pm2 save
```

---

## ✅ Post-Deployment Verification

### 1. Check PM2 Status

```bash
pm2 status
```

All services should show **"online"** status.

### 2. Test Health Endpoints

```bash
curl http://localhost:5108/health | jq
```

**Expected response**:
```json
{
  "service": "overview-api",
  "status": "healthy",
  "config": {
    "database": {
      "host": "your-rds-endpoint.com"  // ← MUST NOT be localhost!
    },
    "auth": {
      "jwtSecretStrong": true  // ← MUST be true!
    }
  },
  "configValidation": {
    "isValid": true,  // ← MUST be true!
    "issues": []      // ← MUST be empty!
  },
  "database": "connected"
}
```

### 3. Test Authentication

```bash
TOKEN=$(curl -s -X POST http://localhost:5108/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@settlepaisa.com","password":"Admin@123"}' \
  | jq -r '.data.token')

curl -X GET http://localhost:5107/api/upload/stats \
  -H "Authorization: Bearer $TOKEN"

# Should return data, NOT "Invalid token"
```

---

## 🆘 Troubleshooting

### "Invalid token" errors

**Fix**:
1. Remove JWT_SECRET from `api/.env`
2. Restart: `pm2 restart all --update-env`

### Services connecting to localhost

**Fix**:
1. Check: `ls -la services/overview-api/.env`
2. Verify: `grep DB_HOST services/overview-api/.env`
3. Restart: `pm2 restart ecosystem.config.js --env staging`

### Service won't start

**Diagnosis**:
```bash
pm2 logs overview-api --err --lines 50
```

**Common fixes**:
- Fix .env configuration
- Kill process on conflicting port: `lsof -i :5108`
- Install dependencies: `cd services/overview-api && npm install`

---

## 🔐 Security Checklist

- [ ] JWT_SECRET is 64+ characters
- [ ] DB_HOST points to RDS (not localhost)
- [ ] CORS_ORIGIN is specific domain (not *)
- [ ] .env files are NOT in git

---

## 📝 Best Practices

1. Always backup .env files before changes
2. Test in staging before production
3. Use PM2 ecosystem for consistency
4. Keep JWT_SECRET only in overview-api/.env
5. Use `pm2 save` after every change

---

**Remember**: The ecosystem.config.js prevents configuration issues by validating on startup!
