# 🚀 QUICK FIX - Run This Now

## ⚡ 3-Minute Fix

### **Step 1: SSH into Staging Server**
```bash
ssh ubuntu@52.66.199.215
# or: ssh ec2-user@52.66.199.215
```

### **Step 2: Find Project Location**
```bash
pm2 list
# Look for 'upload-api' in the output
# Note the directory path
```

### **Step 3: Run Auto-Fix Script**
```bash
cd /path/to/ops-dashboard  # Replace with actual path from Step 2
./fix-staging-auth-on-server.sh
```

**Expected Output:**
```
✅ FIX APPLIED SUCCESSFULLY!
Services restarted with matching configuration
```

### **Step 4: Verify Fix (from your local machine)**
```bash
# Exit SSH (or open new terminal)
cd ~/ops-dashboard
./diagnose-staging2-auth.sh
```

**Expected Output:**
```
✅ ALL TESTS PASSED!
```

### **Step 5: Test in Browser**
1. Open: http://settlepaisa-ops-staging-2.s3-website.ap-south-1.amazonaws.com
2. Login with: `admin@settlepaisa.com` / `Admin@123`
3. Go to Recon Workspace
4. Upload a test file
5. **Should work!** ✅

---

## 📋 If Auto-Fix Script Not Found

Copy and run these commands on the staging server:

```bash
# Navigate to services directory
cd /path/to/ops-dashboard/services

# Get JWT secret from overview-api
OVERVIEW_SECRET=$(grep '^JWT_SECRET=' overview-api/.env | cut -d= -f2-)

# Update upload-api .env
cd api
if grep -q '^JWT_SECRET=' .env; then
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$OVERVIEW_SECRET|" .env
else
  echo "JWT_SECRET=$OVERVIEW_SECRET" >> .env
fi

# Copy database config too
grep '^DB_HOST=' ../overview-api/.env > /tmp/db-temp
grep '^DB_PORT=' ../overview-api/.env >> /tmp/db-temp
grep '^DB_NAME=' ../overview-api/.env >> /tmp/db-temp
grep '^DB_USER=' ../overview-api/.env >> /tmp/db-temp
grep '^DB_PASSWORD=' ../overview-api/.env >> /tmp/db-temp

# Apply to upload-api
cat /tmp/db-temp | while read line; do
  key=$(echo $line | cut -d= -f1)
  sed -i "s|^$key=.*|$line|" .env
done

# Restart services
pm2 restart upload-api
pm2 restart overview-api

# Check status
pm2 status
```

---

## ✅ Success Checklist

- [ ] SSHed into staging server
- [ ] Ran fix script (or manual commands)
- [ ] Saw "FIX APPLIED SUCCESSFULLY"
- [ ] PM2 services restarted
- [ ] Ran diagnostic script locally
- [ ] Diagnostic shows "ALL TESTS PASSED"
- [ ] Tested login in browser
- [ ] Tested file upload in Recon Workspace
- [ ] No "Invalid token" error!

---

## 🆘 If Stuck

### Check PM2 Logs
```bash
pm2 logs upload-api --lines 20
```

Look for:
- ✅ `[Upload API] Starting on port 5107`
- ✅ `JWT secret validation passed`
- ❌ `INVALID_TOKEN` or authentication errors

### Verify Config Match
```bash
cd /path/to/ops-dashboard/services
echo "Overview JWT:"
grep JWT_SECRET overview-api/.env

echo "Upload JWT:"
grep JWT_SECRET api/.env

# Should be IDENTICAL
```

### Force Restart All
```bash
pm2 restart all
pm2 save
```

---

## 📞 Need Help?

Share this info:
```bash
# On staging server
pm2 logs upload-api --lines 100 --nostream > ~/upload-logs.txt
pm2 logs overview-api --lines 100 --nostream > ~/overview-logs.txt
echo "Upload API JWT_SECRET:" > ~/config-check.txt
grep JWT_SECRET services/api/.env >> ~/config-check.txt
echo "Overview API JWT_SECRET:" >> ~/config-check.txt
grep JWT_SECRET services/overview-api/.env >> ~/config-check.txt
```

Then share these 3 files:
- `upload-logs.txt`
- `overview-logs.txt`
- `config-check.txt`

---

**Time to Fix**: 3 minutes
**Risk**: None (backups auto-created)
**Complexity**: Low ⭐

**Go fix it now!** 🚀
