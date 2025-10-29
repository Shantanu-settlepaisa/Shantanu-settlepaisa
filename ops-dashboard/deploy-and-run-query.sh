#!/bin/bash

set -e

echo "=============================================================================="
echo "Deploying Query Script to EC2 Staging Instance"
echo "=============================================================================="
echo ""

EC2_HOST="13.201.179.44"
EC2_USER="ec2-user"
SSH_KEY="$HOME/.ssh/settlepaisa-backend-key"
SCRIPT_FILE="query-oct26-transactions.cjs"

echo "📦 Step 1: Checking SSH key permissions..."
if [ ! -f "$SSH_KEY" ]; then
  echo "❌ SSH key not found at $SSH_KEY"
  exit 1
fi

chmod 400 "$SSH_KEY"
echo "✅ SSH key permissions set to 400"
echo ""

echo "📤 Step 2: Copying query script to EC2..."
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" \
  "$SCRIPT_FILE" \
  "${EC2_USER}@${EC2_HOST}:/tmp/${SCRIPT_FILE}" || {
  echo "❌ Failed to copy script to EC2"
  echo ""
  echo "Troubleshooting steps:"
  echo "1. Check if EC2 instance is running:"
  echo "   aws ec2 describe-instances --instance-ids i-08ac67ac776d4ab23 --query 'Reservations[0].Instances[0].State.Name'"
  echo ""
  echo "2. Verify SSH key matches EC2 key pair"
  echo "3. Check security group allows SSH from your IP"
  exit 1
}
echo "✅ Script copied to EC2:/tmp/${SCRIPT_FILE}"
echo ""

echo "🔧 Step 3: Installing dependencies on EC2 (if needed)..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" << 'EOF'
  # Check if pg module is installed globally or in current directory
  if ! node -e "require('pg')" 2>/dev/null; then
    echo "Installing pg module..."
    npm install -g pg 2>/dev/null || npm install pg
  else
    echo "pg module already installed"
  fi
EOF
echo "✅ Dependencies ready"
echo ""

echo "🚀 Step 4: Executing query script on EC2..."
echo "=============================================================================="
echo ""

ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" \
  "node /tmp/${SCRIPT_FILE}"

QUERY_EXIT_CODE=$?

echo ""
echo "=============================================================================="

if [ $QUERY_EXIT_CODE -eq 0 ]; then
  echo "✅ Query completed successfully"
else
  echo "❌ Query failed with exit code $QUERY_EXIT_CODE"
  exit 1
fi

echo ""
echo "🧹 Step 5: Cleaning up temporary files..."
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" \
  "rm -f /tmp/${SCRIPT_FILE}"
echo "✅ Cleanup complete"
echo ""

echo "=============================================================================="
echo "✅ All Done!"
echo "=============================================================================="
