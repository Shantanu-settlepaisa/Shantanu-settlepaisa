# Deploy V2 API Structure Fix to EC2 Staging

## Problem
The dashboard shows "Failed to load overview data" because the `/api/overview` endpoint returns a flat structure but the frontend expects a V2 nested structure.

## Fix Applied (Local)
Updated `services/overview-api/index.js` (lines 569-624) to return:
```json
{
  "pipeline": {...},
  "reconciliation": {...},
  "financial": {...}
}
```

Instead of the old flat structure:
```json
{
  "captured": 0,
  "inSettlement": 0,
  ...
}
```

## Deployment Steps

### Option 1: SSH Deployment (Recommended)
```bash
# Connect to EC2
ssh -i ~/.ssh/settlepaisa-backend-key ubuntu@13.201.179.44

# Navigate to service directory
cd ~/services/overview-api

# Pull latest code
git fetch origin
git pull origin feat/ops-dashboard-exports

# Restart PM2 service
pm2 restart overview-api

# Verify deployment
curl -s http://localhost:5108/api/overview | jq 'keys'
# Should show: ["pipeline", "reconciliation", "financial"]

# Test from outside
exit
curl -s http://13.201.179.44:5108/api/overview | jq 'keys'
```

### Option 2: Manual File Upload
If SSH fails, manually upload the fixed `index.js` file:

1. Download from GitHub: https://github.com/Shantanu-settlepaisa/Shantanu-settlepaisa/blob/feat/ops-dashboard-exports/ops-dashboard/services/overview-api/index.js

2. Use AWS Systems Manager Session Manager:
   - Go to EC2 Console
   - Select instance i-08ac67ac776d4ab23
   - Click "Connect" → "Session Manager"
   - Run:
     ```bash
     cd ~/services/overview-api
     # Backup current file
     cp index.js index.js.backup
     # Upload new file via SCP or paste content
     pm2 restart overview-api
     ```

### Option 3: EC2 Instance Connect
```bash
# Generate temporary key
ssh-keygen -t rsa -b 2048 -f /tmp/temp_key -N ""

# Send to EC2 (valid for 60 seconds)
aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-08ac67ac776d4ab23 \
  --instance-os-user ubuntu \
  --ssh-public-key file:///tmp/temp_key.pub \
  --availability-zone ap-south-1c

# Immediately connect
ssh -i /tmp/temp_key ubuntu@13.201.179.44 \
  "cd ~/services/overview-api && git pull origin feat/ops-dashboard-exports && pm2 restart overview-api"
```

## Verification

### 1. Check API Response Structure
```bash
curl -s "http://13.201.179.44:5108/api/overview" | jq 'keys'
```

Expected output:
```json
[
  "financial",
  "pipeline",
  "reconciliation"
]
```

### 2. Test Dashboard
Navigate to: http://shantanu-settlepaisa-ops-staging.s3-website.ap-south-1.amazonaws.com/ops/overview

Should show data instead of "Failed to load overview data" error.

### 3. Check API Response Data
```bash
curl -s "http://13.201.179.44:5108/api/overview" | jq '{
  pipeline_captured: .pipeline.captured,
  recon_matched: .reconciliation.matched,
  financial_gross: .financial.grossAmount
}'
```

Should return non-zero values.

## Git Commit
- **Commit**: a7f6d55
- **Branch**: feat/ops-dashboard-exports
- **Message**: "fix: Return V2 nested structure from /api/overview endpoint"

## EC2 Instance Details
- **Instance ID**: i-08ac67ac776d4ab23
- **Public IP**: 13.201.179.44
- **Region**: ap-south-1
- **AZ**: ap-south-1c
- **Key Pair**: settlepaisa-backend-key
- **Service Path**: ~/services/overview-api
- **PM2 Process**: overview-api
- **Port**: 5108

## Troubleshooting

### If PM2 restart fails:
```bash
pm2 logs overview-api --lines 50
pm2 describe overview-api
```

### If API still returns old structure:
```bash
# Check if code was actually updated
git log -1 --oneline
# Should show: a7f6d55 fix: Return V2 nested structure

# Check if correct file is being run
pm2 describe overview-api | grep script
```

### If dashboard still fails:
- Clear browser cache
- Check browser console for errors
- Verify frontend is using correct API URL
