#!/bin/bash

echo "Checking if protection code is deployed on staging..."
echo "================================================================"

# Check the cleanDataForDate function in the deployed code
curl -s "http://13.201.179.44:5109/api/health" | jq '.' || echo "API health check failed"

echo ""
echo "The API is responding, but we need to check the actual code on EC2"
echo "to verify if the protection logic is deployed."
echo ""
echo "To verify deployment, SSH to EC2 and check:"
echo "  cat /home/ec2-user/ops-dashboard/services/api/file-upload-v2.cjs | grep -A 10 'SAFETY CHECK'"
