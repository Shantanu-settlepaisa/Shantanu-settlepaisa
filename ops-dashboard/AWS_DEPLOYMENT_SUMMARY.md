# AWS Full Stack Deployment - Summary

**Date:** October 5, 2025  
**Version:** v2.26.0  
**Account:** 494253214161 (SabPaisa-RnD-ShantanuSingh)  
**Region:** ap-south-1 (Mumbai)

---

## ✅ DEPLOYED SUCCESSFULLY

### 1. RDS PostgreSQL Database
- **Identifier:** settlepaisa-staging
- **Engine:** PostgreSQL 14.13
- **Instance Class:** db.t3.micro
- **Storage:** 20GB gp3
- **Status:** Creating (takes 5-10 minutes)
- **Database:** settlepaisa_v2
- **Username:** postgres
- **Password:** `SettlePaisa2024!`
- **Public Access:** Yes
- **Backup:** 7 days retention

**Get Endpoint:**
```bash
aws rds describe-db-instances \
  --db-instance-identifier settlepaisa-staging \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text
```

### 2. S3 Buckets (Static Hosting)
- **Ops Dashboard:** s3://shantanu-settlepaisa-ops-staging
- **Merchant Dashboard:** s3://shantanu-settlepaisa-merchant-staging
- **Status:** ✅ Created and content uploaded

**Uploaded:**
- Ops: ~2.6MB (91 files)
- Merchant: ~2.6MB (91 files)

---

## 🚧 PENDING STEPS

### 3. CloudFront Distributions (CDN)
**Need to create:**
```bash
# Ops Dashboard CloudFront
aws cloudfront create-distribution \
  --origin-domain-name shantanu-settlepaisa-ops-staging.s3.ap-south-1.amazonaws.com \
  --default-root-object index.html

# Merchant Dashboard CloudFront
aws cloudfront create-distribution \
  --origin-domain-name shantanu-settlepaisa-merchant-staging.s3.ap-south-1.amazonaws.com \
  --default-root-object index.html
```

### 4. Backend APIs Deployment
**Services to deploy:**
- `services/merchant-api` (port 8080)
- `services/overview-api` (port 5105)
- `services/recon-api` (port 5103)
- `services/exports-api` (port 5106)

**Options:**
- EC2 instance with PM2
- Elastic Beanstalk
- ECS Fargate

### 5. Database Migration
**Once RDS is available:**
```bash
# Export from local
pg_dump -h localhost -p 5433 -U postgres settlepaisa_v2 > settlepaisa_v2_dump.sql

# Import to RDS
psql -h <RDS_ENDPOINT> -U postgres -d settlepaisa_v2 < settlepaisa_v2_dump.sql
```

---

## 📊 Current Status

| Component | Status | Details |
|-----------|--------|---------|
| RDS Database | 🟡 Creating | 5-10 min wait |
| S3 Buckets | ✅ Ready | Content uploaded |
| Ops Frontend | ✅ Uploaded | S3 ready |
| Merchant Frontend | ✅ Uploaded | S3 ready |
| CloudFront | ⏳ Pending | Need to create |
| Backend APIs | ⏳ Pending | Need to deploy |
| DB Migration | ⏳ Pending | Wait for RDS |

---

## 💰 Cost Estimate

| Service | Monthly Cost |
|---------|--------------|
| RDS db.t3.micro | $15-20 |
| S3 (2 buckets) | $0.10 |
| CloudFront | $1-5 |
| EC2 t3.small | $15-20 |
| **Total** | **$31-45/month** |

Well under $150 budget ✅

---

## 🔐 Credentials Summary

### AWS Account
- Account ID: 494253214161
- Username: developer
- Access Key: AKIAXGE6JRHISPQ27GPC
- Region: ap-south-1

### RDS Database
- Host: (pending - check after 5-10 min)
- Port: 5432
- Database: settlepaisa_v2
- Username: postgres
- Password: SettlePaisa2024!

### S3 Buckets
- Ops: shantanu-settlepaisa-ops-staging
- Merchant: shantanu-settlepaisa-merchant-staging

---

## 🎯 Next Steps (Tomorrow)

1. **Check RDS Status**
   ```bash
   aws rds describe-db-instances \
     --db-instance-identifier settlepaisa-staging \
     --query 'DBInstances[0].DBInstanceStatus' \
     --output text
   ```

2. **Get RDS Endpoint**
   ```bash
   RDS_ENDPOINT=$(aws rds describe-db-instances \
     --db-instance-identifier settlepaisa-staging \
     --query 'DBInstances[0].Endpoint.Address' \
     --output text)
   echo $RDS_ENDPOINT
   ```

3. **Migrate Database**
   ```bash
   pg_dump -h localhost -p 5433 -U postgres settlepaisa_v2 > /tmp/db_dump.sql
   psql -h $RDS_ENDPOINT -U postgres -d settlepaisa_v2 < /tmp/db_dump.sql
   ```

4. **Create CloudFront Distributions**
   - Get CloudFront URLs
   - Configure custom error pages
   - Enable HTTPS

5. **Deploy Backend APIs**
   - Package services
   - Deploy to EC2/ECS
   - Update env with RDS endpoint

6. **Update Frontend with API URLs**
   - Rebuild with production URLs
   - Re-upload to S3
   - Invalidate CloudFront cache

7. **Test End-to-End**
   - Test both dashboards
   - Verify database connectivity
   - Check all features

---

## 📝 Quick Commands

### Check RDS Status
```bash
aws rds describe-db-instances --db-instance-identifier settlepaisa-staging
```

### List S3 Contents
```bash
aws s3 ls s3://shantanu-settlepaisa-ops-staging/
aws s3 ls s3://shantanu-settlepaisa-merchant-staging/
```

### Create CloudFront (Template)
```bash
aws cloudfront create-distribution \
  --distribution-config file://cloudfront-config.json
```

---

**Status:** Phase 1 Complete (Database creating, Frontends uploaded)  
**Next:** Wait for RDS → Migrate DB → Deploy backends → Create CloudFront  
**ETA:** 1-2 hours for full deployment
