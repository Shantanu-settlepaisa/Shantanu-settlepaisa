#!/bin/bash

# Deploy Upload API to EC2 Staging
# Run this script on EC2 instance

set -e

echo "📦 Downloading upload-api from S3..."
cd /home/ec2-user
aws s3 cp s3://shantanu-settlepaisa-ops-staging/deployment/upload-api.tar.gz .

echo "📂 Extracting upload-api..."
tar -xzf upload-api.tar.gz

echo "📁 Checking extracted files..."
ls -la services/api

echo "📦 Installing dependencies..."
cd services/api
npm install

echo "🔧 Updating database config to use RDS..."
sed -i "s/host: process.env.DATABASE_HOST || 'localhost'/host: process.env.DATABASE_HOST || 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com'/g" file-upload-v2.cjs
sed -i "s/port: parseInt(process.env.DATABASE_PORT || '5433')/port: parseInt(process.env.DATABASE_PORT || '5432')/g" file-upload-v2.cjs

echo "🚀 Starting upload-api with PM2..."
pm2 start file-upload-v2.cjs --name upload-api

echo "💾 Saving PM2 configuration..."
pm2 save

echo "📊 Checking PM2 status..."
pm2 list

echo "✅ Testing upload-api endpoint..."
sleep 2
curl http://localhost:5107/api/upload/stats

echo ""
echo "🎉 Upload API deployed successfully!"
echo "📍 Endpoint: http://13.201.179.44:5107/api/upload/multiple"
