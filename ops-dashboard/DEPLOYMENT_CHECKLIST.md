# Deployment Checklist - Ops Dashboard

## 🚨 Critical Configuration Requirements

### 1. JWT_SECRET Must Match Across All Services

**⚠️ CRITICAL**: All backend services **MUST** use the same `JWT_SECRET` value, otherwise authentication will fail with "Invalid token" errors.

#### Required Matching Files:
- `services/overview-api/.env` → JWT_SECRET
- `services/api/.env` → JWT_SECRET
- `services/recon-api/.env` → JWT_SECRET (if it uses authentication)

#### How to Ensure Consistency:

**Option A: Copy from one source**
```bash
# On deployment server
cd /path/to/ops-dashboard/services

# Get JWT_SECRET from overview-api
JWT_SECRET=$(grep '^JWT_SECRET=' overview-api/.env | cut -d= -f2-)

# Apply to all services
echo "JWT_SECRET=$JWT_SECRET" >> api/.env
echo "JWT_SECRET=$JWT_SECRET" >> recon-api/.env
```

**Option B: Use environment variable**
```bash
# Set system-wide environment variable
export JWT_SECRET="your-strong-secret-here"

# Reference in all .env files
JWT_SECRET=${JWT_SECRET}
```

**Option C: Use shared config** (already implemented in code)
All services load from `config/env.cjs` which reads from `overview-api/.env`, so they should automatically sync. However, ensure services restart after `.env` changes.

---

## 📋 Deployment Steps

### Pre-Deployment

- [ ] **Generate strong JWT_SECRET** (if new environment)
  ```bash
  openssl rand -base64 64 | tr -d '\n'
  ```

- [ ] **Verify all .env files have same JWT_SECRET**
  ```bash
  grep JWT_SECRET services/overview-api/.env
  grep JWT_SECRET services/api/.env
  grep JWT_SECRET services/recon-api/.env
  # All should match!
  ```

- [ ] **Verify database configuration matches**
  ```bash
  grep ^DB_ services/overview-api/.env
  grep ^DB_ services/api/.env
  # Should point to same database
  ```

- [ ] **Backup existing .env files**
  ```bash
  mkdir -p env-backups-$(date +%Y%m%d)
  cp services/**/.env env-backups-$(date +%Y%m%d)/
  ```

### Deployment

- [ ] **Pull latest code**
  ```bash
  git pull origin main
  ```

- [ ] **Install dependencies** (if package.json changed)
  ```bash
  npm install
  cd services/overview-api && npm install
  cd services/api && npm install
  # etc.
  ```

- [ ] **Run database migrations**
  ```bash
  npm run migrate:up
  ```

- [ ] **Update .env files** (copy from .env.example if needed)
  ```bash
  # Don't overwrite existing .env!
  # Only update specific values that changed
  ```

- [ ] **Restart PM2 services**
  ```bash
  pm2 restart all
  # Or restart individually:
  pm2 restart overview-api
  pm2 restart upload-api
  pm2 restart recon-api
  ```

- [ ] **Save PM2 configuration**
  ```bash
  pm2 save
  ```

### Post-Deployment Verification

- [ ] **Check PM2 status**
  ```bash
  pm2 status
  # All services should show "online"
  ```

- [ ] **Check logs for errors**
  ```bash
  pm2 logs overview-api --lines 50
  pm2 logs upload-api --lines 50
  pm2 logs recon-api --lines 50
  ```

- [ ] **Test authentication flow**
  ```bash
  # Get token
  TOKEN=$(curl -s -X POST http://localhost:5108/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@settlepaisa.com","password":"Admin@123"}' | jq -r '.data.token')

  # Test upload API with token
  curl -X POST http://localhost:5107/api/upload/stats \
    -H "Authorization: Bearer $TOKEN"

  # Should NOT return "Invalid token" error
  ```

- [ ] **Test in browser**
  - Login to dashboard
  - Navigate to Recon Workspace
  - Try uploading a file
  - Verify no "Invalid token" errors

- [ ] **Check database connectivity**
  ```bash
  # From any service directory
  node -e "
  const { Pool } = require('pg');
  const config = require('./config/env.cjs');
  const pool = new Pool(config.db);
  pool.query('SELECT NOW()', (err, res) => {
    console.log(err ? err : 'DB Connected: ' + res.rows[0].now);
    pool.end();
  });
  "
  ```

---

## 🔧 Common Issues & Fixes

### Issue 1: "Invalid token" errors
**Cause**: JWT_SECRET mismatch between services
**Fix**:
```bash
# Sync JWT_SECRET across all services
cd services
JWT_SECRET=$(grep '^JWT_SECRET=' overview-api/.env | cut -d= -f2-)
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" api/.env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" recon-api/.env
pm2 restart all
```

### Issue 2: Services won't start after restart
**Cause**: .env file missing or corrupt
**Fix**:
```bash
# Restore from backup
cp env-backups-YYYYMMDD/service-name/.env services/service-name/.env
pm2 restart service-name
```

### Issue 3: Database connection errors
**Cause**: DB credentials don't match or database is down
**Fix**:
```bash
# Verify DB config
grep ^DB_ services/overview-api/.env

# Test connection
psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -c "SELECT 1"
```

### Issue 4: Port already in use
**Cause**: Old process still running
**Fix**:
```bash
# Find process using port
lsof -i :5108
kill -9 <PID>

# Or restart PM2
pm2 restart overview-api
```

---

## 🔐 Security Checklist

- [ ] **JWT_SECRET is strong** (64+ characters)
  ```bash
  JWT_SECRET=$(grep '^JWT_SECRET=' services/overview-api/.env | cut -d= -f2-)
  echo "JWT_SECRET length: ${#JWT_SECRET}"
  # Should be 64+
  ```

- [ ] **Database password is strong**
- [ ] **.env files are not committed to git**
  ```bash
  git status | grep ".env"
  # Should show nothing (all in .gitignore)
  ```

- [ ] **CORS origins are restricted**
  ```bash
  grep CORS_ORIGIN services/*/env
  # Should be specific domains, not '*'
  ```

- [ ] **Rate limiting is enabled**
  ```bash
  grep RATE_LIMIT services/overview-api/.env
  ```

---

## 📊 Environment-Specific Values

### Development (Local)
```bash
DB_HOST=localhost
DB_PORT=5433
CORS_ORIGIN=http://localhost:5174
NODE_ENV=development
```

### Staging
```bash
DB_HOST=settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
DB_PORT=5432
CORS_ORIGIN=http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
NODE_ENV=staging
```

### Production
```bash
DB_HOST=<production-rds-endpoint>
DB_PORT=5432
CORS_ORIGIN=https://ops.settlepaisa.com
NODE_ENV=production
```

---

## 🚀 Quick Deployment Commands

### Staging Deployment
```bash
# On staging server
cd /path/to/ops-dashboard
git pull origin staging
npm install
pm2 restart all
pm2 save

# Verify
pm2 status
pm2 logs --lines 20
```

### Production Deployment
```bash
# On production server
cd /path/to/ops-dashboard
git pull origin main
npm install
npm run migrate:up
pm2 restart all
pm2 save

# Verify
pm2 status
pm2 logs --lines 20
curl https://ops.settlepaisa.com/health
```

---

## 📞 Rollback Procedure

If deployment fails:

1. **Stop services**
   ```bash
   pm2 stop all
   ```

2. **Restore previous version**
   ```bash
   git reset --hard HEAD~1
   npm install
   ```

3. **Restore .env files**
   ```bash
   cp env-backups-YYYYMMDD/* services/
   ```

4. **Restart services**
   ```bash
   pm2 restart all
   ```

5. **Verify rollback successful**
   ```bash
   pm2 status
   pm2 logs --lines 50
   ```

---

## 📝 Notes

- Always backup `.env` files before deployment
- Never commit `.env` files to git
- Test authentication flow after every deployment
- Keep JWT_SECRET consistent across services in same environment
- Generate new JWT_SECRET for each environment (dev, staging, prod)
- Document any manual configuration changes

---

**Last Updated**: 2025-10-28
**Issue Reference**: JWT_SECRET mismatch fix (staging-2)
