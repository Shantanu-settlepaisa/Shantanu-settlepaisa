const https = require('https');

// Check if upload API is running and get recent logs
console.log('🔍 CHECKING UPLOAD API STATUS:\n');
console.log('Expected endpoint: http://52.66.199.215:5107/api/upload/single');
console.log('');
console.log('To check logs on EC2, run:');
console.log('  ssh ec2-user@52.66.199.215');
console.log('  pm2 logs upload-api --lines 50');
console.log('');
console.log('Look for:');
console.log('  - Bank file upload attempts');
console.log('  - V1->V2 conversion errors');
console.log('  - Database insert errors');
console.log('  - "❌ [V2 Upload] V1->V2 conversion failed"');
console.log('  - "Error inserting bank statement"');
