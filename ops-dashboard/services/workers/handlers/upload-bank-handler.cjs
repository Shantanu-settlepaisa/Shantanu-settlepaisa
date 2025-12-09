/**
 * Upload Bank Handler
 *
 * Processes bank statement uploads in batches.
 * Used by the batch-processor worker.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Job type this handler processes
const JOB_TYPE = 'UPLOAD_BANK';

// Batch insert size
const INSERT_BATCH_SIZE = 1000;

/**
 * Parse the payload file
 */
async function parseFile(filePath, metadata = {}) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.xlsx' || ext === '.xls') {
    return parseExcelFile(filePath);
  } else {
    return parseCSVFile(filePath, metadata.delimiter);
  }
}

/**
 * Parse Excel file
 */
function parseExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    raw: false,
    type: 'file'
  });

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  const headers = [];

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const cell = worksheet[cellAddress];
    headers.push(cell ? String(cell.v).trim() : `Column${col}`);
  }

  const records = [];
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const record = {};
    let hasData = false;

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddress];
      const header = headers[col - range.s.c];

      if (cell) {
        hasData = true;
        record[header] = cell.v !== undefined ? String(cell.v).trim() : '';
      } else {
        record[header] = '';
      }
    }

    if (hasData) {
      records.push(record);
    }
  }

  return records;
}

/**
 * Parse CSV file
 */
function parseCSVFile(filePath, delimiter = ',') {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) return [];

  const firstLine = lines[0];
  if (!delimiter || delimiter === 'auto') {
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';')) delimiter = ';';
    else if (firstLine.includes('|')) delimiter = '|';
    else delimiter = ',';
  }

  const headers = parseCSVLine(firstLine, delimiter);

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    const record = {};

    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j] || '';
    }

    records.push(record);
  }

  return records;
}

/**
 * Parse CSV line with quote handling
 */
function parseCSVLine(line, delimiter) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

/**
 * Normalize bank record to database format
 */
function normalizeRecord(raw, rowIndex, bankName) {
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    const cleanKey = key.replace(/^["']|["']$/g, '').trim().toLowerCase();
    clean[cleanKey] = value;
  }

  // UTR
  const utr = clean['utr'] || clean['rrn'] || clean['bank_utr'] ||
              clean['reference'] || clean['ref_no'] || clean['bank_ref'] || '';

  // Bank reference
  const bankRef = clean['bank_reference'] || clean['bank_ref'] || clean['reference'] ||
                  clean['ref_no'] || utr || `BANK_${Date.now()}_${rowIndex}`;

  // Amount
  let amountPaise = 0;
  const amountField = clean['credit'] || clean['amount'] || clean['credit_amount'] ||
                      clean['net_amount'] || clean['deposit'] || '0';

  if (amountField) {
    const cleanAmount = String(amountField).replace(/[₹$,\s]/g, '');
    const parsed = parseFloat(cleanAmount);
    if (!isNaN(parsed)) {
      amountPaise = parsed > 100000 ? Math.round(parsed) : Math.round(parsed * 100);
    }
  }

  // Bank charges
  let bankFeePaise = 0;
  const feeField = clean['bank_fee'] || clean['charges'] || clean['fee'] || clean['commission'] || '0';
  if (feeField) {
    const cleanFee = String(feeField).replace(/[₹$,\s]/g, '');
    const parsed = parseFloat(cleanFee);
    if (!isNaN(parsed)) {
      bankFeePaise = parsed > 10000 ? Math.round(parsed) : Math.round(parsed * 100);
    }
  }

  // GST
  let bankGstPaise = 0;
  const gstField = clean['gst'] || clean['bank_gst'] || clean['tax'] || '0';
  if (gstField) {
    const cleanGst = String(gstField).replace(/[₹$,\s]/g, '');
    const parsed = parseFloat(cleanGst);
    if (!isNaN(parsed)) {
      bankGstPaise = parsed > 10000 ? Math.round(parsed) : Math.round(parsed * 100);
    }
  }

  // Transaction date
  let transactionDate = null;
  const dateField = clean['transaction date'] || clean['date'] || clean['txn_date'] ||
                    clean['value_date'] || clean['posting_date'];
  if (dateField) {
    const parsed = new Date(dateField);
    if (!isNaN(parsed.getTime())) {
      transactionDate = parsed;
    }
  }

  // Value date
  let valueDate = null;
  const valueDateField = clean['value date'] || clean['value_date'] || dateField;
  if (valueDateField) {
    const parsed = new Date(valueDateField);
    if (!isNaN(parsed.getTime())) {
      valueDate = parsed;
    }
  }

  return {
    bank_ref: String(bankRef).trim(),
    bank_name: bankName || 'UNKNOWN_BANK',
    utr: String(utr).trim(),
    amount_paise: amountPaise,
    gross_amount_paise: amountPaise + bankFeePaise + bankGstPaise,
    bank_fee_paise: bankFeePaise,
    bank_gst_paise: bankGstPaise,
    transaction_date: transactionDate,
    value_date: valueDate
  };
}

/**
 * Process a batch of bank records
 */
async function process(job, context) {
  const { pool, startRecord, endRecord, batchNumber, workerId } = context;
  const config = job.config;
  const bankName = job.payloadMetadata?.bankName || 'UNKNOWN_BANK';
  const sourceFile = job.payloadMetadata?.fileName || 'batch_upload';

  console.log(`[UploadBankHandler] Processing batch ${batchNumber}: records ${startRecord} to ${endRecord}`);

  // Parse file
  let allRecords;
  try {
    allRecords = await parseFile(job.payloadPath, job.payloadMetadata);
    console.log(`[UploadBankHandler] Parsed ${allRecords.length} total records from file`);
  } catch (error) {
    console.error(`[UploadBankHandler] Failed to parse file:`, error.message);
    throw error;
  }

  // Get records for this batch
  const batchRecords = allRecords.slice(startRecord, endRecord);
  console.log(`[UploadBankHandler] Processing ${batchRecords.length} records in this batch`);

  // Normalize records
  const normalizedRecords = batchRecords.map((raw, idx) => {
    try {
      return normalizeRecord(raw, startRecord + idx, bankName);
    } catch (error) {
      console.error(`[UploadBankHandler] Error normalizing record ${startRecord + idx}:`, error.message);
      return null;
    }
  }).filter(r => r !== null);

  // Insert
  let inserted = 0, skipped = 0, duplicates = 0;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const totalSubBatches = Math.ceil(normalizedRecords.length / INSERT_BATCH_SIZE);

    for (let subBatch = 0; subBatch < totalSubBatches; subBatch++) {
      const start = subBatch * INSERT_BATCH_SIZE;
      const end = Math.min(start + INSERT_BATCH_SIZE, normalizedRecords.length);
      const records = normalizedRecords.slice(start, end);

      try {
        // Build batch INSERT
        const values = [];
        const params = [];
        let paramIndex = 1;

        for (const stmt of records) {
          const placeholders = [];
          for (let i = 0; i < 12; i++) {
            placeholders.push(`$${paramIndex++}`);
          }
          values.push(`(${placeholders.join(', ')})`);

          params.push(
            stmt.bank_ref,
            stmt.bank_name,
            stmt.utr,
            stmt.amount_paise,
            stmt.gross_amount_paise,
            stmt.bank_fee_paise,
            stmt.bank_gst_paise,
            stmt.transaction_date || new Date(),
            stmt.value_date || stmt.transaction_date || new Date(),
            'MANUAL_UPLOAD',
            sourceFile,
            'CREDIT'
          );
        }

        const sql = `
          INSERT INTO sp_v2_bank_statements
          (bank_ref, bank_name, utr, amount_paise, gross_amount_paise, bank_fee_paise,
           bank_gst_paise, transaction_date, value_date, source_type, source_file, debit_credit)
          VALUES ${values.join(', ')}
          ON CONFLICT (utr, bank_name) DO NOTHING
        `;

        const result = await client.query(sql, params);
        const batchInserted = result.rowCount || 0;
        const batchDuplicates = records.length - batchInserted;

        inserted += batchInserted;
        duplicates += batchDuplicates;

      } catch (error) {
        console.error(`[UploadBankHandler] Sub-batch error:`, error.message);

        // Fall back to individual inserts
        for (const stmt of records) {
          try {
            // Check for duplicate
            const existing = await client.query(
              'SELECT id FROM sp_v2_bank_statements WHERE utr = $1 AND bank_name = $2',
              [stmt.utr, stmt.bank_name]
            );

            if (existing.rows.length > 0) {
              duplicates++;
              continue;
            }

            await client.query(`
              INSERT INTO sp_v2_bank_statements
              (bank_ref, bank_name, utr, amount_paise, gross_amount_paise, bank_fee_paise,
               bank_gst_paise, transaction_date, value_date, source_type, source_file, debit_credit)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
              stmt.bank_ref, stmt.bank_name, stmt.utr, stmt.amount_paise, stmt.gross_amount_paise,
              stmt.bank_fee_paise, stmt.bank_gst_paise, stmt.transaction_date || new Date(),
              stmt.value_date || stmt.transaction_date || new Date(), 'MANUAL_UPLOAD', sourceFile, 'CREDIT'
            ]);

            inserted++;
          } catch (rowError) {
            console.error(`[UploadBankHandler] Row error (${stmt.utr}):`, rowError.message);
            skipped++;
          }
        }
      }
    }

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log(`[UploadBankHandler] Batch ${batchNumber} complete: ${inserted} inserted, ${duplicates} duplicates, ${skipped} skipped`);

  return {
    processed: inserted + duplicates,
    failed: skipped,
    skipped: duplicates,
    inserted
  };
}

module.exports = {
  jobType: JOB_TYPE,
  process
};
