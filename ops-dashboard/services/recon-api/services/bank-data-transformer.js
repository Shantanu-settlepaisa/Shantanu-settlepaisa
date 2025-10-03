const Papa = require('papaparse');
const xml2js = require('xml2js');
const { mapV1ToV2 } = require('../utils/v1-column-mapper');

function parseCsvContent(content) {
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });
  
  if (result.errors.length > 0) {
    throw new Error(`CSV parsing error: ${result.errors[0].message}`);
  }
  
  return result.data;
}

function parseJsonContent(content) {
  try {
    const data = typeof content === 'string' ? JSON.parse(content) : content;
    return Array.isArray(data) ? data : 
           data.records || data.transactions || data.data || [data];
  } catch (error) {
    throw new Error(`JSON parsing error: ${error.message}`);
  }
}

async function parseXmlContent(content) {
  const parser = new xml2js.Parser({ explicitArray: false });
  
  try {
    const result = await parser.parseStringPromise(content);
    const records = result.records?.record || result.transactions?.transaction || [];
    return Array.isArray(records) ? records : [records];
  } catch (error) {
    throw new Error(`XML parsing error: ${error.message}`);
  }
}

function transformBankDataToV2(bankData, sourceEntity, dataType = 'bank_statement') {
  return bankData.map(row => {
    const v2Record = mapV1ToV2(row, dataType);
    
    v2Record.source_type = 'CONNECTOR';
    v2Record.source_name = sourceEntity;
    v2Record.ingestion_timestamp = new Date().toISOString();
    
    if (!v2Record.transaction_id && row.UTR) {
      v2Record.transaction_id = row.UTR;
    }
    if (!v2Record.transaction_id && row.RRN) {
      v2Record.transaction_id = row.RRN;
    }
    if (!v2Record.transaction_id && row.REFERENCE_NO) {
      v2Record.transaction_id = row.REFERENCE_NO;
    }
    
    if (!v2Record.amount_paise && row.AMOUNT) {
      v2Record.amount_paise = Math.round(parseFloat(row.AMOUNT) * 100);
    }
    
    if (!v2Record.transaction_date && row.TXN_DATE) {
      v2Record.transaction_date = parseDate(row.TXN_DATE);
    }
    
    return v2Record;
  });
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  
  const formats = [
    /(\d{4})-(\d{2})-(\d{2})/,
    /(\d{2})-(\d{2})-(\d{4})/,
    /(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{4})\/(\d{2})\/(\d{2})/
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      const [_, p1, p2, p3] = match;
      if (p1.length === 4) {
        return `${p1}-${p2}-${p3}`;
      } else {
        return `${p3}-${p2}-${p1}`;
      }
    }
  }
  
  return dateStr.split('T')[0];
}

module.exports = {
  parseCsvContent,
  parseJsonContent,
  parseXmlContent,
  transformBankDataToV2
};
