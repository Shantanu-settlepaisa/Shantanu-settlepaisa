/**
 * Upload PG Handler
 *
 * Processes PG transaction uploads in batches.
 * Used by the batch-processor worker.
 *
 * This handler:
 * 1. Reads records from the stored payload file
 * 2. Processes them in configurable batch sizes
 * 3. Inserts into sp_v2_transactions table
 * 4. Tracks progress and supports resume from checkpoint
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Job type this handler processes
const JOB_TYPE = 'UPLOAD_PG';

// Batch insert size (records per INSERT statement)
const INSERT_BATCH_SIZE = 1000;

/**
 * Parse the payload file and return records
 *
 * @param {string} filePath - Path to the file
 * @param {Object} metadata - File metadata (type, delimiter, etc.)
 * @returns {Array} Parsed records
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
    raw: false,  // Get formatted strings to preserve large numbers
    type: 'file'
  });

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Get headers from first row
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  const headers = [];

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const cell = worksheet[cellAddress];
    headers.push(cell ? String(cell.v).trim() : `Column${col}`);
  }

  // Parse data rows
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

  // Detect delimiter if not specified
  const firstLine = lines[0];
  if (!delimiter || delimiter === 'auto') {
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';')) delimiter = ';';
    else if (firstLine.includes('|')) delimiter = '|';
    else delimiter = ',';
  }

  // Parse headers
  const headers = parseCSVLine(firstLine, delimiter);

  // Parse data rows
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
 * Parse a single CSV line (handles quoted values)
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
 * Normalize a raw record to database format
 */
function normalizeRecord(raw, rowIndex) {
  // Clean up header names (remove quotes, trim)
  const clean = {};
  for (const [key, value] of Object.entries(raw)) {
    const cleanKey = key.replace(/^["']|["']$/g, '').trim().toLowerCase();
    clean[cleanKey] = value;
  }

  // Map to database columns
  // Support multiple column name variations
  const txnId = clean['transaction id'] || clean['transaction_id'] || clean['txn_id'] ||
                clean['pgw_ref'] || clean['reference'] || `TXN_${Date.now()}_${rowIndex}`;

  const utr = clean['utr'] || clean['bank_utr'] || clean['rrn'] || clean['bank_ref'] || '';

  // Amount parsing - handle various formats
  let amountPaise = 0;
  const amountField = clean['payee amount'] || clean['paid amount'] || clean['amount'] ||
                      clean['amount_paise'] || clean['net_amount'] || '0';

  if (amountField) {
    // Remove currency symbols, commas
    const cleanAmount = String(amountField).replace(/[₹$,\s]/g, '');
    const parsed = parseFloat(cleanAmount);
    if (!isNaN(parsed)) {
      // If value looks like paise (very large), keep as is; otherwise multiply by 100
      amountPaise = parsed > 100000 ? Math.round(parsed) : Math.round(parsed * 100);
    }
  }

  // Parse date
  let transactionDate = null;
  const dateField = clean['trans complete date'] || clean['transaction_date'] ||
                    clean['date'] || clean['created_at'] || clean['txn_date'];

  if (dateField) {
    const parsed = new Date(dateField);
    if (!isNaN(parsed.getTime())) {
      transactionDate = parsed;
    }
  }

  // Payment method
  const paymentMethod = clean['payment mode'] || clean['payment_mode'] ||
                        clean['payment_method'] || clean['pay mode'] || 'UNKNOWN';

  // Status
  const statusField = clean['status'] || clean['txn_status'] || 'SUCCESS';
  const status = normalizeStatus(statusField);

  // Merchant ID
  const merchantId = clean['client code'] || clean['merchant_id'] ||
                     clean['mid'] || clean['merchant'] || 'DEFAULT_MERCHANT';

  return {
    pgw_ref: String(txnId).trim(),
    merchant_id: merchantId,
    utr: String(utr).trim(),
    amount_paise: amountPaise,
    gross_amount_paise: amountPaise,  // Same as amount for now
    currency: 'INR',
    payment_mode: paymentMethod.toUpperCase(),
    status: status,
    transaction_date: transactionDate,
    transaction_timestamp: transactionDate
  };
}

/**
 * Normalize status to standard values
 */
function normalizeStatus(status) {
  const s = String(status).toUpperCase().trim();

  if (s === 'SUCCESS' || s === 'SUCCESSFUL' || s === 'COMPLETED' || s === 'S') {
    return 'SUCCESS';
  } else if (s === 'FAILED' || s === 'FAILURE' || s === 'F') {
    return 'FAILED';
  } else if (s === 'PENDING' || s === 'P' || s === 'INITIATED') {
    return 'PENDING';
  } else if (s === 'REFUNDED' || s === 'REVERSED') {
    return 'REFUNDED';
  }

  return 'SUCCESS';  // Default
}

/**
 * Process a batch of records
 *
 * @param {Object} job - Job details from queue
 * @param {Object} context - Processing context
 * @returns {Object} Batch result { processed, failed, skipped }
 */
async function process(job, context) {
  const { pool, startRecord, endRecord, batchNumber, workerId } = context;
  const config = job.config;
  const uploadSessionId = job.payloadMetadata?.uploadSessionId;

  console.log(`[UploadPGHandler] Processing batch ${batchNumber}: records ${startRecord} to ${endRecord}`);

  // Parse file if this is first batch or we don't have cached data
  // In production, we'd cache this or stream the file
  let allRecords;
  try {
    allRecords = await parseFile(job.payloadPath, job.payloadMetadata);
    console.log(`[UploadPGHandler] Parsed ${allRecords.length} total records from file`);
  } catch (error) {
    console.error(`[UploadPGHandler] Failed to parse file:`, error.message);
    throw error;
  }

  // Get records for this batch
  const batchRecords = allRecords.slice(startRecord, endRecord);
  console.log(`[UploadPGHandler] Processing ${batchRecords.length} records in this batch`);

  // Normalize records
  const normalizedRecords = batchRecords.map((raw, idx) => {
    try {
      return normalizeRecord(raw, startRecord + idx);
    } catch (error) {
      console.error(`[UploadPGHandler] Error normalizing record ${startRecord + idx}:`, error.message);
      return null;
    }
  }).filter(r => r !== null);

  // Insert in sub-batches
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

        for (const txn of records) {
          const placeholders = [];
          for (let i = 0; i < 14; i++) {
            placeholders.push(`$${paramIndex++}`);
          }
          values.push(`(${placeholders.join(', ')})`);

          params.push(
            txn.pgw_ref,
            txn.merchant_id,
            txn.pgw_ref,  // gateway_ref
            txn.utr,
            txn.amount_paise,
            txn.gross_amount_paise,
            txn.currency,
            txn.payment_mode,
            txn.status,
            txn.transaction_date || new Date(),
            txn.transaction_timestamp || new Date(),
            'MANUAL_UPLOAD',
            'batch_processor',
            uploadSessionId || null
          );
        }

        const sql = `
          INSERT INTO sp_v2_transactions
          (transaction_id, merchant_id, gateway_ref, utr, amount_paise, gross_amount_paise,
           currency, payment_method, status, transaction_date, transaction_timestamp,
           source_type, source_name, upload_session_id)
          VALUES ${values.join(', ')}
          ON CONFLICT (transaction_id, merchant_id, source_type) DO NOTHING
        `;

        const result = await client.query(sql, params);
        const batchInserted = result.rowCount || 0;
        const batchDuplicates = records.length - batchInserted;

        inserted += batchInserted;
        duplicates += batchDuplicates;

      } catch (error) {
        console.error(`[UploadPGHandler] Sub-batch error:`, error.message);

        // Fall back to individual inserts
        for (const txn of records) {
          try {
            const result = await client.query(`
              INSERT INTO sp_v2_transactions
              (transaction_id, merchant_id, gateway_ref, utr, amount_paise, gross_amount_paise,
               currency, payment_method, status, transaction_date, transaction_timestamp,
               source_type, source_name, upload_session_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              ON CONFLICT (transaction_id, merchant_id, source_type) DO NOTHING
              RETURNING id
            `, [
              txn.pgw_ref, txn.merchant_id, txn.pgw_ref, txn.utr,
              txn.amount_paise, txn.gross_amount_paise, txn.currency, txn.payment_mode,
              txn.status, txn.transaction_date || new Date(), txn.transaction_timestamp || new Date(),
              'MANUAL_UPLOAD', 'batch_processor', uploadSessionId || null
            ]);

            if (result.rowCount > 0) inserted++;
            else duplicates++;
          } catch (rowError) {
            console.error(`[UploadPGHandler] Row error (${txn.pgw_ref}):`, rowError.message);
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

  console.log(`[UploadPGHandler] Batch ${batchNumber} complete: ${inserted} inserted, ${duplicates} duplicates, ${skipped} skipped`);

  return {
    processed: inserted + duplicates,  // Total processed (including duplicates)
    failed: skipped,
    skipped: duplicates,
    inserted
  };
}

module.exports = {
  jobType: JOB_TYPE,
  process
};
