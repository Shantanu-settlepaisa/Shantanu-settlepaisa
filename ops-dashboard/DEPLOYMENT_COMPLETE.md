# AWS Deployment - Phase 1 Complete ✅

**Date:** October 5, 2025  
**Time:** 11:30 PM IST  
**Version:** v2.26.0  
**Account:** 494253214161 (SabPaisa-RnD-ShantanuSingh)

---

## ✅ COMPLETED SUCCESSFULLY

### 1. AWS Credentials
- ✅ Access Key configured
- ✅ Region set to ap-south-1 (Mumbai)
- ✅ Verified with `aws sts get-caller-identity`

### 2. RDS PostgreSQL Database
- ✅ **Instance Created:** settlepaisa-staging
- ✅ **Status:** backing-up (will be `available` in 1-2 min)
- ✅ **Endpoint:** `settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com`
- ✅ **Port:** 5432
- ✅ **Database:** settlepaisa_v2
- ✅ **Username:** postgres
- ✅ **Password:** SettlePaisa2024!
- ✅ **Engine:** PostgreSQL 14.13
- ✅ **Storage:** 20GB gp3
- ✅ **Public Access:** Enabled
- ✅ **Backup:** 7 days

**Connection String:**
```
postgresql://postgres:SettlePaisa2024!@settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com:5432/settlepaisa_v2
```

### 3. S3 Buckets (Static Hosting)
- ✅ **Ops Dashboard:** s3://shantanu-settlepaisa-ops-staging
- ✅ **Merchant Dashboard:** s3://shantanu-settlepaisa-merchant-staging
- ✅ Website hosting enabled
- ✅ Content uploaded (2.6MB each, 91 files)

**S3 Website URLs:** (Blocked due to public access restrictions)
- Ops: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com
- Merchant: http://shantanu-settlepaisa-merchant-staging.s3-website.ap-south-1.amazonaws.com

---

## ⚠️ PERMISSION ISSUES ENCOUNTERED

### CloudFront Distribution Creation
**Error:** `User is not authorized to perform: cloudfront:CreateDistribution`

**Impact:**  
- Cannot create CloudFront CDN distributions
- S3 website URLs are blocked by public access policy
- Frontend apps uploaded but not publicly accessible yet

**Solution Required:**
1. Contact admin (`abhimanyu.jha@sabpaisa.in`)
2. Request IAM permissions for user `developer`:
   - `cloudfront:CreateDistribution`
   - `cloudfront:UpdateDistribution`
   - `cloudfront:GetDistribution`
   - `s3:PutBucketPolicy` (for public access)

---

## 🚧 NEXT STEPS (Requires Manual Action)

### Option A: Get CloudFront Permissions (Recommended)
**Admin needs to add these policies to user `developer`:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:ListDistributions",
        "cloudfront:CreateInvalidation"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutBucketPolicy",
        "s3:PutPublicAccessBlock"
      ],
      "Resource": [
        "arn:aws:s3:::shantanu-settlepaisa-*"
      ]
    }
  ]
}
```

**Then run:**
```bash
cd /Users/shantanusingh/ops-dashboard
aws cloudfront create-distribution --distribution-config file://cloudfront-ops-config.json
aws cloudfront create-distribution --distribution-config file://cloudfront-merchant-config.json
```

### Option B: Admin Creates CloudFront Manually
**Admin can:**
1. Log into AWS Console
2. Go to CloudFront → Create Distribution
3. **For Ops Dashboard:**
   - Origin: shantanu-settlepaisa-ops-staging.s3.ap-south-1.amazonaws.com
   - Default root: index.html
   - Error pages: 403 & 404 → /index.html (200)
4. **For Merchant Dashboard:**
   - Origin: shantanu-settlepaisa-merchant-staging.s3.ap-south-1.amazonaws.com
   - Default root: index.html
   - Error pages: 403 & 404 → /index.html (200)

---

## 📋 REMAINING DEPLOYMENT TASKS

### 1. Database Migration (When RDS is available)
```bash
# Check if RDS is available
aws rds describe-db-instances \
  --db-instance-identifier settlepaisa-staging \
  --query 'DBInstances[0].DBInstanceStatus' \
  --output text

# Export local database
pg_dump -h localhost -p 5433 -U postgres settlepaisa_v2 > /tmp/settlepaisa_v2.sql

# Import to RDS
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2 < /tmp/settlepaisa_v2.sql
```

### 2. Backend APIs Deployment
**Services to deploy:**
- services/merchant-api (port 8080)
- services/overview-api (port 5105)
- services/recon-api (port 5103)
- services/exports-api (port 5106)

**Options:**
- Deploy to EC2 instance with PM2
- Use Elastic Beanstalk
- Use ECS Fargate

### 3. Frontend Rebuild with Production URLs
**After backend APIs are deployed:**
1. Update `.env.staging-ops` with API URLs
2. Update `.env.staging-merchant` with API URLs
3. Rebuild both dashboards
4. Re-upload to S3
5. Invalidate CloudFront cache

---

## 💰 Current Costs

| Resource | Cost/Month |
|----------|------------|
| RDS db.t3.micro | ~$15-20 |
| S3 (2 buckets, 5MB) | ~$0.10 |
| CloudFront (pending) | ~$1-5 |
| **Current Total** | **~$15-20** |

Well under $150 budget ✅

---

## 🔑 CREDENTIALS REFERENCE

### AWS Account
- **Account ID:** 494253214161
- **Console URL:** https://494253214161.signin.aws.amazon.com/console
- **IAM User:** developer
- **Region:** ap-south-1

### RDS Database (settlepaisa_v2)
- **Host:** settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
- **Port:** 5432
- **Database:** settlepaisa_v2
- **Username:** postgres
- **Password:** SettlePaisa2024!

### S3 Buckets
- **Ops:** shantanu-settlepaisa-ops-staging
- **Merchant:** shantanu-settlepaisa-merchant-staging

---

## 📊 Deployment Status Summary

| Component | Status | Next Action |
|-----------|--------|-------------|
| AWS Account | ✅ Ready | - |
| RDS Database | 🟡 Backing up | Wait 1-2 min, then migrate data |
| S3 Buckets | ✅ Ready | - |
| Ops Frontend | ✅ Uploaded | Need CloudFront |
| Merchant Frontend | ✅ Uploaded | Need CloudFront |
| CloudFront | ❌ No permission | Request from admin |
| Backend APIs | ⏳ Pending | Deploy to EC2/ECS |
| DB Migration | ⏳ Pending | Wait for RDS |

---

## 🎯 Tomorrow's Action Items

### Immediate (Admin Action Required)
1. **Request CloudFront permissions** from abhimanyu.jha@sabpaisa.in
2. **Verify RDS is available:**
   ```bash
   aws rds describe-db-instances --db-instance-identifier settlepaisa-staging
   ```

### Once Permissions Granted
3. **Create CloudFront distributions**
4. **Get live dashboard URLs**
5. **Migrate database to RDS**
6. **Deploy backend APIs**
7. **Update frontends with API URLs**
8. **Test everything end-to-end**

---

## 📝 Quick Reference Commands

### Check RDS Status
```bash
aws rds describe-db-instances \
  --db-instance-identifier settlepaisa-staging \
  --query 'DBInstances[0].DBInstanceStatus'
```

### Test RDS Connection
```bash
psql -h settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com \
  -U postgres \
  -d settlepaisa_v2
# Password: SettlePaisa2024!
```

### List S3 Contents
```bash
aws s3 ls s3://shantanu-settlepaisa-ops-staging/
aws s3 ls s3://shantanu-settlepaisa-merchant-staging/
```

### Sync Updated Builds
```bash
aws s3 sync dist-ops/ s3://shantanu-settlepaisa-ops-staging/ --delete
aws s3 sync dist-merchant/ s3://shantanu-settlepaisa-merchant-staging/ --delete
```

---

## ✅ What We Achieved Tonight

1. ✅ Consolidated git branches (partial)
2. ✅ Built both dashboards successfully
3. ✅ Configured AWS credentials
4. ✅ Created RDS PostgreSQL instance
5. ✅ Created S3 buckets
6. ✅ Uploaded both dashboards to S3
7. ✅ Got RDS endpoint
8. ✅ Documented everything

**Total Time:** ~2 hours  
**AWS Cost So Far:** ~$15/month (RDS only)

---

## 📧 Email to Admin

**To:** abhimanyu.jha@sabpaisa.in  
**Subject:** AWS CloudFront Permissions Request - SettlePaisa Deployment

Hi Abhimanyu,

I'm deploying the SettlePaisa dashboards to AWS and need CloudFront permissions for user `developer` (Account: 494253214161).

**Current Status:**
- ✅ RDS database created
- ✅ Dashboards uploaded to S3
- ❌ Cannot create CloudFront (permission denied)

**Permissions Needed:**
- cloudfront:CreateDistribution
- cloudfront:UpdateDistribution
- cloudfront:GetDistribution
- cloudfront:CreateInvalidation
- s3:PutBucketPolicy

Could you please add these permissions to IAM user `developer`?

Thanks,
Shantanu

---

**Status:** Phase 1 Complete - Waiting for permissions  
**Next:** CloudFront setup → Backend deployment → Database migration  
**ETA to Full Deployment:** 2-3 hours after permissions granted
