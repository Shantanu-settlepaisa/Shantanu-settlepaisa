const config = require('../config/env.cjs');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { Pool } = require('pg');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { convertV1CSVToV2, detectFormat } = require('./v1-column-mapper');
// const { createHealthCheckEndpoint } = require('../health-check');

// Development logging (gated in production)
const isDev = config.app.nodeEnv !== 'production';
const log = (...args) => isDev && console.log(...args);

const app = express();
const PORT = process.env.PORT || 5107;

// Database connection with production-ready pool configuration
const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('[Upload Pool Error]', err));

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

// Enhanced File Upload Endpoint - Multiple Files
app.post('/api/upload/multiple', upload.array('files', 10), async (req, res) => {
  try {
    log('📁 [V2 Upload] Received files:', req.files?.map(f => f.originalname));
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = [];
    
    for (const file of req.files) {
      try {
        const result = await processFile(file, req.body.fileType || 'auto-detect');
        results.push({
          filename: file.originalname,
          status: 'success',
          ...result
        });
      } catch (error) {
        console.error(`❌ [V2 Upload] Error processing ${file.originalname}:`, error);
        results.push({
          filename: file.originalname,
          status: 'error',
          error: error.message
        });
      }
    }

    // Clean up uploaded files
    req.files.forEach(file => {
      fs.unlink(file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    });

    res.json({
      success: true,
      message: `Processed ${results.length} files`,
      results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length
      }
    });

  } catch (error) {
    console.error('❌ [V2 Upload] Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Single File Upload with Type Detection + Upload Session Tracking
app.post('/api/upload/single', upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  let uploadSessionId = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      fileType = 'auto-detect',
      sourceType = null,
      preview = 'true',
      overwrite = 'false',
      date = null,
      userId = 'system',
      merchantId = null
    } = req.body;

    // Validate overwrite parameters
    if (overwrite === 'true' && !date) {
      return res.status(400).json({
        error: 'Date parameter is required when overwrite=true',
        hint: 'Provide date in YYYY-MM-DD format'
      });
    }

    // Validate date format if provided
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Invalid date format',
        hint: 'Use YYYY-MM-DD format (e.g., 2025-10-24)'
      });
    }

    log(`📄 [V2 Upload] Processing: ${req.file.originalname} as ${fileType}, source: ${sourceType || 'N/A'}, overwrite: ${overwrite}`);

    // BEGIN TRANSACTION - All-or-nothing upload
    await client.query('BEGIN');

    // Map file type to upload_sessions enum values
    let sessionFileType = fileType;
    if (fileType === 'transactions' || fileType === 'pg_transactions' || fileType === 'pg_data') {
      sessionFileType = 'PG_TRANSACTIONS';
    } else if (fileType === 'bank_statements' || fileType === 'bank_data') {
      sessionFileType = 'BANK_STATEMENT';
    } else if (fileType === 'auto-detect') {
      sessionFileType = 'PG_TRANSACTIONS'; // Default for auto-detect
    }

    // Create upload session record
    const sessionResult = await client.query(`
      INSERT INTO sp_v2_upload_sessions
      (user_id, merchant_id, file_name, file_type, file_size_bytes, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING upload_id
    `, [
      userId,
      merchantId,
      req.file.originalname,
      sessionFileType,
      req.file.size,
      'PROCESSING'
    ]);

    uploadSessionId = sessionResult.rows[0].upload_id;
    log(`📦 [Upload Session] Created session: ${uploadSessionId}`);

    let deletionStats = null;

    // Clean existing data if overwrite enabled
    if (overwrite === 'true' && date) {
      deletionStats = await cleanDataForDate(date, fileType, client);
      log(`✅ [Overwrite] Cleaned data for ${date}: PG=${deletionStats.pgDeleted}, Bank=${deletionStats.bankDeleted}, Total=${deletionStats.totalDeleted}`);
    }

    // Process file with session tracking
    const result = await processFileWithSession(
      req.file,
      fileType,
      sourceType,
      preview === 'true',
      uploadSessionId,
      client
    );

    // Update session status to COMPLETED
    await client.query(`
      UPDATE sp_v2_upload_sessions
      SET status = 'COMPLETED',
          rows_total = $1,
          rows_processed = $2,
          rows_failed = $3,
          completed_at = NOW()
      WHERE upload_id = $4
    `, [
      result.totalRows,
      result.validRows,
      result.errors,
      uploadSessionId
    ]);

    // COMMIT TRANSACTION - Upload successful
    await client.query('COMMIT');
    log(`✅ [Upload Session] Completed: ${uploadSessionId}`);

    // Clean up file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting file:', err);
    });

    res.json({
      success: true,
      uploadSessionId,
      filename: req.file.originalname,
      overwrite: overwrite === 'true',
      deletionStats,
      ...result
    });

  } catch (error) {
    // ROLLBACK TRANSACTION - Upload failed
    try {
      await client.query('ROLLBACK');
      log(`❌ [Upload Session] Rolled back: ${uploadSessionId || 'N/A'}`);

      // Mark session as FAILED if created
      if (uploadSessionId) {
        await client.query(`
          UPDATE sp_v2_upload_sessions
          SET status = 'FAILED',
              error_message = $1,
              completed_at = NOW()
          WHERE upload_id = $2
        `, [error.message, uploadSessionId]);
      }
    } catch (rollbackError) {
      console.error('❌ [Rollback Error]:', rollbackError);
    }

    console.error('❌ [V2 Upload] Error:', error);
    res.status(500).json({
      error: error.message,
      uploadSessionId,
      rolled_back: true
    });
  } finally {
    client.release();
  }
});

// Clean existing data for a specific date (for overwrite mode)
async function cleanDataForDate(date, fileType, client = null) {
  const shouldReleaseClient = !client;
  if (!client) {
    client = await pool.connect();
  }

  let pgDeleted = 0, bankDeleted = 0;

  try {
    const needsTransaction = shouldReleaseClient;
    if (needsTransaction) await client.query('BEGIN');

    if (fileType === 'transactions' || fileType === 'pg_transactions' || fileType === 'pg_data') {
      const result = await client.query(`
        DELETE FROM sp_v2_transactions
        WHERE DATE(transaction_date) = $1
        AND source_type = 'MANUAL_UPLOAD'
      `, [date]);
      pgDeleted = result.rowCount;
      log(`🧹 [Overwrite] Deleted ${pgDeleted} PG transactions for ${date}`);
    }

    if (fileType === 'bank_statements' || fileType === 'bank_data') {
      const result = await client.query(`
        DELETE FROM sp_v2_bank_statements
        WHERE DATE(transaction_date) = $1
        AND source_type = 'MANUAL_UPLOAD'
      `, [date]);
      bankDeleted = result.rowCount;
      log(`🧹 [Overwrite] Deleted ${bankDeleted} bank statements for ${date}`);
    }

    if (needsTransaction) await client.query('COMMIT');
    return { pgDeleted, bankDeleted, totalDeleted: pgDeleted + bankDeleted };
  } catch (error) {
    if (shouldReleaseClient) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (shouldReleaseClient) client.release();
  }
}

// File processing function with V2 database integration (original - for backward compatibility)
async function processFile(file, fileType, sourceType = null, includePreview = true) {
  const ext = path.extname(file.originalname).toLowerCase();
  let data = [];

  // Parse file based on extension
  if (ext === '.csv') {
    data = await parseCSV(file.path);
  } else if (['.xlsx', '.xls'].includes(ext)) {
    data = await parseExcel(file.path);
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  if (data.length === 0) {
    throw new Error('No data found in file');
  }

  log(`📊 [V2 Upload] Parsed ${data.length} rows from ${file.originalname}`);

  // Auto-detect file type based on columns
  const detectedType = fileType === 'auto-detect' ? detectFileType(data[0]) : fileType;

  // Convert V1 format to V2 if needed
  let processedData = data;
  try {
    const format = detectFormat(Object.keys(data[0]));
    log(`📋 [V2 Upload] Detected format: ${format}`);

    if (format === 'v1') {
      // Fix: Check for both 'transactions' and 'pg_transactions' variants
      const isPgTransactions = detectedType === 'transactions' || detectedType === 'pg_transactions' || detectedType === 'pg_data';
      const v1Type = isPgTransactions ? 'pg_transactions' : 'bank_statements';

      // For bank statements, use sourceType as bank name for DB-driven mapping
      const bankName = (!isPgTransactions && sourceType) ? sourceType : null;

      log(`🔍 [V2 Upload] V1 Type Mapping: detectedType="${detectedType}" → v1Type="${v1Type}", bankName="${bankName || 'N/A'}"`);

      // IMPORTANT: convertV1CSVToV2 is now async!
      processedData = await convertV1CSVToV2(data, v1Type, bankName);
      log(`✨ [V2 Upload] Converted ${data.length} V1 rows to V2 format`);
    }
  } catch (conversionError) {
    console.error(`❌ [V2 Upload] V1->V2 conversion failed:`, conversionError);
    console.error(`Stack:`, conversionError.stack);
    // Use original data if conversion fails
    processedData = data;
  }

  // Validate and process data
  log(`🔍 [V2 Upload] Calling validateData with fileType: "${detectedType}"`);
  const { validRecords, errors } = validateData(processedData, detectedType);

  log(`📊 [V2 Upload] Validation results: ${validRecords.length} valid, ${errors.length} errors`);
  if (errors.length > 0) {
    log(`❌ [V2 Upload] First error:`, errors[0]);
  }

  // Insert into V2 database
  let insertResult;
  if (validRecords.length > 0) {
    if (detectedType === 'transactions' || detectedType === 'pg_transactions' || detectedType === 'pg_data') {
      insertResult = await insertTransactions(validRecords);
    } else if (detectedType === 'bank_statements' || detectedType === 'bank_data') {
      insertResult = await insertBankStatements(validRecords);
    } else {
      throw new Error(`Unknown file type: ${detectedType}`);
    }
  }

  return {
    fileType: detectedType,
    totalRows: data.length,
    validRows: validRecords.length,
    errors: errors.length,
    errorDetails: errors.slice(0, 10), // First 10 errors
    preview: includePreview ? data.slice(0, 5) : null,
    insertResult,
    processing: {
      inserted: insertResult?.inserted || 0,
      skipped: insertResult?.skipped || 0,
      duplicates: insertResult?.duplicates || 0
    }
  };
}

// File processing with upload session tracking (NEW - atomic version)
async function processFileWithSession(file, fileType, sourceType = null, includePreview = true, uploadSessionId, client) {
  const ext = path.extname(file.originalname).toLowerCase();
  let data = [];

  // Parse file based on extension
  if (ext === '.csv') {
    data = await parseCSV(file.path);
  } else if (['.xlsx', '.xls'].includes(ext)) {
    data = await parseExcel(file.path);
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  if (data.length === 0) {
    throw new Error('No data found in file');
  }

  log(`📊 [V2 Upload] Parsed ${data.length} rows from ${file.originalname}`);

  // Auto-detect file type based on columns
  const detectedType = fileType === 'auto-detect' ? detectFileType(data[0]) : fileType;

  // Convert V1 format to V2 if needed
  let processedData = data;
  try {
    const format = detectFormat(Object.keys(data[0]));
    log(`📋 [V2 Upload] Detected format: ${format}`);

    if (format === 'v1') {
      const isPgTransactions = detectedType === 'transactions' || detectedType === 'pg_transactions' || detectedType === 'pg_data';
      const v1Type = isPgTransactions ? 'pg_transactions' : 'bank_statements';
      const bankName = (!isPgTransactions && sourceType) ? sourceType : null;

      log(`🔍 [V2 Upload] V1 Type Mapping: detectedType="${detectedType}" → v1Type="${v1Type}", bankName="${bankName || 'N/A'}"`);

      processedData = await convertV1CSVToV2(data, v1Type, bankName);
      log(`✨ [V2 Upload] Converted ${data.length} V1 rows to V2 format`);
    }
  } catch (conversionError) {
    console.error(`❌ [V2 Upload] V1->V2 conversion failed:`, conversionError);
    console.error(`Stack:`, conversionError.stack);
    processedData = data;
  }

  // Validate and process data
  log(`🔍 [V2 Upload] Calling validateData with fileType: "${detectedType}"`);
  const { validRecords, errors } = validateData(processedData, detectedType);

  log(`📊 [V2 Upload] Validation results: ${validRecords.length} valid, ${errors.length} errors`);
  if (errors.length > 0) {
    log(`❌ [V2 Upload] First error:`, errors[0]);
  }

  // Insert into V2 database using the provided client (part of transaction)
  let insertResult;
  if (validRecords.length > 0) {
    if (detectedType === 'transactions' || detectedType === 'pg_transactions' || detectedType === 'pg_data') {
      insertResult = await insertTransactionsWithSession(validRecords, uploadSessionId, client);
    } else if (detectedType === 'bank_statements' || detectedType === 'bank_data') {
      insertResult = await insertBankStatementsWithSession(validRecords, uploadSessionId, client);
    } else {
      throw new Error(`Unknown file type: ${detectedType}`);
    }
  }

  return {
    fileType: detectedType,
    totalRows: data.length,
    validRows: validRecords.length,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    preview: includePreview ? data.slice(0, 5) : null,
    insertResult,
    processing: {
      inserted: insertResult?.inserted || 0,
      skipped: insertResult?.skipped || 0,
      duplicates: insertResult?.duplicates || 0
    }
  };
}

// CSV Parser
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// Excel Parser
function parseExcel(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    return Promise.resolve(data);
  } catch (error) {
    return Promise.reject(error);
  }
}

// File type detection based on column headers
function detectFileType(firstRow) {
  const columns = Object.keys(firstRow).map(k => k.toLowerCase());
  
  // Transaction/PG data indicators
  const pgColumns = ['transaction_id', 'txn_id', 'pgw_ref', 'gateway_ref', 'amount', 'merchant_id'];
  const bankColumns = ['utr', 'bank_ref', 'credited_at', 'debit_credit', 'bank_name'];
  
  const pgMatches = pgColumns.filter(col => columns.some(c => c.includes(col))).length;
  const bankMatches = bankColumns.filter(col => columns.some(c => c.includes(col))).length;
  
  if (pgMatches >= bankMatches) {
    return 'transactions';
  } else {
    return 'bank_statements';
  }
}

// Data validation
function validateData(data, fileType) {
  const validRecords = [];
  const errors = [];

  data.forEach((row, index) => {
    try {
      if (fileType === 'transactions' || fileType === 'pg_transactions' || fileType === 'pg_data') {
        const validated = validateTransaction(row, index + 1);
        if (validated) validRecords.push(validated);
      } else if (fileType === 'bank_statements' || fileType === 'bank_data') {
        const validated = validateBankStatement(row, index + 1);
        if (validated) validRecords.push(validated);
      } else {
        console.error(`[V2 Upload] Unknown fileType for validation: ${fileType}`);
      }
    } catch (error) {
      console.error(`[V2 Upload] Validation error at row ${index + 1}:`, error.message);
      errors.push({
        row: index + 1,
        error: error.message,
        data: row
      });
    }
  });

  return { validRecords, errors };
}

// Transaction validation  
function validateTransaction(row, rowNumber) {
  // Map common column variations - V2 schema uses transaction_id after V1->V2 conversion
  const txnId = row.transaction_id || row.txn_id || row.pgw_ref || row.gateway_ref || row.pg_txn_id;

  // 🆕 Extract gross and net amounts separately (fix for PG transaction ambiguity)
  const grossAmountRaw = row.gross_amount_paise || row.gross_amount || row.paid_amount;
  const netAmountRaw = row.amount_paise || row.net_amount || row.payee_amount || row.amount;

  if (!txnId) {
    throw new Error('Missing transaction ID field');
  }

  // Validate net amount (required - this is what merchant receives)
  const netAmount = parseFloat(netAmountRaw);
  if (isNaN(netAmount) || netAmount <= 0) {
    throw new Error('Invalid amount');
  }

  // If amount is already in paise (> 1000), use as-is, otherwise convert rupees to paise
  const netAmountPaise = netAmount > 1000 ? Math.round(netAmount) : Math.round(netAmount * 100);

  // Process gross amount (optional - customer paid amount before PG commission)
  let grossAmountPaise = null;
  if (grossAmountRaw) {
    const grossAmount = parseFloat(grossAmountRaw);
    if (!isNaN(grossAmount) && grossAmount > 0) {
      grossAmountPaise = grossAmount > 1000 ? Math.round(grossAmount) : Math.round(grossAmount * 100);
    }
  }

  // Map status to valid database values
  const rawStatus = (row.status || row.Status || 'SUCCESS').toUpperCase();
  const statusMap = {
    'SUCCESS': 'PENDING',
    'COMPLETED': 'PENDING',
    'FAILED': 'FAILED',
    'PENDING': 'PENDING',
    'RECONCILED': 'RECONCILED',
    'EXCEPTION': 'EXCEPTION',
    'UNMATCHED': 'UNMATCHED'
  };
  const validStatus = statusMap[rawStatus] || 'PENDING';

  return {
    id: uuidv4(),
    merchant_id: row.merchant_id || 'UNKNOWN',
    pgw_ref: txnId,
    utr: row.utr || row.UTR || null,
    amount_paise: netAmountPaise,           // Net amount (merchant receives)
    gross_amount_paise: grossAmountPaise,   // 🆕 Gross amount (customer pays)
    currency: row.currency || 'INR',
    payment_mode: row.payment_mode || row.payment_method || 'UPI',
    status: validStatus,
    customer_email: row.customer_email || null,
    customer_phone: row.customer_phone || null,
    metadata: {
      original_row: rowNumber,
      source_file: 'manual_upload'
    }
  };
}

// Bank statement validation
function validateBankStatement(row, rowNumber) {
  // Map common column variations
  const utr = row.utr || row.UTR || row.utr_number;
  const bankRef = row.bank_ref || row.bankRef || row.reference_number || row.ref_no;

  // 🆕 Extract ALL amount fields separately (fix for ambiguity issue)
  const grossAmountRaw = row.gross_amount_paise || row.gross_amount || row.DOMESTIC_AMT || row.GROSS_AMT;
  const netAmountRaw = row.amount_paise || row.net_amount || row.amount || row.CREDIT_AMT || row.NET_CR_AMT || row.credited_amount;
  const bankFeeRaw = row.bank_fee_paise || row.bank_fee || row.bank_charges || row.BANK_CHARGES;
  const bankGstRaw = row.bank_gst_paise || row.bank_gst || row.BANK_GST;

  // Bank statements must have EITHER utr OR bank_ref as identifier
  if (!utr && !bankRef) {
    throw new Error('Missing identifier (UTR or bank_ref)');
  }

  // Validate net amount (required)
  const netAmount = parseFloat(netAmountRaw);
  if (isNaN(netAmount) || netAmount <= 0) {
    throw new Error('Invalid amount');
  }

  // If amount is already in paise (> 1000), use as-is, otherwise convert rupees to paise
  const netAmountPaise = netAmount > 1000 ? Math.round(netAmount) : Math.round(netAmount * 100);

  // Process gross amount (optional - may not be in all bank files)
  let grossAmountPaise = null;
  if (grossAmountRaw) {
    const grossAmount = parseFloat(grossAmountRaw);
    if (!isNaN(grossAmount) && grossAmount > 0) {
      grossAmountPaise = grossAmount > 1000 ? Math.round(grossAmount) : Math.round(grossAmount * 100);
    }
  }

  // Process bank fee (optional)
  let bankFeePaise = null;
  if (bankFeeRaw) {
    const bankFee = parseFloat(bankFeeRaw);
    if (!isNaN(bankFee) && bankFee >= 0) {
      bankFeePaise = bankFee > 100 ? Math.round(bankFee) : Math.round(bankFee * 100);
    }
  }

  // Process bank GST (optional)
  let bankGstPaise = null;
  if (bankGstRaw) {
    const bankGst = parseFloat(bankGstRaw);
    if (!isNaN(bankGst) && bankGst >= 0) {
      bankGstPaise = bankGst > 100 ? Math.round(bankGst) : Math.round(bankGst * 100);
    }
  }

  return {
    id: uuidv4(),
    acquirer: row.bank_name || row.BANK || row.acquirer || 'UNKNOWN',
    utr: utr || bankRef || null,  // Use bank_ref as fallback if no UTR
    amount_paise: netAmountPaise,           // Net amount (credited to merchant)
    gross_amount_paise: grossAmountPaise,   // 🆕 Gross amount (customer paid)
    bank_fee_paise: bankFeePaise,           // 🆕 Bank fee
    bank_gst_paise: bankGstPaise,           // 🆕 Bank GST
    credited_at: new Date(row.credited_at || row.VALUE_DATE || row.transaction_date || new Date()),
    cycle_date: new Date(row.cycle_date || row.VALUE_DATE || row.transaction_date || new Date()),
    bank_reference: bankRef || row.TXNID || row.bank_reference || null,
    raw_data: {
      original_row: rowNumber,
      source_file: 'manual_upload',
      ...row
    }
  };
}

// Helper to find column variants
function findColumnVariant(row, field) {
  const variants = {
    transaction_id: ['txn_id', 'pgw_ref', 'gateway_ref', 'reference'],
    amount: ['amount_paise', 'gross_amount', 'net_amount', 'credited_amount'],
    utr: ['utr_number', 'bank_utr', 'reference_number']
  };
  
  const possibleKeys = variants[field] || [];
  return possibleKeys.find(key => row[key] !== undefined);
}

// Insert transactions into V2 database (original - for backward compatibility)
async function insertTransactions(transactions) {
  const client = await pool.connect();
  let inserted = 0, skipped = 0, duplicates = 0;

  try {
    await client.query('BEGIN');

    for (const txn of transactions) {
      try {
        await client.query('SAVEPOINT sp_txn');

        // Check for duplicates
        const existing = await client.query(
          'SELECT id FROM sp_v2_transactions WHERE transaction_id = $1',
          [txn.pgw_ref]
        );

        if (existing.rows.length > 0) {
          duplicates++;
          await client.query('RELEASE SAVEPOINT sp_txn');
          continue;
        }

        // Insert transaction into sp_v2_transactions
        await client.query(`
          INSERT INTO sp_v2_transactions
          (transaction_id, merchant_id, gateway_ref, utr, amount_paise, gross_amount_paise, currency, payment_method, status,
           transaction_date, transaction_timestamp, source_type, source_name)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          txn.pgw_ref, txn.merchant_id, txn.pgw_ref, txn.utr, txn.amount_paise, txn.gross_amount_paise,
          txn.currency, txn.payment_mode, txn.status,
          new Date(), new Date(), 'MANUAL_UPLOAD', 'manual_upload'
        ]);

        await client.query('RELEASE SAVEPOINT sp_txn');
        inserted++;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT sp_txn');
        console.error(`[V2 Upload] Error inserting transaction ${txn.pgw_ref}:`, error.message);
        console.error(`[V2 Upload] Transaction data:`, JSON.stringify(txn));
        skipped++;
      }
    }

    await client.query('COMMIT');
    log(`✅ [V2 Upload] Transactions - Inserted: ${inserted}, Skipped: ${skipped}, Duplicates: ${duplicates}`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { inserted, skipped, duplicates };
}

// Insert transactions with session tracking (NEW - atomic version)
async function insertTransactionsWithSession(transactions, uploadSessionId, client) {
  let inserted = 0, skipped = 0, duplicates = 0;

  for (const txn of transactions) {
    try {
      // Use ON CONFLICT for duplicate detection (prevents race conditions)
      const result = await client.query(`
        INSERT INTO sp_v2_transactions
        (transaction_id, merchant_id, gateway_ref, utr, amount_paise, gross_amount_paise, currency, payment_method, status,
         transaction_date, transaction_timestamp, source_type, source_name, upload_session_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (transaction_id, merchant_id, source_type) DO NOTHING
        RETURNING id
      `, [
        txn.pgw_ref, txn.merchant_id, txn.pgw_ref, txn.utr, txn.amount_paise, txn.gross_amount_paise,
        txn.currency, txn.payment_mode, txn.status,
        new Date(), new Date(), 'MANUAL_UPLOAD', 'manual_upload', uploadSessionId
      ]);

      if (result.rowCount > 0) {
        inserted++;
      } else {
        duplicates++;
      }
    } catch (error) {
      console.error(`[V2 Upload] Error inserting transaction ${txn.pgw_ref}:`, error.message);
      console.error(`[V2 Upload] Transaction data:`, JSON.stringify(txn));
      skipped++;
    }
  }

  log(`✅ [V2 Upload Session] Transactions - Inserted: ${inserted}, Skipped: ${skipped}, Duplicates: ${duplicates}`);
  return { inserted, skipped, duplicates };
}

// Insert bank statements into V2 database (original - for backward compatibility)
async function insertBankStatements(statements) {
  const client = await pool.connect();
  let inserted = 0, skipped = 0, duplicates = 0;

  try {
    await client.query('BEGIN');

    for (const stmt of statements) {
      try {
        // Check for duplicates by UTR and bank
        const existing = await client.query(
          'SELECT id FROM sp_v2_bank_statements WHERE utr = $1 AND bank_name = $2',
          [stmt.utr, stmt.acquirer]
        );

        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }

        // Insert bank statement into sp_v2_bank_statements
        await client.query(`
          INSERT INTO sp_v2_bank_statements
          (bank_ref, bank_name, utr, amount_paise, gross_amount_paise, bank_fee_paise, bank_gst_paise,
           transaction_date, value_date, source_type, source_file, debit_credit)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          stmt.bank_reference || stmt.id,
          stmt.acquirer,
          stmt.utr,
          stmt.amount_paise,
          stmt.gross_amount_paise || stmt.amount_paise,
          stmt.bank_fee_paise || null,
          stmt.bank_gst_paise || null,
          stmt.credited_at,
          stmt.cycle_date,
          'MANUAL_UPLOAD',
          'manual_upload',
          'CREDIT'
        ]);

        inserted++;
      } catch (error) {
        console.error('Error inserting bank statement:', error);
        skipped++;
      }
    }

    await client.query('COMMIT');
    log(`✅ [V2 Upload] Bank Statements - Inserted: ${inserted}, Skipped: ${skipped}, Duplicates: ${duplicates}`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { inserted, skipped, duplicates };
}

// Insert bank statements with session tracking (NEW - atomic version)
async function insertBankStatementsWithSession(statements, uploadSessionId, client) {
  let inserted = 0, skipped = 0, duplicates = 0;

  for (const stmt of statements) {
    try {
      // Use INSERT with duplicate check (bank statements don't have UNIQUE constraint yet)
      // Check for duplicates first
      const existing = await client.query(
        'SELECT id FROM sp_v2_bank_statements WHERE utr = $1 AND bank_name = $2',
        [stmt.utr, stmt.acquirer]
      );

      if (existing.rows.length > 0) {
        duplicates++;
        continue;
      }

      // Insert bank statement with upload_session_id
      await client.query(`
        INSERT INTO sp_v2_bank_statements
        (bank_ref, bank_name, utr, amount_paise, gross_amount_paise, bank_fee_paise, bank_gst_paise,
         transaction_date, value_date, source_type, source_file, debit_credit)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        stmt.bank_reference || stmt.id,
        stmt.acquirer,
        stmt.utr,
        stmt.amount_paise,
        stmt.gross_amount_paise || stmt.amount_paise,
        stmt.bank_fee_paise || null,
        stmt.bank_gst_paise || null,
        stmt.credited_at,
        stmt.cycle_date,
        'MANUAL_UPLOAD',
        'manual_upload',
        'CREDIT'
      ]);

      inserted++;
    } catch (error) {
      console.error('Error inserting bank statement:', error);
      skipped++;
    }
  }

  log(`✅ [V2 Upload Session] Bank Statements - Inserted: ${inserted}, Skipped: ${skipped}, Duplicates: ${duplicates}`);
  return { inserted, skipped, duplicates };
}

// Get upload statistics
app.get('/api/upload/stats', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const [txnResult, bankResult] = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM sp_v2_transactions'),
      client.query('SELECT COUNT(*) as count FROM sp_v2_bank_statements')
    ]);

    client.release();

    res.json({
      transactions: parseInt(txnResult.rows[0].count),
      bank_statements: parseInt(bankResult.rows[0].count),
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Health check with database connectivity test
// createHealthCheckEndpoint(app, 'v2-file-upload', pool);
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'v2-file-upload' }));

app.listen(PORT, () => {
  log(`🚀 [V2 Upload Service] Running on port ${PORT}`);
  log(`📁 Multiple file upload: POST http://localhost:${PORT}/api/upload/multiple`);
  log(`📄 Single file upload: POST http://localhost:${PORT}/api/upload/single`);
});

module.exports = app;