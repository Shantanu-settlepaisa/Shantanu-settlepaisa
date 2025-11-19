/**
 * Fee Sync Service
 *
 * Syncs merchant fee configurations from SabPaisa Admin Panel API
 * to SettlePaisa 2.0 database tables.
 *
 * Tables populated:
 * - sp_v2_merchant_master (merchant basic info)
 * - sp_v2_merchant_commission_config (fee configurations)
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

// Configuration
const CONFIG = {
  // COB Authentication API
  cobApi: {
    baseUrl: process.env.COB_API_URL || 'https://cobawsapi.sabpaisa.in',
    authKey: process.env.COB_AUTH_KEY || '2044c5ea-d46f-4e9e-8b7a-2aa73ce44e69',
    username: process.env.COB_USERNAME || 'Abh789@sp',
    password: process.env.COB_PASSWORD || 'Abhay@1234567'
  },

  // Admin API (Production)
  adminApi: {
    baseUrl: process.env.ADMIN_API_URL || 'https://adminapiv2.sabpaisa.in/admin-hackathon',
  },

  // Report API (Production)
  reportApi: {
    baseUrl: process.env.REPORT_API_URL || 'https://reportapiv2.sabpaisa.in/report-hackathon',
  },

  // Database (via SSH tunnel when running locally)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5433,  // SSH tunnel port
    database: process.env.DB_NAME || 'settlepaisa_v2',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'vsF41bPJH77W6DPKoyQ1Mv8U',
    ssl: { rejectUnauthorized: false }
  },

  // Sync options
  batchSize: 50, // Number of clients to process per batch
  delayBetweenBatches: 1000, // ms delay between batches to avoid rate limiting
};

// Database pool
const pool = new Pool(CONFIG.database);

// Token cache
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Login to COB API and get access token
 */
async function getCobAccessToken() {
  // Return cached token if still valid (with 30 second buffer)
  if (cachedToken && Date.now() < tokenExpiry - 30000) {
    return cachedToken;
  }

  console.log('Authenticating with COB API...');

  // Step 1: Login
  const loginResponse = await fetch(`${CONFIG.cobApi.baseUrl}/auth-service/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': CONFIG.cobApi.authKey,
      'Origin': 'http://localhost:3000',
      'Referer': 'http://localhost:3000/'
    },
    body: JSON.stringify({
      query: JSON.stringify({
        clientUserId: CONFIG.cobApi.username,
        userPassword: CONFIG.cobApi.password,
        is_social: false
      })
    })
  });

  const loginData = await loginResponse.json();

  if (!loginData.status || !loginData.verification_token) {
    throw new Error(`COB login failed: ${loginData.message || 'Unknown error'}`);
  }

  // Step 2: Verify and get access token
  const verifyResponse = await fetch(`${CONFIG.cobApi.baseUrl}/auth-service/auth/login-verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': CONFIG.cobApi.authKey,
      'Origin': 'http://localhost:3000',
      'Referer': 'http://localhost:3000/'
    },
    body: JSON.stringify({
      verification_token: loginData.verification_token,
      otp: ''
    })
  });

  const verifyData = await verifyResponse.json();

  if (!verifyData.accessToken) {
    throw new Error(`COB verification failed: ${verifyData.message || 'No access token'}`);
  }

  // Cache the token (tokens expire in ~5 minutes based on testing)
  cachedToken = verifyData.accessToken;
  tokenExpiry = Date.now() + 4 * 60 * 1000; // 4 minutes cache

  console.log('COB authentication successful');
  return cachedToken;
}

/**
 * Fetch data from Admin API
 */
async function fetchFromAdmin(endpoint) {
  // Get fresh COB token for each request batch
  const token = await getCobAccessToken();

  const url = `${CONFIG.adminApi.baseUrl}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get all clients from Admin API
 */
async function getAllClients() {
  console.log('Fetching all clients from Admin API...');
  const clients = await fetchFromAdmin('/api/common-data/0/0/');
  console.log(`Found ${clients.length} clients`);
  return clients;
}

/**
 * Get fee configuration for a specific client
 */
async function getClientFees(clientCode) {
  const fees = await fetchFromAdmin(`/api/rest/client_ep/Fee/${clientCode}/`);
  return fees;
}

/**
 * Map Admin API payment mode to standard payment mode names
 */
function normalizePaymentMode(paymodename) {
  const mapping = {
    'Debit Card': 'Debit Card',
    'Debit cards': 'Debit Card',
    'Credit Card': 'Credit Card',
    'Credit cards': 'Credit Card',
    'Net Banking': 'Net Banking',
    'UPI': 'UPI',
    'CASH': 'Cash',
    'NEFT': 'NEFT',
    'RTGS': 'RTGS',
    'IMPS': 'IMPS',
    'Wallet': 'Wallet'
  };

  return mapping[paymodename] || paymodename;
}

/**
 * Upsert merchant into sp_v2_merchant_master
 */
async function upsertMerchant(client, merchantData) {
  const query = `
    INSERT INTO sp_v2_merchant_master (
      merchant_id,
      merchant_name,
      is_active,
      synced_at,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, NOW(), NOW(), NOW())
    ON CONFLICT (merchant_id)
    DO UPDATE SET
      merchant_name = EXCLUDED.merchant_name,
      synced_at = NOW(),
      updated_at = NOW()
  `;

  await client.query(query, [
    merchantData.clientCode,
    merchantData.clientName,
    true
  ]);
}

/**
 * Upsert fee configuration into sp_v2_merchant_commission_config
 */
async function upsertFeeConfig(client, merchantId, feeData) {
  // Skip if no fee data (null values)
  if (feeData.endpointcharge === null || feeData.endpointcharge === undefined) {
    return false;
  }

  const query = `
    INSERT INTO sp_v2_merchant_commission_config (
      id,
      merchant_id,
      payment_mode,
      payment_mode_id,
      bank_code,
      bank_name,
      commission_value,
      commission_type,
      gst_percentage,
      slab_floor,
      slab_ceiling,
      is_active,
      synced_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW()
    )
    ON CONFLICT (merchant_id, payment_mode, bank_code, slab_floor)
    DO UPDATE SET
      commission_value = EXCLUDED.commission_value,
      commission_type = EXCLUDED.commission_type,
      gst_percentage = EXCLUDED.gst_percentage,
      slab_ceiling = EXCLUDED.slab_ceiling,
      bank_name = EXCLUDED.bank_name,
      synced_at = NOW(),
      updated_at = NOW()
  `;

  // Determine commission value and type
  // Admin API has both convcharges (convenience fee) and endpointcharge (processing fee)
  // We use endpointcharge as the primary commission
  const commissionValue = parseFloat(feeData.endpointcharge) || 0;
  const commissionType = feeData.endpointchargestypes || 'percentage';

  // GST is always percentage type in Admin API
  const gstPercentage = feeData.gsttype === 'percentage' ? 18 : 0; // Default 18% GST

  await client.query(query, [
    merchantId,
    normalizePaymentMode(feeData.paymodename),
    feeData.paymodeid?.toString() || '',
    feeData.endpointid?.toString() || '',
    feeData.epname || '',
    commissionValue,
    commissionType.toUpperCase(),
    gstPercentage,
    parseFloat(feeData.slabfloor) || 0,
    parseFloat(feeData.slabceiling) || 999999999,
    true  // is_active
  ]);

  return true;
}

/**
 * Sync fees for a single client
 */
async function syncClientFees(dbClient, merchant) {
  try {
    const fees = await getClientFees(merchant.clientCode);

    if (!fees || fees.length === 0) {
      return { success: true, feesCount: 0 };
    }

    // Upsert merchant first
    await upsertMerchant(dbClient, merchant);

    // Upsert each fee configuration
    let insertedCount = 0;
    for (const fee of fees) {
      const inserted = await upsertFeeConfig(dbClient, merchant.clientCode, fee);
      if (inserted) insertedCount++;
    }

    return { success: true, feesCount: insertedCount };
  } catch (error) {
    console.error(`Error syncing ${merchant.clientCode}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Main sync function
 */
async function syncAllFees(options = {}) {
  const {
    clientCodes = null, // Array of specific client codes to sync, or null for all
    dryRun = false,
    verbose = true
  } = options;

  const dbClient = await pool.connect();

  try {
    console.log('='.repeat(60));
    console.log('FEE SYNC SERVICE - Starting sync');
    console.log('='.repeat(60));
    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Database: ${CONFIG.database.host}`);
    console.log(`Admin API: ${CONFIG.adminApi.baseUrl}`);
    console.log('');

    // Get clients to sync
    let clients = await getAllClients();

    // Filter by specific client codes if provided
    if (clientCodes && clientCodes.length > 0) {
      clients = clients.filter(c => clientCodes.includes(c.clientCode));
      console.log(`Filtered to ${clients.length} specific clients`);
    }

    // Process in batches
    const results = {
      total: clients.length,
      processed: 0,
      success: 0,
      failed: 0,
      totalFees: 0,
      errors: []
    };

    for (let i = 0; i < clients.length; i += CONFIG.batchSize) {
      const batch = clients.slice(i, i + CONFIG.batchSize);
      const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
      const totalBatches = Math.ceil(clients.length / CONFIG.batchSize);

      if (verbose) {
        console.log(`\nProcessing batch ${batchNum}/${totalBatches} (${batch.length} clients)...`);
      }

      for (const merchant of batch) {
        if (dryRun) {
          // Dry run - just fetch and count
          const fees = await getClientFees(merchant.clientCode);
          const feesWithData = fees.filter(f => f.endpointcharge !== null);

          if (verbose && feesWithData.length > 0) {
            console.log(`  ${merchant.clientCode} (${merchant.clientName}): ${feesWithData.length} fees`);
          }

          results.success++;
          results.totalFees += feesWithData.length;
        } else {
          // Live sync
          const result = await syncClientFees(dbClient, merchant);

          if (result.success) {
            results.success++;
            results.totalFees += result.feesCount;

            if (verbose && result.feesCount > 0) {
              console.log(`  ${merchant.clientCode}: Synced ${result.feesCount} fees`);
            }
          } else {
            results.failed++;
            results.errors.push({ client: merchant.clientCode, error: result.error });
          }
        }

        results.processed++;
      }

      // Delay between batches
      if (i + CONFIG.batchSize < clients.length) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenBatches));
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SYNC COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total clients: ${results.total}`);
    console.log(`Processed: ${results.processed}`);
    console.log(`Success: ${results.success}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Total fee configs: ${results.totalFees}`);

    if (results.errors.length > 0) {
      console.log('\nErrors:');
      results.errors.forEach(e => console.log(`  - ${e.client}: ${e.error}`));
    }

    return results;

  } finally {
    dbClient.release();
  }
}

/**
 * Sync fees for a single client (for testing)
 */
async function syncSingleClient(clientCode) {
  const clients = await getAllClients();
  const merchant = clients.find(c => c.clientCode === clientCode);

  if (!merchant) {
    throw new Error(`Client ${clientCode} not found`);
  }

  const dbClient = await pool.connect();

  try {
    const result = await syncClientFees(dbClient, merchant);
    console.log(`Synced ${clientCode}: ${result.feesCount} fees`);
    return result;
  } finally {
    dbClient.release();
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Fee Sync Service - Sync merchant fees from Admin API

Usage:
  node sync-fees.js [options]

Options:
  --dry-run        Run without making database changes
  --client <code>  Sync only specific client(s) (comma-separated)
  --quiet          Less verbose output
  --help           Show this help

Examples:
  node sync-fees.js --dry-run
  node sync-fees.js --client NBSPLT
  node sync-fees.js --client NBSPLT,QCCLI --dry-run

Environment Variables:
  ADMIN_API_URL     Admin API base URL
  ADMIN_API_TOKEN   Admin API bearer token
  DB_HOST           Database host
  DB_PORT           Database port
  DB_NAME           Database name
  DB_USER           Database user
  DB_PASSWORD       Database password
`);
    process.exit(0);
  }

  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: !args.includes('--quiet'),
    clientCodes: null
  };

  // Parse --client argument
  const clientIdx = args.indexOf('--client');
  if (clientIdx !== -1 && args[clientIdx + 1]) {
    options.clientCodes = args[clientIdx + 1].split(',');
  }

  syncAllFees(options)
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    })
    .finally(() => {
      pool.end();
    });
}

module.exports = {
  syncAllFees,
  syncSingleClient,
  getAllClients,
  getClientFees
};
