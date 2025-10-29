#!/usr/bin/env node

const path = require('path');

// Simulate the upload API's environment loading
console.log('\n🧪 Testing Environment Loading for Upload API\n');
console.log('Current directory:', process.cwd());
console.log('Script directory:', __dirname);

// Simulate what env-loader does
const serviceName = 'api';
const serviceDir = path.join(__dirname, 'services', 'shared', '..', serviceName);
const envPath = path.join(serviceDir, '.env');

console.log('\nPath resolution:');
console.log('  Service name:', serviceName);
console.log('  Service dir:', serviceDir);
console.log('  Resolved .env path:', envPath);
console.log('  Normalized path:', path.normalize(envPath));

const fs = require('fs');
console.log('\n  .env file exists?', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
  console.log('\n  ✅ File found! Contents:');
  const contents = fs.readFileSync(envPath, 'utf8');
  console.log(contents.split('\n').map(line => '    ' + line).join('\n'));
} else {
  console.log('\n  ❌ File not found!');

  // Check alternative paths
  const altPaths = [
    path.join(__dirname, 'ops-dashboard', 'services', 'api', '.env'),
    path.join(__dirname, 'services', 'api', '.env'),
    '/home/ec2-user/ops-dashboard/ops-dashboard/services/api/.env'
  ];

  console.log('\n  Checking alternative paths:');
  altPaths.forEach(p => {
    console.log(`    ${p}: ${fs.existsSync(p) ? '✅' : '❌'}`);
  });
}

// Now actually load it like the upload API does
console.log('\n\n🔄 Loading environment like upload API does:\n');

const { initEnv } = require('./services/shared/env-loader.cjs');

const config = initEnv('api', {
  skipValidation: true,
  fallbackToShared: true,
});

console.log('\n📊 Resulting configuration:');
console.log('  DB Host:', config.db.host);
console.log('  DB Port:', config.db.port);
console.log('  DB Name:', config.db.database);
console.log('  DB User:', config.db.user);
console.log('  DB Password:', config.db.password ? '***' + config.db.password.slice(-4) : 'NOT SET');
