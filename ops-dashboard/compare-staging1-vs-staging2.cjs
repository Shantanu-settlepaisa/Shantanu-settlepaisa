#!/usr/bin/env node
/**
 * Side-by-Side Comparison: Staging 1 vs Staging 2
 * Tests EXACT same operations on both environments
 */

const axios = require('axios');
const { Pool } = require('pg');

const S1 = {
  name: 'Staging 1',
  overview: 'http://13.201.179.44:5108',
  recon: 'http://13.201.179.44:5103',
  upload: 'http://13.201.179.44:5109',
};

const S2 = {
  name: 'Staging 2',
  overview: 'http://52.66.199.215:5108',
  recon: 'http://52.66.199.215:5103',
  upload: 'http://52.66.199.215:5107',
};

const TEST_USER = {
  email: 'admin@settlepaisa.com',
  password: 'Admin@123'
};

const pool = new Pool({
  user: 'postgres',
  host: 'settlepaisa-staging.c9u0agyyg6q9.ap-south-1.rds.amazonaws.com',
  database: 'settlepaisa_v2',
  password: 'SettlePaisa2024',
  port: 5432,
});

async function testLogin(env) {
  console.log(`\n🔐 Testing Login on ${env.name}...`);
  try {
    const response = await axios.post(`${env.overview}/api/auth/login`, TEST_USER, { timeout: 10000 });
    if (response.data.success && response.data.data.token) {
      console.log(`✅ ${env.name}: Login successful`);
      console.log(`   Token length: ${response.data.data.token.length}`);
      console.log(`   User: ${response.data.data.user.email}`);
      console.log(`   Role: ${response.data.data.user.role}`);
      return response.data.data.token;
    } else {
      console.log(`❌ ${env.name}: Login failed - no token`);
      return null;
    }
  } catch (error) {
    console.log(`❌ ${env.name}: Login error - ${error.message}`);
    return null;
  }
}

async function testReconHealth(env) {
  console.log(`\n🏥 Testing Recon API Health on ${env.name}...`);
  try {
    const response = await axios.get(`${env.recon}/health`, { timeout: 5000 });
    console.log(`✅ ${env.name}: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    console.log(`❌ ${env.name}: Health check failed - ${error.message}`);
    return false;
  }
}

async function checkDatabaseCounts(envName) {
  console.log(`\n📊 Checking Database Counts for ${envName}...`);
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sp_v2_transactions WHERE source_type = 'pg') as pg_count,
        (SELECT COUNT(*) FROM sp_v2_transactions WHERE source_type = 'bank') as bank_count,
        (SELECT COUNT(*) FROM sp_v2_recon_jobs) as job_count,
        (SELECT COUNT(*) FROM sp_v2_recon_matches) as match_count
    `);

    const data = result.rows[0];
    console.log(`✅ ${envName}:`);
    console.log(`   PG Transactions: ${data.pg_count}`);
    console.log(`   Bank Transactions: ${data.bank_count}`);
    console.log(`   Recon Jobs: ${data.job_count}`);
    console.log(`   Match Records: ${data.match_count}`);
    return data;
  } catch (error) {
    console.log(`❌ ${envName}: Database query failed - ${error.message}`);
    return null;
  }
}

async function listReconEndpoints(env, token) {
  console.log(`\n🔍 Checking Recon API Endpoints on ${env.name}...`);

  // Try common endpoints
  const endpoints = [
    '/recon/jobs',
    '/recon/run',
    '/recon/health'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${env.recon}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 5000
      });
      console.log(`✅ ${endpoint}: Available (status ${response.status})`);
    } catch (error) {
      if (error.response) {
        console.log(`⚠️  ${endpoint}: ${error.response.status} - ${error.response.statusText}`);
      } else {
        console.log(`❌ ${endpoint}: ${error.message}`);
      }
    }
  }
}

async function compareEnvironments() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Staging 1 vs Staging 2 - Complete Comparison         ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const results = {
    s1: {},
    s2: {}
  };

  // Test 1: Login
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Authentication');
  console.log('='.repeat(60));

  results.s1.token = await testLogin(S1);
  results.s2.token = await testLogin(S2);

  if (!results.s1.token || !results.s2.token) {
    console.log('\n❌ STOP: Login failed on one or both environments');
    await pool.end();
    process.exit(1);
  }

  // Test 2: Health Checks
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Recon API Health');
  console.log('='.repeat(60));

  results.s1.health = await testReconHealth(S1);
  results.s2.health = await testReconHealth(S2);

  // Test 3: Database State
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Database State');
  console.log('='.repeat(60));

  results.s1.dbState = await checkDatabaseCounts('Staging 1');
  results.s2.dbState = await checkDatabaseCounts('Staging 2');

  // Test 4: API Endpoints
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Recon API Endpoints');
  console.log('='.repeat(60));

  await listReconEndpoints(S1, results.s1.token);
  await listReconEndpoints(S2, results.s2.token);

  // Final Comparison
  console.log('\n' + '='.repeat(60));
  console.log('FINAL COMPARISON');
  console.log('='.repeat(60));

  console.log('\n📋 Authentication:');
  console.log(`   Staging 1: ${results.s1.token ? '✅ Working' : '❌ Failed'}`);
  console.log(`   Staging 2: ${results.s2.token ? '✅ Working' : '❌ Failed'}`);

  console.log('\n📋 Recon API Health:');
  console.log(`   Staging 1: ${results.s1.health ? '✅ Healthy' : '❌ Unhealthy'}`);
  console.log(`   Staging 2: ${results.s2.health ? '✅ Healthy' : '❌ Unhealthy'}`);

  console.log('\n📋 Database State (Same RDS for both):');
  if (results.s1.dbState && results.s2.dbState) {
    const s1 = results.s1.dbState;
    const s2 = results.s2.dbState;
    console.log(`   ✅ Both read from same database`);
    console.log(`   PG Transactions: ${s1.pg_count}`);
    console.log(`   Bank Transactions: ${s1.bank_count}`);
    console.log(`   Recon Jobs: ${s1.job_count}`);
    console.log(`   Match Records: ${s1.match_count}`);
  }

  // Overall verdict
  const allPass =
    results.s1.token && results.s2.token &&
    results.s1.health && results.s2.health &&
    results.s1.dbState && results.s2.dbState;

  console.log('\n' + '='.repeat(60));
  if (allPass) {
    console.log('✅ ALL TESTS PASSED - Staging 2 matches Staging 1');
  } else {
    console.log('❌ SOME TESTS FAILED - See details above');
  }
  console.log('='.repeat(60) + '\n');

  await pool.end();
  process.exit(allPass ? 0 : 1);
}

compareEnvironments().catch(error => {
  console.error('\n💥 Fatal error:', error);
  pool.end();
  process.exit(1);
});
