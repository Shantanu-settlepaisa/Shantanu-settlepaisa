const fetch = require('node-fetch');
const { parseCsvContent, parseJsonContent, parseXmlContent, transformBankDataToV2 } = require('./bank-data-transformer');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

async function testApiConnection(config) {
  try {
    const url = `${config.baseUrl}${config.endpoint || ''}`;
    
    const headers = {
      'Accept': 'application/json'
    };
    
    if (config.authType === 'bearer' && config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    } else if (config.authType === 'apiKey' && config.apiKey) {
      headers['X-API-Key'] = config.apiKey;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
      timeout: 10000
    });
    
    if (!response.ok) {
      return {
        success: false,
        message: `API connection failed: ${response.status} ${response.statusText}`,
        statusCode: response.status
      };
    }
    
    return {
      success: true,
      message: 'API connection successful',
      statusCode: response.status
    };
    
  } catch (error) {
    return {
      success: false,
      message: `API connection failed: ${error.message}`,
      error: error.message
    };
  }
}

async function fetchFromBankApi(config, cycleDate, sourceEntity) {
  const client = await pool.connect();
  
  try {
    let url = `${config.baseUrl}${config.endpoint || ''}`;
    
    url = url.replace('{date}', cycleDate)
             .replace('{cycleDate}', cycleDate)
             .replace('{YYYYMMDD}', cycleDate.replace(/-/g, ''));
    
    const headers = {
      'Accept': config.responseFormat === 'json' ? 'application/json' : 
                config.responseFormat === 'xml' ? 'application/xml' : 
                'text/csv'
    };
    
    if (config.authType === 'bearer' && config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    } else if (config.authType === 'apiKey' && config.apiKey) {
      headers['X-API-Key'] = config.apiKey;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
      timeout: 30000
    });
    
    if (!response.ok) {
      client.release();
      return {
        success: false,
        message: `API request failed: ${response.status} ${response.statusText}`,
        statusCode: response.status
      };
    }
    
    let content;
    if (config.responseFormat === 'json') {
      content = await response.json();
    } else {
      content = await response.text();
    }
    
    let bankData;
    if (config.responseFormat === 'json') {
      bankData = parseJsonContent(content);
    } else if (config.responseFormat === 'xml') {
      bankData = await parseXmlContent(content);
    } else {
      bankData = parseCsvContent(content);
    }
    
    const v2Data = transformBankDataToV2(bankData, sourceEntity, 'bank_statement');
    
    await client.query('BEGIN');
    
    for (const record of v2Data) {
      await client.query(`
        INSERT INTO sp_v2_bank_transactions (
          transaction_id, utr, amount_paise, transaction_date,
          bank_name, merchant_id, status, source_type, source_name,
          raw_data, ingestion_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (transaction_id) DO UPDATE SET
          utr = EXCLUDED.utr,
          amount_paise = EXCLUDED.amount_paise,
          updated_at = NOW()
      `, [
        record.transaction_id || `API_${Date.now()}_${Math.random()}`,
        record.utr,
        record.amount_paise,
        record.transaction_date || cycleDate,
        sourceEntity,
        record.merchant_id,
        record.status || 'SETTLED',
        'CONNECTOR',
        sourceEntity,
        JSON.stringify(record)
      ]);
    }
    
    await client.query('COMMIT');
    client.release();
    
    return {
      success: true,
      recordsProcessed: v2Data.length,
      format: config.responseFormat
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    
    return {
      success: false,
      message: `API fetch failed: ${error.message}`,
      error: error.message
    };
  }
}

module.exports = {
  testApiConnection,
  fetchFromBankApi
};
