/**
 * Bank File Normalization - Two-Stage Pipeline
 * 
 * Flow: Bank Raw → V1 Standard → V2 Standard
 * 
 * Stage 1: Apply bank-specific mappings to convert to V1 standard
 * Stage 2: Use v1-column-mapper.js to convert V1 → V2
 */

const { convertV1CSVToV2 } = require('./v1-column-mapper');

/**
 * Detect bank from filename pattern
 * 
 * Examples:
 *   HDFC_NEFT_20251002.csv → HDFC BANK
 *   axis_upi_settlements.xlsx → AXIS BANK
 *   SBI_Bank_Statement.csv → SBI BANK
 * 
 * @param {string} filename - Bank file name
 * @returns {string|null} - Bank config_name or null if not detected
 */
function detectBankFromFilename(filename) {
  const normalizedName = filename.toUpperCase();
  
  // Bank detection patterns
  const patterns = {
    'HDFC BANK': ['HDFC BANK', 'HDFC_BANK', 'HDFCBANK', 'HDFC'],
    'AXIS BANK': ['AXIS BANK', 'AXIS_BANK', 'AXISBANK', 'AXIS'],
    'SBI BANK': ['SBI BANK', 'SBI_BANK', 'SBIBANK', 'SBI'],
    'ICICI BANK': ['ICICI BANK', 'ICICI_BANK', 'ICICIBANK', 'ICICI'],
    'BOB': ['BOB', 'BANK OF BARODA', 'BANK_OF_BARODA'],
    'CANARA': ['CANARA', 'CANARA BANK', 'CANARA_BANK'],
    'YES BANK': ['YES BANK', 'YES_BANK', 'YESBANK', 'YES'],
    'IDBI': ['IDBI', 'IDBI BANK', 'IDBI_BANK'],
    'INDIAN BANK': ['INDIAN BANK', 'INDIAN_BANK', 'INDIANBANK'],
    'FEDERL': ['FEDERAL', 'FEDERAL BANK', 'FEDERAL_BANK'],
    'BOI': ['BOI', 'BANK OF INDIA', 'BANK_OF_INDIA'],
    'CENTRAL': ['CENTRAL', 'CENTRAL BANK', 'CENTRAL_BANK'],
    'MAHARASTRA': ['MAHARASTRA', 'BANK OF MAHARASHTRA', 'MAHARASHTRA'],
    'HDFC UPI': ['HDFC_UPI', 'HDFCUPI'],
    'HDFC NB': ['HDFC_NB', 'HDFC_NETBANKING'],
    'SBI NB': ['SBI_NB', 'SBI_NETBANKING'],
    'AIRTEL UPI': ['AIRTEL', 'AIRTEL_UPI', 'AIRTELUPI'],
    'INDIAN UPI': ['INDIAN_UPI', 'INDIANUPI'],
    'ATOM': ['ATOM'],
    'AMAZON': ['AMAZON'],
    'MOBIKWIK': ['MOBIKWIK'],
    'INGENICO': ['INGENICO']
  };
  
  // Try to match patterns
  for (const [bankName, bankPatterns] of Object.entries(patterns)) {
    for (const pattern of bankPatterns) {
      if (normalizedName.includes(pattern)) {
        console.log(`[Bank Detection] Matched "${filename}" → "${bankName}"`);
        return bankName;
      }
    }
  }
  
  console.warn(`[Bank Detection] Could not detect bank from filename: ${filename}`);
  return null;
}

/**
 * Apply bank-specific column mappings to convert raw bank data to V1 standard
 * 
 * V1 Standard Schema:
 *   - transaction_id: Unique transaction reference
 *   - paid_amount: Gross amount (decimal, in rupees)
 *   - payee_amount: Net amount (decimal, in rupees)
 *   - transaction_date_time: Transaction date/time
 *   - payment_date_time: Settlement/Payment date
 * 
 * @param {Array} rawBankData - Raw bank CSV data (array of objects)
 * @param {Object} v1Mappings - V1 column mappings from db (e.g., {"transaction_id": "MERCHANT_TRACKID"})
 * @returns {Array} - V1 standardized data
 */
function applyBankToV1Mapping(rawBankData, v1Mappings) {
  if (!Array.isArray(rawBankData) || rawBankData.length === 0) {
    console.warn('[Bank→V1] No bank data to map');
    return [];
  }
  
  if (!v1Mappings || typeof v1Mappings !== 'object') {
    throw new Error('[Bank→V1] Invalid v1_column_mappings');
  }
  
  console.log(`[Bank→V1] Mapping ${rawBankData.length} records using V1 mappings`);
  console.log('[Bank→V1] V1 Mappings:', v1Mappings);
  
  return rawBankData.map((rawRow, idx) => {
    const v1Row = {};
    
    // Apply each mapping
    for (const [v1StandardCol, bankRawCol] of Object.entries(v1Mappings)) {
      // Find the value in raw data (case-insensitive match)
      let value = null;
      
      // Try exact match first
      if (rawRow.hasOwnProperty(bankRawCol)) {
        value = rawRow[bankRawCol];
      } else {
        // Try case-insensitive match
        const matchingKey = Object.keys(rawRow).find(
          key => key.toLowerCase() === bankRawCol.toLowerCase()
        );
        if (matchingKey) {
          value = rawRow[matchingKey];
        }
      }
      
      // Only set if value exists and is not empty
      if (value !== null && value !== undefined && value !== '') {
        v1Row[v1StandardCol] = value;
      }
    }
    
    // Validate critical fields
    if (!v1Row.transaction_id) {
      console.warn(`[Bank→V1] Row ${idx}: Missing transaction_id, raw data:`, rawRow);
    }
    
    return v1Row;
  });
}

/**
 * Two-stage normalization: Bank Raw → V1 Standard → V2 Standard
 * 
 * @param {Array} rawBankData - Raw bank CSV data
 * @param {Object} bankMapping - Bank mapping config from sp_v2_bank_column_mappings table
 * @returns {Array} - V2 standardized data (ready for sp_v2_bank_statements)
 */
function normalizeBankData(rawBankData, bankMapping) {
  console.log('[Bank Normalization] Starting two-stage normalization');
  console.log(`[Bank Normalization] Bank: ${bankMapping.bank_name}, File Type: ${bankMapping.file_type}`);
  
  // Stage 1: Bank Raw → V1 Standard
  const v1StandardData = applyBankToV1Mapping(
    rawBankData,
    bankMapping.v1_column_mappings
  );
  
  console.log(`[Bank Normalization] Stage 1 complete: ${v1StandardData.length} V1 records`);
  
  // Stage 2: V1 Standard → V2 Standard
  const v2StandardData = convertV1CSVToV2(v1StandardData, 'bank_statements');
  
  console.log(`[Bank Normalization] Stage 2 complete: ${v2StandardData.length} V2 records`);
  
  // Add bank metadata
  const enrichedData = v2StandardData.map(record => ({
    ...record,
    bank_name: bankMapping.bank_name,
    source_type: 'manual_upload',
    source_name: bankMapping.bank_name
  }));
  
  return enrichedData;
}

/**
 * Validate V2 bank statement record
 * 
 * Required fields:
 *   - utr OR rrn (at least one identifier)
 *   - amount_paise
 *   - transaction_date
 *   - bank_name
 * 
 * @param {Object} record - V2 bank statement record
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateV2BankRecord(record) {
  const errors = [];
  
  // Check identifiers
  if (!record.utr && !record.rrn) {
    errors.push('Missing both utr and rrn - at least one identifier required');
  }
  
  // Check amount
  if (record.amount_paise === undefined || record.amount_paise === null) {
    errors.push('Missing amount_paise');
  } else if (typeof record.amount_paise !== 'number') {
    errors.push('amount_paise must be a number');
  }
  
  // Check date
  if (!record.transaction_date) {
    errors.push('Missing transaction_date');
  }
  
  // Check bank name
  if (!record.bank_name) {
    errors.push('Missing bank_name');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  detectBankFromFilename,
  applyBankToV1Mapping,
  normalizeBankData,
  validateV2BankRecord
};
