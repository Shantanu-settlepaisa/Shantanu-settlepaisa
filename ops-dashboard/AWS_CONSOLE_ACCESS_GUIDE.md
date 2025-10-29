# AWS Console Access to Staging Server

**Quick Guide:** How to access the EC2 instance via AWS Console when SSH keys don't work

---

## 🌐 Method 1: EC2 Instance Connect (Easiest)

### Step 1: Open AWS Console
1. Go to https://console.aws.amazon.com
2. Sign in to your AWS account
3. Select region: **ap-south-1 (Mumbai)**

### Step 2: Navigate to EC2
1. Services → EC2
2. Click "Instances (running)" in left sidebar
3. Search for instance with IP `13.201.179.44`

### Step 3: Connect via Browser
1. Select the instance (checkbox)
2. Click **"Connect"** button at top
3. Choose **"EC2 Instance Connect"** tab
4. Click **"Connect"** button

**Result:** Opens a browser-based terminal connected to the server!

### Step 4: Run Fix Commands
Now you're in! Run these commands:

```bash
cd ~/ops-dashboard
git reset --hard origin/feat/ops-dashboard-exports
cd ~/services/overview-api
pm2 delete overview-api && pm2 start index.js --name overview-api --cwd ~/services/overview-api
curl -X POST http://localhost:5108/api/auth/login
```

---

## 🖥️ Method 2: Systems Manager Session Manager

### Prerequisites
- AWS CLI installed locally
- Proper IAM permissions

### Commands
```bash
# Get instance ID first
aws ec2 describe-instances \
  --filters "Name=ip-address,Values=13.201.179.44" \
  --query "Reservations[].Instances[].InstanceId" \
  --region ap-south-1

# Start session (replace INSTANCE-ID)
aws ssm start-session --target i-INSTANCE-ID --region ap-south-1
```

---

## 🔑 Method 3: Fix SSH Key Locally

### Check which key works

```bash
# Try each key
ssh -i ~/.ssh/settlepaisa-backend-key ec2-user@13.201.179.44
ssh -i ~/.ssh/temp_ec2_key ec2-user@13.201.179.44
ssh -i ~/.ssh/temp_ec2_key2 ec2-user@13.201.179.44
ssh -i ~/.ssh/temp_ec2_key3 ec2-user@13.201.179.44
```

### If none work, download new key from AWS

1. AWS Console → EC2 → Key Pairs
2. Find the key pair used by this instance
3. If lost, create new key pair and:
   - Stop instance
   - Detach volume
   - Attach to temporary instance
   - Add new public key to ~/.ssh/authorized_keys
   - Reattach volume to original instance
   - Start instance

---

## 📋 Quick Command Reference

Once connected (any method), copy-paste this:

```bash
#!/bin/bash
# Phase 1 Fix - Quick Execution

echo "=== Step 1: Git Pull ==="
cd ~/ops-dashboard
git fetch origin feat/ops-dashboard-exports
git reset --hard origin/feat/ops-dashboard-exports
git log -1 --oneline

echo ""
echo "=== Step 2: Verify Files ==="
ls -lh services/overview-api/auth.cjs
ls -lh services/overview-api/lib/
grep -n "app.use('/api/auth" services/overview-api/index.js

echo ""
echo "=== Step 3: Test Module Loading ==="
cd ~/services/overview-api
node -e "const auth = require('./auth.cjs'); console.log('✅ Routes:', auth.stack.length);"

echo ""
echo "=== Step 4: Hard Restart PM2 ==="
pm2 delete overview-api
pm2 start index.js --name overview-api --cwd ~/services/overview-api
sleep 3
pm2 list

echo ""
echo "=== Step 5: Test Auth Endpoint ==="
curl -X POST http://localhost:5108/api/auth/login
echo ""
echo ""
curl -X POST http://localhost:5108/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@settlepaisa.com","password":"StagingAdmin2025!"}'
echo ""
echo ""
echo "=== DONE ==="
```

---

## ✅ Success Indicators

After running commands, you should see:

```
✅ Routes: 6
✅ PM2 status: online
✅ Auth endpoint: {"success":false,"error":"Missing required fields..."}
✅ Login: {"success":true,"data":{"token":"eyJ...
```

---

## 🆘 Troubleshooting

### Can't access AWS Console
- Check if you have AWS credentials
- Verify IAM permissions
- Try switching AWS region to ap-south-1

### EC2 Instance Connect fails
- Instance may not have Instance Connect enabled
- Security group may block it
- Try Systems Manager instead

### Systems Manager fails
- SSM agent may not be installed on instance
- IAM role may be missing
- Try EC2 Instance Connect instead

---

## 📞 Need Help?

If you can't access the server:
1. Check if you have AWS Console access
2. Verify the instance is running
3. Check security groups allow SSH (port 22)
4. Try all three methods above

**Still stuck?** Report:
- Which methods you tried
- Error messages received
- Your AWS IAM permissions

---

**Recommended:** Use **EC2 Instance Connect** (Method 1) - it's the easiest!
