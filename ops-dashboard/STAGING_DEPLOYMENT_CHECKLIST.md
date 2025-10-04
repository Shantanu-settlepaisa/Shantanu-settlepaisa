# SettlePaisa V2 Ops Dashboard - Staging Deployment Checklist

**Date:** October 3, 2025  
**Version:** 2.16.0 (Full Connector System + Disputes Module)  
**Status:** ✅ Ready for Staging Deployment

---

## Pre-Deployment Verification

### ✅ Database Schema
- [x] 48 V2 tables created and tested
- [x] All migrations applied (001 through 018)
- [x] Indexes optimized for queries
- [x] Constraints validated
- [x] Seed data populated (52 chargebacks, 1 connector, 747 transactions, 2011 bank statements)

### ✅ Backend Services
- [x] **PG API** (port 5101) - Mock payment gateway data
- [x] **Bank API** (port 5102) - Mock bank data
- [x] **Recon API** (port 5103) - Reconciliation engine with V1 exception types
- [x] **Disputes API** (port 5104) - Chargeback management
- [x] **Overview API** (port 5105) - Dashboard overview
- [x] **Settlement Analytics API** (port 5107) - Settlement processing
- [x] **Ingest API** (port 5106) - Bank SFTP ingestion (feature flag)

### ✅ Frontend
- [x] React + TypeScript + Vite
- [x] Port 5174 configured
- [x] All pages implemented (Overview, Recon, Disputes, Settlements, Analytics)
- [x] Mock data toggle ready (`VITE_USE_MOCK_API`)

---

## Staging Environment Setup

### 1. Infrastructure Requirements

#### **Server Specifications**
```yaml
Application Server:
  - CPU: 4 cores minimum
  - RAM: 8GB minimum
  - Storage: 50GB SSD
  - OS: Ubuntu 22.04 LTS or Amazon Linux 2

Database Server:
  - PostgreSQL 15+
  - CPU: 4 cores
  - RAM: 16GB (with 8GB shared_buffers)
  - Storage: 100GB SSD with IOPS 3000+
  - Backup: Daily automated snapshots
```

#### **Network Configuration**
```yaml
Ports to Open:
  - 5174: Frontend (HTTPS via reverse proxy)
  - 5101-5107: Backend APIs (internal only)
  - 5432/5433: PostgreSQL (internal only)

Security Groups:
  - Allow HTTPS (443) from ops team IPs
  - Allow SSH (22) from bastion host only
  - Internal VPC communication for API services
```

---

### 2. Database Setup

#### **Step 2.1: Create Staging Database**
```bash
# On staging PostgreSQL server
sudo -u postgres psql

CREATE DATABASE settlepaisa_v2_staging;
CREATE USER settlepaisa_staging WITH PASSWORD 'STAGING_SECURE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE settlepaisa_v2_staging TO settlepaisa_staging;
\q
```

#### **Step 2.2: Apply All Migrations**
```bash
# Copy migration files to staging server
scp -r db/migrations/ staging-server:/opt/settlepaisa/db/

# On staging server, run migrations in order
cd /opt/settlepaisa/db/migrations
for file in $(ls -1 *.sql | sort -V); do
  echo "Applying $file..."
  PGPASSWORD='STAGING_PASSWORD' psql \
    -h localhost \
    -U settlepaisa_staging \
    -d settlepaisa_v2_staging \
    -f "$file"
done
```

**Migrations to Apply (in order):**
1. `001_create_sp_v2_transactions.sql`
2. `002_create_sp_v2_bank_statements.sql`
3. `003_create_reconciliations.sql`
4. `004_add_indexes.sql`
5. `005_settlement_batches.sql`
6. `006_unreconciled_reasons.sql`
7. `007_add_transaction_hash.sql`
8. `008_settlement_analytics.sql`
9. `009_fee_reconciliation.sql`
10. `010_settlement_summary.sql`
11. `011_exception_workflow.sql`
12. `012_v1_column_mappings.sql`
13. `013_v1_exception_types.sql`
14. `014_add_fee_columns.sql`
15. `015_create_bank_column_mappings.sql`
16. `016_batch_job_logs.sql`
17. `017_connectors_table.sql`
18. `018_disputes_chargebacks.sql`

#### **Step 2.3: Verify Database**
```bash
# Check table count (should be 48)
PGPASSWORD='STAGING_PASSWORD' psql \
  -h localhost \
  -U settlepaisa_staging \
  -d settlepaisa_v2_staging \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

# Verify critical tables exist
PGPASSWORD='STAGING_PASSWORD' psql \
  -h localhost \
  -U settlepaisa_staging \
  -d settlepaisa_v2_staging \
  -c "SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'sp_v2_%' 
      ORDER BY table_name;"
```

---

### 3. Application Deployment

#### **Step 3.1: Deploy Backend Services**

**Install Node.js**
```bash
# On staging server
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Deploy Services**
```bash
# Create application directory
sudo mkdir -p /opt/settlepaisa/services
sudo chown $USER:$USER /opt/settlepaisa/services

# Copy all service directories
cd /Users/shantanusingh/ops-dashboard
rsync -avz services/ staging-server:/opt/settlepaisa/services/

# On staging server, install dependencies for each service
cd /opt/settlepaisa/services

for service in mock-pg-api mock-bank-api recon-api disputes-api overview-api settlement-analytics-api; do
  echo "Installing dependencies for $service..."
  cd $service
  npm install --production
  cd ..
done
```

**Create systemd Services**

Create `/etc/systemd/system/settlepaisa-pg-api.service`:
```ini
[Unit]
Description=SettlePaisa PG API
After=network.target

[Service]
Type=simple
User=settlepaisa
WorkingDirectory=/opt/settlepaisa/services/mock-pg-api
Environment="NODE_ENV=staging"
Environment="PORT=5101"
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Repeat for all services:
- `settlepaisa-bank-api.service` (port 5102)
- `settlepaisa-recon-api.service` (port 5103)
- `settlepaisa-disputes-api.service` (port 5104)
- `settlepaisa-overview-api.service` (port 5105)
- `settlepaisa-analytics-api.service` (port 5107)

**Start Services**
```bash
sudo systemctl daemon-reload
sudo systemctl enable settlepaisa-pg-api
sudo systemctl enable settlepaisa-bank-api
sudo systemctl enable settlepaisa-recon-api
sudo systemctl enable settlepaisa-disputes-api
sudo systemctl enable settlepaisa-overview-api
sudo systemctl enable settlepaisa-analytics-api

sudo systemctl start settlepaisa-pg-api
sudo systemctl start settlepaisa-bank-api
sudo systemctl start settlepaisa-recon-api
sudo systemctl start settlepaisa-disputes-api
sudo systemctl start settlepaisa-overview-api
sudo systemctl start settlepaisa-analytics-api
```

#### **Step 3.2: Update Service Database Connections**

For each service, update database connection in `index.js`:

**Recon API** (`/opt/settlepaisa/services/recon-api/index.js`):
```javascript
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'settlepaisa_staging',
  password: process.env.DB_PASSWORD || 'STAGING_PASSWORD',
  database: process.env.DB_NAME || 'settlepaisa_v2_staging',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

Repeat for:
- Disputes API
- Overview API
- Settlement Analytics API

#### **Step 3.3: Deploy Frontend**

```bash
# On local machine, build production frontend
cd /Users/shantanusingh/ops-dashboard
npm run build

# This creates dist/ folder
# Copy to staging server
rsync -avz dist/ staging-server:/opt/settlepaisa/frontend/

# Install and configure Nginx
sudo apt install nginx -y

# Create Nginx config
sudo nano /etc/nginx/sites-available/settlepaisa-ops
```

**Nginx Configuration** (`/etc/nginx/sites-available/settlepaisa-ops`):
```nginx
server {
    listen 80;
    server_name ops-staging.settlepaisa.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ops-staging.settlepaisa.com;

    ssl_certificate /etc/ssl/certs/settlepaisa-ops.crt;
    ssl_certificate_key /etc/ssl/private/settlepaisa-ops.key;

    # Frontend static files
    root /opt/settlepaisa/frontend;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend services
    location /api/pg/ {
        proxy_pass http://localhost:5101/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/bank/ {
        proxy_pass http://localhost:5102/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /api/recon/ {
        proxy_pass http://localhost:5103/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /api/disputes/ {
        proxy_pass http://localhost:5104/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /api/overview/ {
        proxy_pass http://localhost:5105/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /api/analytics/ {
        proxy_pass http://localhost:5107/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

**Enable Site**
```bash
sudo ln -s /etc/nginx/sites-available/settlepaisa-ops /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

### 4. Environment Configuration

#### **Step 4.1: Create Environment Files**

**Backend Services** (each service gets `.env` file):
```bash
# /opt/settlepaisa/services/recon-api/.env
NODE_ENV=staging
PORT=5103
DB_HOST=localhost
DB_PORT=5432
DB_USER=settlepaisa_staging
DB_PASSWORD=STAGING_SECURE_PASSWORD
DB_NAME=settlepaisa_v2_staging
DB_MAX_CONNECTIONS=20

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/settlepaisa/recon-api.log
```

Repeat for all services with respective ports.

**Frontend** (baked into build):

Before running `npm run build`, create `.env.staging`:
```bash
# .env.staging
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=https://ops-staging.settlepaisa.com/api
VITE_PG_API_URL=https://ops-staging.settlepaisa.com/api/pg
VITE_BANK_API_URL=https://ops-staging.settlepaisa.com/api/bank
VITE_RECON_API_URL=https://ops-staging.settlepaisa.com/api/recon
VITE_DISPUTES_API_URL=https://ops-staging.settlepaisa.com/api/disputes
VITE_OVERVIEW_API_URL=https://ops-staging.settlepaisa.com/api/overview
VITE_ANALYTICS_API_URL=https://ops-staging.settlepaisa.com/api/analytics
```

Build with staging config:
```bash
npm run build -- --mode staging
```

---

### 5. Data Seeding (Optional for Staging)

#### **Seed Chargebacks**
```bash
cd /opt/settlepaisa/services/disputes-api
node seed-data.js
```

#### **Seed Connectors**
```bash
PGPASSWORD='STAGING_PASSWORD' psql \
  -h localhost \
  -U settlepaisa_staging \
  -d settlepaisa_v2_staging \
  -c "INSERT INTO sp_v2_connectors (id, name, type, status, config) 
      VALUES (gen_random_uuid(), 'AXIS SFTP', 'BANK_SFTP', 'active', '{}'::jsonb);"
```

#### **Seed Sample Transactions** (if needed)
```bash
# Copy seed scripts
scp services/mock-pg-api/seed-transactions.js staging-server:/opt/settlepaisa/services/mock-pg-api/

# Run on staging
cd /opt/settlepaisa/services/mock-pg-api
node seed-transactions.js
```

---

### 6. Security Hardening

#### **Step 6.1: Database Security**
```sql
-- Revoke public access
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO settlepaisa_staging;

-- Enable SSL connections only
ALTER SYSTEM SET ssl = on;
SELECT pg_reload_conf();

-- Set connection limits
ALTER USER settlepaisa_staging CONNECTION LIMIT 50;
```

#### **Step 6.2: Application Security**
```bash
# Create settlepaisa user (non-root)
sudo adduser settlepaisa
sudo usermod -aG www-data settlepaisa

# Set file permissions
sudo chown -R settlepaisa:settlepaisa /opt/settlepaisa
sudo chmod -R 750 /opt/settlepaisa

# Protect environment files
sudo chmod 600 /opt/settlepaisa/services/*/.env
```

#### **Step 6.3: Firewall Configuration**
```bash
# Install UFW
sudo apt install ufw -y

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (from bastion only)
sudo ufw allow from BASTION_IP to any port 22

# Allow HTTP/HTTPS (from ops team IPs)
sudo ufw allow from OPS_TEAM_IP_RANGE to any port 80
sudo ufw allow from OPS_TEAM_IP_RANGE to any port 443

# Enable firewall
sudo ufw enable
```

---

## Post-Deployment Verification

### 1. Health Checks

#### **Backend Services**
```bash
# Check all services are running
curl http://localhost:5101/health  # PG API
curl http://localhost:5102/health  # Bank API
curl http://localhost:5103/health  # Recon API
curl http://localhost:5104/health  # Disputes API
curl http://localhost:5105/health  # Overview API
curl http://localhost:5107/health  # Analytics API

# Expected response from each:
# {"status":"healthy","service":"xxx-api","timestamp":"..."}
```

#### **Database Connectivity**
```bash
# Test from each service
for service in recon-api disputes-api overview-api; do
  cd /opt/settlepaisa/services/$service
  node -e "
    const { Pool } = require('pg');
    const pool = new Pool({
      host: 'localhost',
      port: 5432,
      user: 'settlepaisa_staging',
      password: 'STAGING_PASSWORD',
      database: 'settlepaisa_v2_staging'
    });
    pool.query('SELECT NOW()', (err, res) => {
      if (err) console.error('$service DB ERROR:', err.message);
      else console.log('$service DB OK:', res.rows[0].now);
      pool.end();
    });
  "
done
```

#### **Frontend**
```bash
# Test static file serving
curl -I https://ops-staging.settlepaisa.com

# Expected: HTTP 200, Content-Type: text/html
```

---

### 2. Functional Tests

#### **Test Disputes API**
```bash
# Get KPIs
curl "https://ops-staging.settlepaisa.com/api/disputes/v1/chargebacks/kpis" | jq .

# Expected:
# {
#   "openCount": 28,
#   "evidenceRequiredCount": 12,
#   "disputedPaise": "117180424",
#   "recoveredPaise": "38637570",
#   "writtenOffPaise": "25514269"
# }

# List chargebacks
curl "https://ops-staging.settlepaisa.com/api/disputes/v1/chargebacks?limit=5" | jq '.chargebacks | length'

# Expected: 5
```

#### **Test Recon API**
```bash
# Get reconciliation summary
curl "https://ops-staging.settlepaisa.com/api/recon/summary" | jq .

# Test exception types
curl "https://ops-staging.settlepaisa.com/api/recon/exceptions/v1/types" | jq '.types | length'

# Expected: 11
```

#### **Test Overview API**
```bash
curl "https://ops-staging.settlepaisa.com/api/overview/overview" | jq '.pipeline'

# Expected: Object with sentToBank, credited, settled, etc.
```

---

### 3. UI Verification

Access https://ops-staging.settlepaisa.com and verify:

- [ ] **Overview Page** loads without errors
- [ ] **KPI tiles** display real data (not "N/A" or "0")
- [ ] **Pipeline chart** shows correct buckets
- [ ] **Disputes page** shows 52 chargebacks
- [ ] **SLA buckets** populate correctly
- [ ] **Connector status** shows active connectors
- [ ] **No console errors** in browser DevTools
- [ ] **API calls** go to staging backend (check Network tab)

---

### 4. Performance Testing

#### **Load Test Backend APIs**
```bash
# Install Apache Bench
sudo apt install apache2-utils -y

# Test Disputes API
ab -n 1000 -c 10 https://ops-staging.settlepaisa.com/api/disputes/v1/chargebacks/kpis

# Expected: 
# - 95th percentile < 500ms
# - 0 failed requests
# - Throughput > 50 req/sec
```

#### **Database Query Performance**
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Verify indexes are used
EXPLAIN ANALYZE
SELECT * FROM sp_v2_chargebacks
WHERE status = 'OPEN'
ORDER BY received_at DESC
LIMIT 50;

-- Expected: Index Scan (not Seq Scan)
```

---

## Monitoring & Logging

### 1. Application Logs

#### **Centralized Logging**
```bash
# Create log directory
sudo mkdir -p /var/log/settlepaisa
sudo chown settlepaisa:settlepaisa /var/log/settlepaisa

# Configure log rotation
sudo nano /etc/logrotate.d/settlepaisa
```

**Log Rotation Config**:
```
/var/log/settlepaisa/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 settlepaisa settlepaisa
    sharedscripts
    postrotate
        systemctl reload nginx > /dev/null 2>&1
    endscript
}
```

#### **View Logs**
```bash
# Service logs
sudo journalctl -u settlepaisa-disputes-api -f

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Application logs
tail -f /var/log/settlepaisa/disputes-api.log
```

---

### 2. Monitoring Setup

#### **PostgreSQL Monitoring**
```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Monitor active connections
SELECT COUNT(*) as active_connections, 
       state, 
       application_name
FROM pg_stat_activity
WHERE datname = 'settlepaisa_v2_staging'
GROUP BY state, application_name;
```

#### **System Monitoring (Optional - Prometheus/Grafana)**
```yaml
# /etc/prometheus/prometheus.yml
scrape_configs:
  - job_name: 'settlepaisa-apis'
    static_configs:
      - targets: 
        - 'localhost:5101'
        - 'localhost:5102'
        - 'localhost:5103'
        - 'localhost:5104'
        - 'localhost:5105'
        - 'localhost:5107'
    metrics_path: '/metrics'
```

---

## Rollback Procedure

### If Deployment Fails

#### **Step 1: Stop New Services**
```bash
sudo systemctl stop settlepaisa-*
```

#### **Step 2: Restore Previous Database**
```bash
# If you created a backup before migration
PGPASSWORD='STAGING_PASSWORD' pg_restore \
  -h localhost \
  -U settlepaisa_staging \
  -d settlepaisa_v2_staging \
  /backups/pre-deployment-backup.dump
```

#### **Step 3: Revert Nginx Config**
```bash
sudo rm /etc/nginx/sites-enabled/settlepaisa-ops
sudo systemctl restart nginx
```

#### **Step 4: Investigate Logs**
```bash
sudo journalctl -u settlepaisa-disputes-api --since "1 hour ago"
tail -100 /var/log/settlepaisa/disputes-api.log
```

---

## Known Issues & Mitigations

### Issue 1: Disputes API Port Conflict
**Symptom:** `EADDRINUSE` error on port 5104  
**Fix:**
```bash
lsof -ti:5104 | xargs kill -9
sudo systemctl restart settlepaisa-disputes-api
```

### Issue 2: Database Connection Pool Exhausted
**Symptom:** `sorry, too many clients already`  
**Fix:**
```sql
-- Increase max_connections
ALTER SYSTEM SET max_connections = 200;
SELECT pg_reload_conf();
```

### Issue 3: Frontend Shows Mock Data
**Symptom:** UI displays static/demo data instead of real API data  
**Fix:**
```bash
# Verify build used correct environment
cat dist/assets/index-*.js | grep "VITE_USE_MOCK_API"
# Should show "false"

# If not, rebuild with staging config
rm -rf dist/
npm run build -- --mode staging
rsync -avz dist/ staging-server:/opt/settlepaisa/frontend/
```

---

## Success Criteria

Staging deployment is successful if:

- [ ] All 6 backend services respond to `/health` endpoint with 200 OK
- [ ] Database has 48 tables with proper indexes
- [ ] Frontend loads at https://ops-staging.settlepaisa.com
- [ ] Overview page shows real data (not mock data)
- [ ] Disputes page displays 52 chargebacks
- [ ] All API requests return < 500ms (95th percentile)
- [ ] No console errors in browser DevTools
- [ ] SSL certificate valid
- [ ] Firewall rules configured
- [ ] Logs are being written to `/var/log/settlepaisa/`
- [ ] Database backups configured

---

## Production Readiness Checklist (Post-Staging)

After staging validation, before production:

- [ ] **Load Testing**: 10,000 concurrent users
- [ ] **Security Audit**: Penetration testing completed
- [ ] **Backup Strategy**: Automated daily backups with 30-day retention
- [ ] **Disaster Recovery**: RTO < 4 hours, RPO < 1 hour
- [ ] **Monitoring**: Alerts configured for all critical metrics
- [ ] **Documentation**: Runbooks for all operational procedures
- [ ] **Training**: Ops team trained on new disputes workflow
- [ ] **Data Migration**: V1 historical data migrated to V2 schema
- [ ] **Webhook Integration**: VISA/Mastercard webhooks tested
- [ ] **SFTP Connectors**: Bank SFTP connections established
- [ ] **S3 Storage**: Evidence document storage configured
- [ ] **Email Notifications**: Chargeback alerts working

---

## Support Contacts

**Deployment Issues:**
- DevOps: devops@settlepaisa.com
- Database: dba@settlepaisa.com

**Application Issues:**
- Backend: backend-team@settlepaisa.com
- Frontend: frontend-team@settlepaisa.com

**Emergency Rollback:**
- On-call: +91-XXXX-XXXXXX

---

## Appendix: Quick Reference

### Service Ports
| Service | Port | Health Check |
|---------|------|--------------|
| PG API | 5101 | http://localhost:5101/health |
| Bank API | 5102 | http://localhost:5102/health |
| Recon API | 5103 | http://localhost:5103/health |
| Disputes API | 5104 | http://localhost:5104/health |
| Overview API | 5105 | http://localhost:5105/health |
| Ingest API | 5106 | http://localhost:5106/health |
| Analytics API | 5107 | http://localhost:5107/health |
| Frontend | 80/443 | https://ops-staging.settlepaisa.com |

### Database Connection String
```
postgresql://settlepaisa_staging:STAGING_PASSWORD@localhost:5432/settlepaisa_v2_staging
```

### Common Commands
```bash
# Restart all services
sudo systemctl restart settlepaisa-*

# Check service status
sudo systemctl status settlepaisa-disputes-api

# View logs
sudo journalctl -u settlepaisa-disputes-api -f

# Database shell
PGPASSWORD='STAGING_PASSWORD' psql -h localhost -U settlepaisa_staging -d settlepaisa_v2_staging

# Rebuild frontend
npm run build -- --mode staging
```

---

**✅ READY FOR STAGING DEPLOYMENT**
