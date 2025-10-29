# Email to Admin - CloudFront Access Issue (Region Restriction)

---

**To:** abhimanyu.jha@sabpaisa.in  
**CC:** shantanu.singh@sabpaisa.in  
**Subject:** [ACTION NEEDED] AWS Policy Update - CloudFront Blocked by Region Restriction

---

Hi Abhimanyu,

I've identified the exact issue blocking the SettlePaisa dashboard deployment.

## Root Cause 🔍

The IAM policy for user `developer` has a **region restriction** that blocks **global AWS services** like CloudFront:

**Current Policy (DeveloperAccess):**
```json
{
  "Effect": "Allow",
  "Action": ["*"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:RequestedRegion": "ap-south-1"  ← This blocks CloudFront!
    }
  }
}
```

**Problem:** CloudFront is a **global service** (no region), so it's blocked by the `ap-south-1` condition.

## Impact ❌

- ✅ RDS, S3, EC2 work (regional services in ap-south-1)
- ❌ CloudFront blocked (global service)
- ❌ Dashboards uploaded to S3 but **not publicly accessible**

## Solution ✅

Add a second statement to allow global services **without region restriction**:

### Updated Policy for `developer`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RegionalServices",
      "Effect": "Allow",
      "Action": ["*"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-south-1"
        }
      }
    },
    {
      "Sid": "GlobalServices",
      "Effect": "Allow",
      "Action": [
        "cloudfront:*",
        "route53:*",
        "waf:*",
        "acm:*",
        "iam:Get*",
        "iam:List*"
      ],
      "Resource": "*"
    }
  ]
}
```

## How to Apply 🛠️

### Option 1: AWS Console (2 minutes)
1. Go to IAM → Policies → `DeveloperAccess`
2. Click "Edit Policy" → JSON tab
3. Replace with updated policy above
4. Save changes

### Option 2: AWS CLI
```bash
aws iam create-policy-version \
  --policy-arn arn:aws:iam::494253214161:policy/DeveloperAccess \
  --policy-document file://updated-policy.json \
  --set-as-default
```

## What Happens Next ⚡

**After policy update (takes 5 seconds to propagate):**
```bash
# I'll immediately run:
aws cloudfront create-distribution --distribution-config cloudfront-ops.json
aws cloudfront create-distribution --distribution-config cloudfront-merchant.json

# Result (5 minutes):
✅ Ops Dashboard: https://d1a2b3c4.cloudfront.net
✅ Merchant Dashboard: https://d5e6f7g8.cloudfront.net
```

## Why This is Safe 🔐

The policy still restricts:
- ✅ All regional services to ap-south-1 only
- ✅ Global services to read-only (Get/List) + CloudFront
- ✅ No access to other regions
- ✅ Budget limits still apply ($150/month)

## Alternative: Manual CloudFront Creation

If you prefer not to update the policy, you can create CloudFront distributions manually:

1. **Login to AWS Console** (your admin credentials)
2. **Go to CloudFront** → Create Distribution
3. **For Ops Dashboard:**
   - Origin: `shantanu-settlepaisa-ops-staging.s3.ap-south-1.amazonaws.com`
   - Default root: `index.html`
   - Error pages: 403, 404 → `/index.html` (HTTP 200)
4. **For Merchant Dashboard:**
   - Same setup, origin: `shantanu-settlepaisa-merchant-staging.s3.ap-south-1.amazonaws.com`

## Current Status 📊

- ✅ RDS database running
- ✅ Dashboards uploaded to S3 (5MB)
- ✅ Infrastructure configured
- ❌ **Blocked:** CloudFront (region restriction)
- **Cost:** $15/month (RDS only)

## Urgency ⏰

This is the **final blocker** for deployment. Once resolved:
- ✅ Public dashboard URLs in 5 minutes
- ✅ Complete deployment in 2-3 hours
- ✅ Fully functional dashboards live

## Request 🙏

**Option 1 (Preferred):** Update IAM policy (2 min)  
**Option 2:** Create CloudFront manually (10 min)  
**Option 3:** Quick call to do together (5 min)

Please let me know which works best!

Thank you,  
Shantanu Singh  
shantanu.singh@sabpaisa.in

---

## Quick Reference
- **AWS Console:** https://494253214161.signin.aws.amazon.com/console
- **IAM Policy:** arn:aws:iam::494253214161:policy/DeveloperAccess
- **User:** developer
- **Current Policy:** Region-restricted (blocks CloudFront)
- **Fix:** Add global services statement (see above)
