const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { Pool } = require('pg');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5107;

// Database connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

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
    console.log('📁 [V2 Upload] Received files:', req.files?.map(f => f.originalname));
    
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

// Single File Upload with Type Detection
app.post('/api/upload/single', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { fileType = 'auto-detect', preview = 'true' } = req.body;
    
    console.log(`📄 [V2 Upload] Processing: ${req.file.originalname} as ${fileType}`);
    
    const result = await processFile(req.file, fileType, preview === 'true');
    
    // Clean up
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting file:', err);
    });

    res.json({
      success: true,
      filename: req.file.originalname,
      ...result
    });

  } catch (error) {
    console.error('❌ [V2 Upload] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// File processing function with V2 database integration
async function processFile(file, fileType, includePreview = true) {
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

  console.log(`📊 [V2 Upload] Parsed ${data.length} rows from ${file.originalname}`);

  // Auto-detect file type based on columns
  const detectedType = fileType === 'auto-detect' ? detectFileType(data[0]) : fileType;
  
  // Validate and process data
  const { validRecords, errors } = validateData(data, detectedType);
  
  // Insert into V2 database
  let insertResult;
  if (validRecords.length > 0) {
    if (detectedType === 'transactions' || detectedType === 'pg_data') {
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
      if (fileType === 'transactions') {
        const validated = validateTransaction(row, index + 1);
        if (validated) validRecords.push(validated);
      } else if (fileType === 'bank_statements') {
        const validated = validateBankStatement(row, index + 1);
        if (validated) validRecords.push(validated);
      }
    } catch (error) {
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
  const requiredFields = ['transaction_id', 'amount'];
  const missing = requiredFields.filter(field => !row[field] && !findColumnVariant(row, field));
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  // Map common column variations
  const txnId = row.transaction_id || row.txn_id || row.pgw_ref || row.gateway_ref;
  const amount = parseFloat(row.amount || row.amount_paise || row.gross_amount);
  
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Invalid amount');
  }

  return {
    id: uuidv4(),
    merchant_id: row.merchant_id || 'UNKNOWN',
    pgw_ref: txnId,
    utr: row.utr || null,
    amount_paise: Math.round(amount * 100), // Convert to paise
    currency: row.currency || 'INR',
    payment_mode: row.payment_mode || row.payment_method || 'UPI',
    status: row.status || 'SUCCESS',
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
  const requiredFields = ['utr', 'amount'];
  const missing = requiredFields.filter(field => !row[field] && !findColumnVariant(row, field));
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  const amount = parseFloat(row.amount || row.amount_paise || row.credited_amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Invalid amount');
  }

  return {
    id: uuidv4(),
    acquirer: row.bank_name || row.acquirer || 'UNKNOWN',
    utr: row.utr,
    amount_paise: Math.round(amount * 100),
    credited_at: new Date(row.credited_at || row.transaction_date || new Date()),
    cycle_date: new Date(row.cycle_date || row.transaction_date || new Date()),
    bank_reference: row.bank_ref || row.bank_reference || null,
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

// Insert transactions into V2 database
async function insertTransactions(transactions) {
  const client = await pool.connect();
  let inserted = 0, skipped = 0, duplicates = 0;

  try {
    await client.query('BEGIN');

    for (const txn of transactions) {
      try {
        // Check for duplicates
        const existing = await client.query(
          'SELECT id FROM sp_v2_transactions_v1 WHERE pgw_ref = $1',
          [txn.pgw_ref]
        );

        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }

        // Insert transaction
        await client.query(`
          INSERT INTO sp_v2_transactions_v1 
          (id, merchant_id, pgw_ref, utr, amount_paise, currency, payment_mode, status, customer_email, customer_phone, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          txn.id, txn.merchant_id, txn.pgw_ref, txn.utr, txn.amount_paise,
          txn.currency, txn.payment_mode, txn.status, txn.customer_email, txn.customer_phone,
          JSON.stringify(txn.metadata)
        ]);

        inserted++;
      } catch (error) {
        console.error('Error inserting transaction:', error);
        skipped++;
      }
    }

    await client.query('COMMIT');
    console.log(`✅ [V2 Upload] Transactions - Inserted: ${inserted}, Skipped: ${skipped}, Duplicates: ${duplicates}`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { inserted, skipped, duplicates };
}

// Insert bank statements into V2 database
async function insertBankStatements(statements) {
  const client = await pool.connect();
  let inserted = 0, skipped = 0, duplicates = 0;

  try {
    await client.query('BEGIN');

    for (const stmt of statements) {
      try {
        // Check for duplicates
        const existing = await client.query(
          'SELECT id FROM sp_v2_utr_credits WHERE acquirer = $1 AND utr = $2',
          [stmt.acquirer, stmt.utr]
        );

        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }

        // Insert bank statement
        await client.query(`
          INSERT INTO sp_v2_utr_credits 
          (id, acquirer, utr, amount_paise, credited_at, cycle_date, bank_reference, raw_data)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          stmt.id, stmt.acquirer, stmt.utr, stmt.amount_paise, stmt.credited_at,
          stmt.cycle_date, stmt.bank_reference, JSON.stringify(stmt.raw_data)
        ]);

        inserted++;
      } catch (error) {
        console.error('Error inserting bank statement:', error);
        skipped++;
      }
    }

    await client.query('COMMIT');
    console.log(`✅ [V2 Upload] Bank Statements - Inserted: ${inserted}, Skipped: ${skipped}, Duplicates: ${duplicates}`);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { inserted, skipped, duplicates };
}

// Get upload statistics
app.get('/api/upload/stats', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const [txnResult, bankResult] = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM sp_v2_transactions_v1'),
      client.query('SELECT COUNT(*) as count FROM sp_v2_utr_credits')
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'v2-file-upload',
    timestamp: new Date().toISOString() 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 [V2 Upload Service] Running on port ${PORT}`);
  console.log(`📁 Multiple file upload: POST http://localhost:${PORT}/api/upload/multiple`);
  console.log(`📄 Single file upload: POST http://localhost:${PORT}/api/upload/single`);
});

module.exports = app;