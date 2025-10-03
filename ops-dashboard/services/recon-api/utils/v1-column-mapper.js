const V1_TO_V2_COLUMN_MAPPING = {
  pg_transactions: {
    'transaction_id': 'transaction_id',
    'client_code': 'merchant_id',
    'payee_amount': 'amount_paise',
    'paid_amount': 'amount_paise',
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
    'pg_pay_mode': 'payment_method'
  },
  bank_statements: {
    'utr': 'utr',
    'rrn': 'rrn',
    'paid_amount': 'amount_paise',
    'payee_amount': 'amount_paise',
    'trans_complete_date': 'transaction_date',
    'trans_date': 'transaction_date',
    'bank_name': 'bank_name',
    'transaction_status': 'status',
    'approval_code': 'approval_code'
  }
}

function detectFormat(headers) {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim())
  
  const v1Indicators = [
    'client_code',
    'payee_amount',
    'paid_amount',
    'trans_complete_date',
    'pg_name'
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

function mapV1ToV2(v1Row, type = 'pg_transactions') {
  const mapping = V1_TO_V2_COLUMN_MAPPING[type]
  if (!mapping) {
    throw new Error(`Unknown mapping type: ${type}`)
  }
  
  const v2Row = {}
  
  for (const [v1Col, v2Col] of Object.entries(mapping)) {
    if (v1Row.hasOwnProperty(v1Col) && v1Row[v1Col] !== undefined && v1Row[v1Col] !== '') {
      let value = v1Row[v1Col]
      
      if (v2Col === 'amount_paise' && typeof value === 'string') {
        const numValue = parseFloat(value.replace(/,/g, ''))
        if (!isNaN(numValue)) {
          value = Math.round(numValue * 100)
        }
      } else if (v2Col === 'amount_paise' && typeof value === 'number') {
        value = Math.round(value * 100)
      }
      
      // Handle fee columns (V2.10.0)
      if ((v2Col === 'bank_fee_paise' || v2Col === 'settlement_amount_paise') && typeof value === 'string') {
        const numValue = parseFloat(value.replace(/,/g, ''))
        if (!isNaN(numValue)) {
          value = Math.round(numValue * 100)
        }
      } else if ((v2Col === 'bank_fee_paise' || v2Col === 'settlement_amount_paise') && typeof value === 'number') {
        value = Math.round(value * 100)
      }
      
      if (v2Col === 'merchant_id') {
        value = String(value).trim().toUpperCase()
      }
      
      if (v2Col === 'transaction_timestamp' || v2Col === 'transaction_date') {
        if (typeof value === 'string' && value.trim()) {
          try {
            const parsedDate = new Date(value);
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
  
  if (type === 'pg_transactions') {
    if (!v2Row.transaction_id && v1Row.transaction_id) {
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
  }
  
  return v2Row
}

function convertV1CSVToV2(csvData, type = 'pg_transactions') {
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
  
  console.log(`[V1 Mapper] Converting V1 format to V2 for type: ${type}`)
  
  return csvData.map((row, idx) => {
    try {
      return mapV1ToV2(row, type)
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
  V1_TO_V2_COLUMN_MAPPING
}
