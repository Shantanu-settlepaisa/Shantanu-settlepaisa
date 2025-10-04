# SettlePaisa Dashboard - Deployment Guide

This guide explains how to deploy Ops and Merchant dashboards **separately** or **together**.

## Overview

The codebase contains **two dashboards** in one repository:
- **Ops Dashboard** (`/ops/*`) - Internal operations team
- **Merchant Dashboard** (`/merchant/*`) - External merchant portal

You can deploy them **independently** using environment flags.

---

## Deployment Scenarios

### **Scenario 1: Deploy Ops Dashboard ONLY (First)**

```bash
# Build for staging - Ops only
npm run build:staging-ops

# Output: dist/ folder with ONLY /ops routes enabled
# Merchant routes will return 404

# Deploy
scp -r dist/ user@staging-server:/var/www/ops-dashboard/
```

**Environment Variables Used:**
```env
VITE_ENABLE_OPS_DASHBOARD=true
VITE_ENABLE_MERCHANT_DASHBOARD=false
```

**Result:**
- ✅ `https://staging.settlepaisa.com/ops/overview` - Works
- ❌ `https://staging.settlepaisa.com/merchant/settlements` - 404

---

### **Scenario 2: Deploy Merchant Dashboard ONLY (Later)**

```bash
# Build for staging - Merchant only
npm run build:staging-merchant

# Output: dist/ folder with ONLY /merchant routes enabled
# Ops routes will return 404

# Deploy
scp -r dist/ user@staging-server:/var/www/merchant-portal/
```

**Environment Variables Used:**
```env
VITE_ENABLE_OPS_DASHBOARD=false
VITE_ENABLE_MERCHANT_DASHBOARD=true
```

**Result:**
- ❌ `https://merchant.settlepaisa.com/ops/overview` - 404
- ✅ `https://merchant.settlepaisa.com/merchant/settlements` - Works

---

### **Scenario 3: Deploy Both Dashboards (Production)**

```bash
# Build for production - Both enabled
npm run build:production

# Output: dist/ folder with BOTH /ops and /merchant routes

# Deploy
scp -r dist/ user@production-server:/var/www/settlepaisa-dashboard/
```

**Environment Variables Used:**
```env
VITE_ENABLE_OPS_DASHBOARD=true
VITE_ENABLE_MERCHANT_DASHBOARD=true
```

**Result:**
- ✅ `https://settlepaisa.com/ops/overview` - Works
- ✅ `https://settlepaisa.com/merchant/settlements` - Works

---

## Step-by-Step: Deploy Ops First, Merchant Later

### **Week 1: Deploy Ops Dashboard to Staging**

```bash
# 1. Build ops-only version
npm run build:staging-ops

# 2. Deploy to staging server
scp -r dist/ user@staging:/var/www/ops-dashboard/

# 3. Configure nginx
sudo nano /etc/nginx/sites-available/ops-dashboard
```

**nginx config:**
```nginx
server {
    listen 80;
    server_name ops-staging.settlepaisa.com;
    
    root /var/www/ops-dashboard;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy ops APIs
    location /api/ops/ {
        proxy_pass http://localhost:5105;
    }
    
    location /recon/ {
        proxy_pass http://localhost:5103;
    }
}
```

```bash
# 4. Restart nginx
sudo systemctl restart nginx

# 5. Test
curl https://ops-staging.settlepaisa.com/ops/overview
```

---

### **Week 3: Deploy Merchant Dashboard to Staging**

```bash
# 1. Build merchant-only version
npm run build:staging-merchant

# 2. Deploy to DIFFERENT directory
scp -r dist/ user@staging:/var/www/merchant-portal/

# 3. Configure nginx for merchant subdomain
sudo nano /etc/nginx/sites-available/merchant-portal
```

**nginx config:**
```nginx
server {
    listen 80;
    server_name merchant-staging.settlepaisa.com;
    
    root /var/www/merchant-portal;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy merchant API
    location /v1/merchant/ {
        proxy_pass http://localhost:8080;
    }
}
```

```bash
# 4. Restart nginx
sudo systemctl restart nginx

# 5. Test
curl https://merchant-staging.settlepaisa.com/merchant/settlements
```

---

## Backend Service Deployment

### **Ops Dashboard Backend Services**

```bash
# 1. Deploy Overview API (port 5105)
cd services/overview-api
pm2 start index.js --name overview-api

# 2. Deploy Recon API (port 5103)
cd services/recon-api
pm2 start index.js --name recon-api

# 3. Deploy PG API (port 5101)
cd services/pg-api
pm2 start index.js --name pg-api

# 4. Deploy Bank API (port 5102)
cd services/bank-api
pm2 start index.js --name bank-api
```

### **Merchant Dashboard Backend Service**

```bash
# Deploy Merchant API (port 8080)
cd services/merchant-api

# Update .env for staging
cat > .env <<EOF
USE_DB=true
PG_URL=postgresql://postgres:settlepaisa123@staging-db:5433/settlepaisa_v2
DEFAULT_MERCHANT_ID=MERCH001
PORT=8080
NODE_ENV=production
TIMEZONE=Asia/Kolkata
EOF

# Start service
pm2 start index.js --name merchant-api
```

---

## Environment Files Reference

### `.env.staging-ops` (Ops Only)
```env
VITE_API_BASE_URL=https://api-staging.settlepaisa.com
VITE_USE_MOCK_API=false
VITE_DEMO_MODE=false
VITE_ENABLE_OPS_DASHBOARD=true
VITE_ENABLE_MERCHANT_DASHBOARD=false
```

### `.env.staging-merchant` (Merchant Only)
```env
VITE_API_BASE_URL=https://api-staging.settlepaisa.com
VITE_USE_MOCK_API=false
VITE_DEMO_MODE=false
VITE_ENABLE_OPS_DASHBOARD=false
VITE_ENABLE_MERCHANT_DASHBOARD=true
VITE_MERCHANT_API_URL=https://api-staging.settlepaisa.com
```

### `.env.production` (Both)
```env
VITE_API_BASE_URL=https://api.settlepaisa.com
VITE_USE_MOCK_API=false
VITE_DEMO_MODE=false
VITE_ENABLE_OPS_DASHBOARD=true
VITE_ENABLE_MERCHANT_DASHBOARD=true
VITE_MERCHANT_API_URL=https://api.settlepaisa.com
```

---

## Verification

### **After Ops Deployment:**
```bash
# Should work
curl https://ops-staging.settlepaisa.com/ops/overview

# Should return 404 (merchant disabled)
curl https://ops-staging.settlepaisa.com/merchant/settlements
```

### **After Merchant Deployment:**
```bash
# Should work
curl https://merchant-staging.settlepaisa.com/merchant/settlements

# Should return 404 (ops disabled)
curl https://merchant-staging.settlepaisa.com/ops/overview
```

---

## Rollback

If merchant deployment fails, ops dashboard is **unaffected** because they're deployed separately.

```bash
# Rollback merchant only
cd /var/www/merchant-portal
git checkout previous-version
npm run build:staging-merchant

# Ops continues running without interruption
```

---

## Production Deployment (Both Together)

When both are tested and ready:

```bash
# Build combined version
npm run build:production

# Deploy to single domain
scp -r dist/ user@production:/var/www/settlepaisa/

# Single nginx config serves both
server {
    listen 80;
    server_name settlepaisa.com;
    
    root /var/www/settlepaisa;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # All APIs
    location /v1/merchant/ {
        proxy_pass http://localhost:8080;
    }
    
    location /api/ops/ {
        proxy_pass http://localhost:5105;
    }
}
```

---

## Key Benefits

✅ **Independent Deployments** - Deploy ops first, merchant later  
✅ **Zero Downtime** - Merchant deployment doesn't affect ops  
✅ **Separate Testing** - Test each dashboard independently  
✅ **Easy Rollback** - Roll back one without affecting the other  
✅ **Single Codebase** - Shared components, easier maintenance  

---

## Summary

| Build Command | Ops Enabled | Merchant Enabled | Use Case |
|---------------|-------------|------------------|----------|
| `npm run build:staging-ops` | ✅ | ❌ | Deploy ops first |
| `npm run build:staging-merchant` | ❌ | ✅ | Deploy merchant later |
| `npm run build:production` | ✅ | ✅ | Deploy both together |

**Timeline Example:**
- **Week 1**: Deploy ops to staging (staging-ops build)
- **Week 3**: Deploy merchant to staging (staging-merchant build)
- **Week 4**: Deploy both to production (production build)
