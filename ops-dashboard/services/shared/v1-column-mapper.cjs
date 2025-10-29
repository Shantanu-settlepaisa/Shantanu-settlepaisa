// ============================================================================
// UNIFIED V1→V2 MAPPING WITH DUAL MODE SUPPORT
// ============================================================================
//
// This is the single source of truth for V1→V2 data transformation.
// Supports TWO modes:
//   - 'api' mode: For file uploads (transaction_id → bank_ref)
//   - 'recon' mode: For reconciliation (transaction_id → utr)
//
// Previously duplicated in:
//   - services/api/v1-column-mapper.js (api mode)
//   - services/recon-api/utils/v1-column-mapper.js (recon mode)
// ============================================================================

const { Pool } = require('pg');
const { initEnv } = require('./env-loader.cjs');

// Load config using shared env-loader (validates configuration)
const config = initEnv('overview-api', {
  skipValidation: false,
  fallbackToShared: true
});

// DB Configuration - uses validated config from env-loader
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 10, // maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

console.log('[V1 Mapper] Database connection:', {
  host: config.db.host,
  database: config.db.database,
  user: config.db.user
});

// In-memory cache for bank mappings (avoid repeated DB queries)
const bankMappingCache = {};

/**
 * Fetch bank-specific V1 column mappings from database
 * @param {string} bankName - Bank name (e.g., "HDFC BANK", "AXIS BANK")
 * @returns {Promise<Object|null>} Bank config with v1_column_mappings
 */
async function fetchBankMappingFromDB(bankName) {
  if (!bankName) return null;

  // Check cache first
  const cacheKey = bankName.toUpperCase().trim();
  if (bankMappingCache[cacheKey]) {
    console.log(`[V1 Mapper] Using cached config for: ${bankName}`);
    return bankMappingCache[cacheKey];
  }

  try {
    const result = await pool.query(
      `SELECT config_name, bank_name, v1_column_mappings, special_fields
       FROM sp_v2_bank_column_mappings
       WHERE UPPER(bank_name) = UPPER($1) AND is_active = true
       LIMIT 1`,
      [bankName]
    );

    if (result.rows.length === 0) {
      console.warn(`[V1 Mapper] No bank mapping found for: ${bankName}`);
      return null;
    }

    const config = result.rows[0];
    console.log(`[V1 Mapper] Fetched DB config for ${bankName}:`, config.v1_column_mappings);

    // Cache the result
    bankMappingCache[cacheKey] = config;

    return config;

  } catch (error) {
    console.error(`[V1 Mapper] DB query error for ${bankName}:`, error.message);
    return null;
  }
}

/**
 * Build V2 column mapping from database bank config
 * @param {Object} bankConfig - Bank config from database
 * @param {string} mode - Mapping mode ('api' or 'recon')
 * @returns {Object} V1→V2 column mapping
 */
function buildV2MappingFromDBConfig(bankConfig, mode = 'api') {
  if (!bankConfig || !bankConfig.v1_column_mappings) {
    return null;
  }

  const v1Mappings = bankConfig.v1_column_mappings;
  const v2Mapping = {};

  // Map recon config fields to V2 schema
  // Recon config uses: paid_amount, payee_amount, transaction_id, utr, payment_date_time, transaction_date_time

  // Amount mappings
  if (v1Mappings.paid_amount) {
    const normalizedKey = v1Mappings.paid_amount.toLowerCase().replace(/\s+/g, '_');
    v2Mapping[normalizedKey] = 'gross_amount_paise';  // paid_amount = gross amount
  }

  if (v1Mappings.payee_amount) {
    const normalizedKey = v1Mappings.payee_amount.toLowerCase().replace(/\s+/g, '_');
    v2Mapping[normalizedKey] = 'amount_paise';  // payee_amount = net amount
  } else if (v1Mappings.paid_amount) {
    // CRITICAL: If payee_amount missing but paid_amount exists, use paid for BOTH gross and net
    // This handles banks like HDFC that only provide gross amount (gross = net when no fees)
    const normalizedKey = v1Mappings.paid_amount.toLowerCase().replace(/\s+/g, '_');
    v2Mapping[normalizedKey] = 'amount_paise';  // Fallback: use gross as net
    console.log(`[V1 Mapper] Bank ${bankConfig.bank_name}: No payee_amount, using paid_amount for both gross and net`);
  }

  // Identifier mappings
  if (v1Mappings.utr) {
    const normalizedKey = v1Mappings.utr.toLowerCase().replace(/\s+/g, '_');
    v2Mapping[normalizedKey] = 'utr';
  }

  // CRITICAL: Mode-specific transaction_id mapping
  if (v1Mappings.transaction_id) {
    const normalizedKey = v1Mappings.transaction_id.toLowerCase().replace(/\s+/g, '_');
    if (mode === 'recon') {
      v2Mapping[normalizedKey] = 'utr';  // Recon mode: map to utr for reconciliation
    } else {
      v2Mapping[normalizedKey] = 'bank_ref';  // API mode: map to bank_ref for uploads
    }
  }

  // Date mappings
  if (v1Mappings.payment_date_time) {
    const normalizedKey = v1Mappings.payment_date_time.toLowerCase().replace(/\s+/g, '_');
    v2Mapping[normalizedKey] = 'credited_at';
  }

  if (v1Mappings.transaction_date_time) {
    const normalizedKey = v1Mappings.transaction_date_time.toLowerCase().replace(/\s+/g, '_');
    v2Mapping[normalizedKey] = 'transaction_date';
  }

  console.log(`[V1 Mapper] Built V2 mapping for ${bankConfig.bank_name} (mode: ${mode}):`, v2Mapping);

  return v2Mapping;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseCardNetwork(paymentMode) {
  if (!paymentMode) return null;

  const mode = String(paymentMode).toLowerCase();

  if (mode.includes('rupay')) return 'RUPAY';
  if (mode.includes('visa')) return 'VISA';
  if (mode.includes('master')) return 'MASTERCARD';
  if (mode.includes('amex')) return 'AMEX';
  if (mode.includes('diners')) return 'DINERS';
  if (mode.includes('upi') || mode.includes('bhim')) return 'UPI';

  return null;
}

function parsePaymentMethod(paymentMode) {
  if (!paymentMode) return null;

  const mode = String(paymentMode).toLowerCase();

  if (mode.includes('upi') || mode.includes('bhim')) return 'UPI';
  if (mode.includes('banking') || mode.includes('netbanking') || mode.includes('net banking')) return 'NETBANKING';
  if (mode.includes('card')) return 'CARD';
  if (mode.includes('wallet')) return 'WALLET';

  return String(paymentMode).toUpperCase();
}

function normalizeAcquirerCode(pgPayMode) {
  if (!pgPayMode) return null;

  const mode = String(pgPayMode).toUpperCase();

  if (mode.includes('HDFC')) return 'HDFC';
  if (mode.includes('ICICI')) return 'ICICI';
  if (mode.includes('AXIS')) return 'AXIS';
  if (mode.includes('SBI') || mode.includes('STATE BANK')) return 'SBI';
  if (mode === 'BOB' || mode.includes('BARODA')) return 'BOB';
  if (mode.includes('KOTAK')) return 'KOTAK';
  if (mode.includes('INDUSIND')) return 'INDUSIND';
  if (mode.includes('YES BANK') || mode.includes('YES_BANK')) return 'YES_BANK';
  if (mode.includes('PUNJAB') || mode.includes('PNB')) return 'PNB';
  if (mode.includes('AIRTEL')) return 'AIRTEL';
  if (mode.includes('PHONEPE')) return 'PHONEPE';
  if (mode.includes('PAYTM')) return 'PAYTM';
  if (mode.includes('GOOGLE PAY') || mode.includes('GPAY')) return 'GOOGLEPAY';
  if (mode.includes('IDFC')) return 'IDFC';
  if (mode.includes('FEDERAL')) return 'FEDERAL';
  if (mode.includes('RBL')) return 'RBL';
  if (mode.includes('CANARA')) return 'CANARA';

  return pgPayMode;
}

function generateGatewayRef(pgName, transactionId) {
  if (!pgName || !transactionId) return null;
  return `${pgName}-${transactionId}`;
}

/**
 * Get hardcoded column mappings based on mode
 * @param {string} mode - Mapping mode ('api' or 'recon')
 * @returns {Object} Column mappings for both types
 */
function getV1ToV2Mapping(mode = 'api') {
  // Base mapping for PG transactions (same for both modes)
  const pgMapping = {
    'transaction_id': 'transaction_id',
    'client_code': 'merchant_id',

    // 🆕 EXPLICIT AMOUNT FIELDS (NO OVERLAP) - Fixes V1-to-V2 ambiguity
    // Gross amount fields (customer paid amount before PG charges)
    'paid_amount': 'gross_amount_paise',       // Customer paid amount (gross)

    // Net amount fields (amount credited to merchant after PG charges)
    'payee_amount': 'amount_paise',            // Merchant received amount (net)
    'amount': 'amount_paise',                  // Default amount field

    'bank_exclude_amount': 'bank_fee_paise',
    'settlement_amount': 'settlement_amount_paise',
    'settled_amount_by_bank': 'settlement_amount_paise',
    'payment_mode': 'payment_method',
    'trans_complete_date': 'transaction_timestamp',
    'trans_date': 'transaction_date',
    'bank_name': 'bank_name',
    'utr': 'utr',
    'rrn': 'rrn',
    'approval_code': 'approval_code',
    'transaction_status': 'status',
    'pg_name': 'source_name',
    'pg_pay_mode': 'acquirer_code',
    'client_name': 'merchant_name'
  };

  // Bank statements mapping - DIFFERS based on mode
  const bankMapping = {
    // Identifiers
    'utr': 'utr',
    'rrn': 'rrn',
    // CRITICAL DIFFERENCE: transaction_id mapping depends on mode
    'transaction_id': mode === 'recon' ? 'utr' : 'bank_ref',
    'approval_code': 'approval_code',

    // 🆕 EXPLICIT AMOUNT FIELDS (NO OVERLAP) - Fixes V1-to-V2 ambiguity
    // Gross amount fields (customer paid amount before bank charges)
    'gross_amount': 'gross_amount_paise',      // V1 standard: gross amount
    'paid_amount': 'gross_amount_paise',       // Alias for gross (HDFC: "DOMESTIC AMT", SBI: "GROSS_AMT")

    // Net amount fields (amount credited to merchant after bank charges)
    'net_amount': 'amount_paise',              // V1 standard: net amount
    'payee_amount': 'amount_paise',            // Alias for net (HDFC: "Net Amount", SBI: "NET_AMT")
    'credit_amount': 'amount_paise',           // Alias for net
    'credit': 'amount_paise',                  // Axis Bank: "Credit" column
    'deposit_amount': 'amount_paise',          // ICICI Bank: "Deposit Amount" column
    'debit': 'amount_paise',                   // For debit entries (withdrawal/refunds)
    'withdrawal_amount': 'amount_paise',       // ICICI Bank: "Withdrawal Amount" column

    // Default amount field (maps to net if ambiguous)
    'amount': 'amount_paise',

    // ============ BANK-SPECIFIC COLUMNS (ALL 21 BANKS FROM RECON CONFIG) ============

    // AIRTEL UPI
    'orig_amnt': 'gross_amount_paise',
    'net_credit_amnt': 'amount_paise',
    'till_id': 'bank_ref',

    // AMAZON
    'transactionamount': 'gross_amount_paise',
    'nettransactionamount': 'amount_paise',
    'sellerorderid': 'bank_ref',
    'transactionposteddate': 'transaction_date',

    // ATOM
    'gross_txn_amount': 'gross_amount_paise',
    'net_amount_to_be_paid': 'amount_paise',
    'merchant_txn_id': 'bank_ref',

    // AXIS BANK
    'prnno': 'utr',  // FIXED: PRNNo is the UTR for AXIS Bank

    // BOB
    'settlement_amount': 'gross_amount_paise',
    'merchant_track_id': 'utr',  // FIXED: Merchant Track ID is the UTR for BOB
    'onus_indicator': null,  // special field - ignore

    // BOI, CENTRAL, FEDERAL, HDFC NB, IDBI, INDIAN BANK, MAHARASTRA, SBI NB (same pattern)
    'gross_amount': 'gross_amount_paise',
    'txn_id': 'bank_ref',

    // CANARA BANK
    'txnamount': 'amount_paise',
    'pgirefno': 'bank_ref',

    // HDFC BANK
    'merchant_trackid': 'utr',
    'domestic_amt': 'gross_amount_paise',
    'settle_date': 'transaction_date',

    // HDFC UPI
    'transaction_amount': 'gross_amount_paise',
    'order_id': 'bank_ref',
    'transaction_req_date': 'transaction_date',

    // INDIAN UPI
    'ref_id': 'bank_ref',
    'datetimeoftransaction': 'transaction_date',

    // INGENICO
    'total_amount': 'gross_amount_paise',
    'sm_transaction_id': 'bank_ref',

    // MOBIKWIK
    'txn_amount': 'gross_amount_paise',
    'amount_paid': 'amount_paise',

    // SBI BANK
    'gross_amt': 'gross_amount_paise',
    'net_amt': 'amount_paise',
    'merchant_txnno': 'bank_ref',
    'tran_date': 'transaction_date',

    // YES BANK
    'merchant_ref._no': 'bank_ref',

    // 🆕 EXPLICIT FEE FIELDS
    'bank_fee': 'bank_fee_paise',              // Bank charges (excl GST)
    'bank_charges': 'bank_fee_paise',          // Alias
    'bank_mis_charges': 'bank_fee_paise',      // V1 format

    'bank_gst': 'bank_gst_paise',              // GST on bank charges
    'bank_mis_gst': 'bank_gst_paise',          // V1 format

    // Dates
    'trans_complete_date': 'transaction_date',
    'trans_date': 'transaction_date',
    'date': 'transaction_date',
    'transaction_date': 'transaction_date',
    'payment_date': 'transaction_date',

    // Other fields
    'bank_name': 'bank_name',
    'payment_bank': 'bank_name',
    'transaction_status': 'status',
    'remarks': 'remarks',
    'narration': 'remarks'
  };

  return {
    pg_transactions: pgMapping,
    bank_statements: bankMapping
  };
}

function detectFormat(headers) {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim())

  const v1Indicators = [
    // PG transaction V1 indicators
    'client_code',
    'payee_amount',
    'paid_amount',
    'trans_complete_date',
    'pg_name',

    // Bank statement V1 indicators (from all 21 banks)
    'merchant_trackid',      // HDFC
    'domestic_amt',          // HDFC
    'domestic amt',          // HDFC (with space)
    'settle_date',           // HDFC
    'settle date',           // HDFC (with space)
    'prnno',                 // AXIS
    'settlement_amount',     // BOB
    'settlement amount',     // BOB (with space)
    'merchant_track_id',     // BOB
    'merchant track id',     // BOB (with space)
    'gross_amt',             // SBI
    'net_amt',               // SBI
    'merchant_txnno',        // SBI
    'transaction_amount',    // YES BANK, HDFC UPI
    'transaction amount',    // YES BANK (with space)
    'orig_amnt',             // AIRTEL UPI
    'net_credit_amnt',       // AIRTEL UPI
    'gross_txn_amount',      // ATOM
    'gross txn amount',      // ATOM (with space)
    'txnamount',             // CANARA
    'pgirefno'               // CANARA
  ]

  const v2Indicators = [
    'pg_txn_id',
    'merchant_id',
    'amount_paise',
    'payment_method'
  ]

  const v1Score = v1Indicators.filter(indicator =>
    lowerHeaders.some(h => h.includes(indicator.toLowerCase()))
  ).length

  const v2Score = v2Indicators.filter(indicator =>
    lowerHeaders.some(h => h.includes(indicator.toLowerCase()))
  ).length

  if (v1Score > v2Score) {
    return 'v1'
  } else if (v2Score > v1Score) {
    return 'v2'
  }

  return 'unknown'
}

function mapV1ToV2(v1Row, type = 'pg_transactions', dbMapping = null, mode = 'api') {
  // Use DB mapping if provided, otherwise fall back to hardcoded mapping
  let mapping;
  if (dbMapping) {
    console.log('[V1 Mapper] Using DB-driven mapping');
    mapping = dbMapping;
  } else {
    console.log(`[V1 Mapper] Using hardcoded mapping (fallback, mode: ${mode})`);
    const V1_TO_V2_COLUMN_MAPPING = getV1ToV2Mapping(mode);
    mapping = V1_TO_V2_COLUMN_MAPPING[type];
    if (!mapping) {
      throw new Error(`Unknown mapping type: ${type}`);
    }
  }

  // 🔧 FIX 1: Normalize input row keys to lowercase and replace spaces with underscores
  const normalizedRow = {};
  for (const [key, value] of Object.entries(v1Row)) {
    const normalizedKey = key.toLowerCase().replace(/\s+/g, '_');
    normalizedRow[normalizedKey] = value;
  }

  const v2Row = {}

  let mappedCount = 0;
  for (const [v1Col, v2Col] of Object.entries(mapping)) {
    const hasProperty = normalizedRow.hasOwnProperty(v1Col);
    const notUndefined = normalizedRow[v1Col] !== undefined;
    const notEmpty = normalizedRow[v1Col] !== '';

    if (hasProperty && notUndefined && notEmpty) {
      mappedCount++;
      let value = normalizedRow[v1Col]

      // 🔧 FIX 2: V1 data is ALWAYS in rupees, so always multiply by 100
      if ((v2Col === 'amount_paise' || v2Col === 'gross_amount_paise') && typeof value === 'string') {
        const numValue = parseFloat(value.replace(/,/g, ''))
        if (!isNaN(numValue)) {
          value = Math.round(numValue * 100)
        }
      } else if ((v2Col === 'amount_paise' || v2Col === 'gross_amount_paise') && typeof value === 'number') {
        value = Math.round(value * 100)
      }

      // Handle fee columns (V2.10.0)
      if ((v2Col === 'bank_fee_paise' || v2Col === 'settlement_amount_paise' || v2Col === 'bank_gst_paise') && typeof value === 'string') {
        const numValue = parseFloat(value.replace(/,/g, ''))
        if (!isNaN(numValue)) {
          value = Math.round(numValue * 100)
        }
      } else if ((v2Col === 'bank_fee_paise' || v2Col === 'settlement_amount_paise' || v2Col === 'bank_gst_paise') && typeof value === 'number') {
        value = Math.round(value * 100)
      }

      if (v2Col === 'merchant_id') {
        value = String(value).trim().toUpperCase()
      }

      // Parse dates for ALL date/timestamp columns (transaction_date, credited_at, etc.)
      if (v2Col === 'transaction_timestamp' || v2Col === 'transaction_date' || v2Col === 'credited_at' || v2Col === 'settlement_date') {
        if (typeof value === 'string' && value.trim()) {
          try {
            let parsedDate;

            // Handle DD-MM-YYYY format (common in Indian bank statements)
            if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(value.trim())) {
              const [day, month, year] = value.trim().split('-');
              // Create date in YYYY-MM-DD format for reliable parsing
              parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
            }
            // Handle DD/MM/YYYY format
            else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value.trim())) {
              const [day, month, year] = value.trim().split('/');
              parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
            }
            // Handle YYYY-MM-DD or other ISO formats
            else {
              parsedDate = new Date(value);
            }

            if (!isNaN(parsedDate.getTime())) {
              value = parsedDate.toISOString();
            } else {
              console.warn(`[V1 Mapper] Invalid date value: "${value}", skipping conversion`);
              value = null; // Set to null instead of invalid ISO string
            }
          } catch (error) {
            console.error(`[V1 Mapper] Error parsing date: "${value}"`, error.message);
            value = null;
          }
        } else {
          value = null; // Empty or missing date
        }
      }

      v2Row[v2Col] = value
    }
  }

  if (mappedCount === 0) {
    console.warn('[V1 Mapper] No fields mapped! Input keys:', Object.keys(v1Row), 'Expected mappings:', Object.keys(mapping));
  } else if (mappedCount < 3 && type === 'bank_statements') {
    console.warn('[V1 Mapper] Only', mappedCount, 'fields mapped for bank statement. v2Row:', JSON.stringify(v2Row), 'from v1Row:', JSON.stringify(v1Row));
  }

  // 🔧 FIX 3: Handle debit/credit columns - prefer credit (deposit) over debit (withdrawal) for amount
  if (type === 'bank_statements' && (v2Row.amount_paise === 0 || v2Row.amount_paise === undefined)) {
    // Try credit column first (most bank statements use this for deposits)
    if (normalizedRow.credit) {
      const creditValue = parseFloat(String(normalizedRow.credit).replace(/,/g, ''));
      if (!isNaN(creditValue) && creditValue > 0) {
        v2Row.amount_paise = Math.round(creditValue * 100);
      }
    }
    // Try deposit_amount for ICICI-style statements
    if (!v2Row.amount_paise && normalizedRow.deposit_amount) {
      const depositValue = parseFloat(String(normalizedRow.deposit_amount).replace(/,/g, ''));
      if (!isNaN(depositValue) && depositValue > 0) {
        v2Row.amount_paise = Math.round(depositValue * 100);
      }
    }
  }

  // CRITICAL FALLBACK: If amount_paise (net) is missing but gross_amount_paise exists,
  // use gross as net (for banks like HDFC that only provide gross amount)
  if (type === 'bank_statements' && (!v2Row.amount_paise || v2Row.amount_paise === 0) && v2Row.gross_amount_paise) {
    v2Row.amount_paise = v2Row.gross_amount_paise;
    console.log('[V1 Mapper] Using gross_amount_paise as amount_paise (net) for bank with no separate net amount');
  }

  // Bank statement specific defaults
  if (type === 'bank_statements') {
    // Set bank_name from mapping if not already set
    if (!v2Row.bank_name) {
      // dbMapping is passed with sourceType in convertV1CSVToV2
      // We'll receive bankName parameter in convertV1CSVToV2 which we need to pass here
      v2Row.bank_name = 'UNKNOWN'; // Will be overridden in convertV1CSVToV2
    }

    if (!v2Row.source_type) {
      v2Row.source_type = 'MANUAL_UPLOAD';
    }
  }

  if (type === 'pg_transactions') {
    console.log('[V1 Mapper DEBUG] After mapping loop:', {
      'v2Row.transaction_id': v2Row.transaction_id,
      'v1Row.transaction_id': v1Row.transaction_id,
      'v1Row keys': Object.keys(v1Row).join(', '),
      'mappedCount': mappedCount
    });

    if (!v2Row.transaction_id && v1Row.transaction_id) {
      console.log('[V1 Mapper] Adding transaction_id fallback:', v1Row.transaction_id);
      v2Row.transaction_id = v1Row.transaction_id
    }

    if (!v2Row.merchant_id && v1Row.client_code) {
      v2Row.merchant_id = String(v1Row.client_code).trim().toUpperCase()
    }

    if (!v2Row.source_type) {
      v2Row.source_type = 'manual_upload'
    }

    if (!v2Row.currency) {
      v2Row.currency = 'INR'
    }

    // Enhanced: Parse payment_method correctly (not just copy payment_mode)
    if (v1Row.payment_mode) {
      v2Row.payment_method = parsePaymentMethod(v1Row.payment_mode)
    }

    // Enhanced: Extract card_network from payment_mode
    if (v1Row.payment_mode) {
      const cardNetwork = parseCardNetwork(v1Row.payment_mode)
      if (cardNetwork) {
        v2Row.card_network = cardNetwork
      }
    }

    // Enhanced: Normalize acquirer_code from pg_pay_mode
    if (v1Row.pg_pay_mode) {
      v2Row.acquirer_code = normalizeAcquirerCode(v1Row.pg_pay_mode)
    }

    // Enhanced: Generate gateway_ref
    if (v1Row.pg_name && v1Row.transaction_id) {
      v2Row.gateway_ref = generateGatewayRef(v1Row.pg_name, v1Row.transaction_id)
    }

    // Enhanced: Add merchant_name from client_name
    if (v1Row.client_name) {
      v2Row.merchant_name = v1Row.client_name
    }
  }

  return v2Row
}

async function convertV1CSVToV2(csvData, type = 'pg_transactions', bankName = null, mode = 'api') {
  if (!Array.isArray(csvData) || csvData.length === 0) {
    throw new Error('CSV data must be a non-empty array')
  }

  const format = detectFormat(Object.keys(csvData[0]))

  if (format === 'v2') {
    console.log('[V1 Mapper] Detected V2 format, no conversion needed')
    return csvData
  }

  if (format === 'unknown') {
    console.warn('[V1 Mapper] Unknown format detected, attempting V1 conversion anyway')
  }

  console.log(`[V1 Mapper] Converting V1 format to V2 for type: ${type}, bank: ${bankName || 'N/A'}, mode: ${mode}`)

  // Fetch DB mapping for bank statements
  let dbMapping = null;
  if (type === 'bank_statements' && bankName) {
    console.log(`[V1 Mapper] Fetching DB config for bank: ${bankName}`);
    const bankConfig = await fetchBankMappingFromDB(bankName);
    if (bankConfig) {
      dbMapping = buildV2MappingFromDBConfig(bankConfig, mode);
    } else {
      console.warn(`[V1 Mapper] No DB config found for ${bankName}, using hardcoded fallback`);
    }
  }

  return csvData.map((row, idx) => {
    try {
      const v2Row = mapV1ToV2(row, type, dbMapping, mode);

      // Set bank_name for bank statements (from sourceType parameter)
      if (type === 'bank_statements' && bankName) {
        v2Row.bank_name = bankName;
        if (idx === 0) {
          console.log(`[V1 Mapper] Setting bank_name="${bankName}" for bank statements`);
        }
      }

      if (idx === 0) {
        console.log('[V1 Mapper] Row 0 conversion:', 'Input keys:', Object.keys(row), 'Output keys:', Object.keys(v2Row), 'Output:', JSON.stringify(v2Row));
      }
      return v2Row;
    } catch (error) {
      console.error(`[V1 Mapper] Error converting row ${idx}:`, error.message)
      throw error
    }
  })
}

module.exports = {
  detectFormat,
  mapV1ToV2,
  convertV1CSVToV2,
  fetchBankMappingFromDB,
  buildV2MappingFromDBConfig,
  getV1ToV2Mapping
}
