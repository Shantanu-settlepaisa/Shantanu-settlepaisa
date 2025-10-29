# Email to Admin - CloudFront Permissions Request

---

**To:** abhimanyu.jha@sabpaisa.in  
**CC:** shantanu.singh@sabpaisa.in  
**Subject:** [URGENT] AWS CloudFront Permissions Needed - SettlePaisa Dashboard Deployment Blocked

---

Hi Abhimanyu,

I'm currently deploying the **SettlePaisa Ops & Merchant Dashboards** to AWS and have hit a **critical blocker** due to missing CloudFront permissions.

## Current Status ✅

I've successfully completed:
- ✅ RDS PostgreSQL database created and running
- ✅ Both dashboards built and uploaded to S3 (~5MB total)
- ✅ All infrastructure configured

## The Problem ❌

The IAM user `developer` cannot create CloudFront distributions due to missing permissions:

```
Error: User arn:aws:iam::494253214161:user/developer is not authorized 
to perform: cloudfront:CreateDistribution
```

**Impact:** The dashboards are uploaded to S3 but **NOT publicly accessible**. Without CloudFront:
- No public URLs to access dashboards
- No HTTPS
- SPA routing broken (React apps need error page handling)

## Required Permissions 🔐

Please add the following IAM policy to user **`developer`** (Account: **494253214161**):

### Policy 1: CloudFront Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFrontAccess",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:ListDistributions",
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation"
      ],
      "Resource": "*"
    }
  ]
}
```

### Policy 2: S3 Public Access (Optional but Recommended)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BucketPolicy",
      "Effect": "Allow",
      "Action": [
        "s3:PutBucketPolicy",
        "s3:PutPublicAccessBlock",
        "s3:GetBucketPolicy"
      ],
      "Resource": [
        "arn:aws:s3:::shantanu-settlepaisa-*"
      ]
    }
  ]
}
```

## Alternative: Manual CloudFront Setup

If you prefer to create CloudFront manually instead of granting permissions:

### For Ops Dashboard:
1. Go to CloudFront → Create Distribution
2. **Origin Domain:** `shantanu-settlepaisa-ops-staging.s3.ap-south-1.amazonaws.com`
3. **Default Root Object:** `index.html`
4. **Custom Error Responses:**
   - Error Code: 403 → Response Path: `/index.html` → HTTP 200
   - Error Code: 404 → Response Path: `/index.html` → HTTP 200
5. **Viewer Protocol:** Redirect HTTP to HTTPS

### For Merchant Dashboard:
1. Same as above but use origin: `shantanu-settlepaisa-merchant-staging.s3.ap-south-1.amazonaws.com`

## Deployment Details 📋

- **AWS Account:** 494253214161 (SabPaisa-RnD-ShantanuSingh)
- **Region:** ap-south-1 (Mumbai)
- **S3 Buckets:** 
  - shantanu-settlepaisa-ops-staging
  - shantanu-settlepaisa-merchant-staging
- **Current Cost:** ~$15/month (RDS only)
- **Budget:** $150/month (well within limits)

## Urgency ⏰

This is blocking the entire deployment. Once permissions are granted, I can:
1. Create CloudFront distributions (5 min)
2. Get public dashboard URLs (immediate)
3. Complete backend deployment (2 hours)
4. **Have fully functional dashboards live** (today/tomorrow)

## What Happens Next? 🚀

**After permissions granted:**
```bash
# I'll run these commands (takes 5 minutes):
aws cloudfront create-distribution --distribution-config cloudfront-ops.json
aws cloudfront create-distribution --distribution-config cloudfront-merchant.json

# Result: 2 live HTTPS URLs like:
# https://d1a2b3c4d5e6f7.cloudfront.net (Ops Dashboard)
# https://d9g8h7i6j5k4l3.cloudfront.net (Merchant Dashboard)
```

## Request 🙏

**Option 1 (Preferred):** Grant CloudFront permissions to user `developer`  
**Option 2:** Manually create 2 CloudFront distributions (steps above)  
**Option 3:** Schedule a quick call to do this together (15 min)

Please let me know which option works best. Happy to jump on a call if needed!

## Documentation 📄

I've created complete deployment documentation at:
- `/Users/shantanusingh/ops-dashboard/DEPLOYMENT_COMPLETE.md`
- All credentials, endpoints, and next steps documented

Thank you!

Best regards,  
Shantanu Singh  
shantanu.singh@sabpaisa.in

---

## Attachments (Optional)
- DEPLOYMENT_COMPLETE.md (comprehensive deployment guide)
- AWS_DEPLOYMENT_SUMMARY.md (current status)

---

## Quick Reference
- **AWS Console:** https://494253214161.signin.aws.amazon.com/console
- **CloudFront Console:** https://console.aws.amazon.com/cloudfront
- **RDS Endpoint:** settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com
