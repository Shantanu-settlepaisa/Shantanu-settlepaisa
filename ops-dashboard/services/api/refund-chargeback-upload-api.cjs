const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { Pool } = require('pg');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5111;

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  port: parseInt(process.env.DB_PORT || '5433'),
});

pool.on('error', (err) => console.error('[Pool Error]', err));

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files allowed'));
    }
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'refund-chargeback-upload-api', port: PORT });
});

/**
 * Upload Refunds CSV
 * CSV Format: transaction_id,refund_amount,refund_type
 */
app.post('/api/refunds/upload', upload.single('file'), async (req, res) => {
  const filePath = req.file?.path;

  if (!filePath) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  console.log(`📁 [Refund Upload] Processing: ${req.file.originalname}`);

  const results = [];
  const successRecords = [];
  const failedRecords = [];

  try {
    // Parse CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`📊 [Refund Upload] Parsed ${results.length} rows`);

    // Process each refund
    for (const row of results) {
      try {
        const { transaction_id, refund_amount, refund_type } = row;

        // Validate required fields
        if (!transaction_id || !refund_amount || !refund_type) {
          failedRecords.push({
            ...row,
            reason: 'Missing required fields (transaction_id, refund_amount, refund_type)'
          });
          continue;
        }

        // Validate refund_type
        if (!['refund', 'chargeback'].includes(refund_type.toLowerCase())) {
          failedRecords.push({
            ...row,
            reason: `Invalid refund_type: ${refund_type}. Must be "refund" or "chargeback"`
          });
          continue;
        }

        // Check if transaction exists
        const txnCheck = await pool.query(
          'SELECT id, merchant_id FROM sp_v2_transactions WHERE transaction_id = $1',
          [transaction_id]
        );

        if (txnCheck.rows.length === 0) {
          failedRecords.push({
            ...row,
            reason: `Transaction ${transaction_id} not found`
          });
          continue;
        }

        // Update transaction with refund data
        const updateResult = await pool.query(
          `UPDATE sp_v2_transactions
           SET refund_amount_paise = $1,
               refund_type = $2,
               refund_date = NOW(),
               is_refund_processed = FALSE,
               updated_at = NOW()
           WHERE transaction_id = $3
           RETURNING id`,
          [parseInt(refund_amount), refund_type.toLowerCase(), transaction_id]
        );

        if (updateResult.rowCount > 0) {
          successRecords.push(row);
          console.log(`   ✅ Updated ${transaction_id} with refund ${refund_amount} paise`);
        } else {
          failedRecords.push({ ...row, reason: 'Update failed' });
        }

      } catch (error) {
        console.error(`   ❌ Error processing ${row.transaction_id}:`, error.message);
        failedRecords.push({ ...row, reason: error.message });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    const response = {
      total: results.length,
      success: successRecords.length,
      failed: failedRecords.length,
      successRecords: successRecords.slice(0, 5), // First 5 for preview
      failedRecords: failedRecords
    };

    console.log(`✅ [Refund Upload] Complete: ${successRecords.length} success, ${failedRecords.length} failed\n`);

    res.json(response);

  } catch (error) {
    console.error('❌ [Refund Upload] Error:', error);
    // Clean up file on error
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Upload Chargebacks CSV
 * CSV Format: transaction_id,merchant_id,chargeback_amount,reason_code,status
 */
app.post('/api/chargebacks/upload', upload.single('file'), async (req, res) => {
  const filePath = req.file?.path;

  if (!filePath) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  console.log(`📁 [Chargeback Upload] Processing: ${req.file.originalname}`);

  const results = [];
  const successRecords = [];
  const failedRecords = [];

  try {
    // Parse CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`📊 [Chargeback Upload] Parsed ${results.length} rows`);

    // Process each chargeback
    for (const row of results) {
      try {
        const { transaction_id, merchant_id, chargeback_amount, reason_code, status } = row;

        // Validate required fields
        if (!transaction_id || !merchant_id || !chargeback_amount || !reason_code || !status) {
          failedRecords.push({
            ...row,
            reason: 'Missing required fields'
          });
          continue;
        }

        // Get transaction details for acquirer and network_case_id
        const txnQuery = await pool.query(
          `SELECT merchant_id, acquirer_code, gateway_ref, amount_paise
           FROM sp_v2_transactions
           WHERE transaction_id = $1`,
          [transaction_id]
        );

        let acquirer = 'MANUAL_ENTRY';
        let original_gross_paise = parseInt(chargeback_amount);

        if (txnQuery.rows.length > 0) {
          acquirer = txnQuery.rows[0].acquirer_code || 'UNKNOWN';
          original_gross_paise = txnQuery.rows[0].amount_paise || parseInt(chargeback_amount);
        }

        // Map status to valid values and set closed_at accordingly
        const validStatus = ['OPEN', 'RECOVERED', 'WRITEOFF'];
        const normalizedStatus = status.toUpperCase() === 'LOST' ? 'WRITEOFF' :
                                 validStatus.includes(status.toUpperCase()) ? status.toUpperCase() : 'OPEN';

        const closed_at = normalizedStatus === 'OPEN' ? null : 'NOW()';

        // Map outcome from status
        const outcome = status.toUpperCase() === 'LOST' ? 'LOST' :
                       status.toUpperCase() === 'WON' ? 'WON' : 'PENDING';

        // Ensure acquirer is valid
        const validAcquirers = ['VISA', 'MASTERCARD', 'RUPAY', 'PAYTM', 'PHONEPE', 'RAZORPAY', 'CASHFREE', 'BANK', 'UPI', 'OTHER'];
        let finalAcquirer = validAcquirers.includes(acquirer.toUpperCase()) ? acquirer.toUpperCase() : 'OTHER';

        // Calculate writeoff and pending based on status
        const chargeback_paise_val = parseInt(chargeback_amount);
        const pending_recovery = normalizedStatus === 'OPEN' ? chargeback_paise_val : 0;
        const writeoff = normalizedStatus === 'WRITEOFF' ? chargeback_paise_val : 0;

        // Insert into chargebacks table
        const insertResult = await pool.query(
          `INSERT INTO sp_v2_chargebacks (
            merchant_id,
            acquirer,
            network_case_id,
            txn_ref,
            original_gross_paise,
            chargeback_paise,
            fees_paise,
            recovered_paise,
            pending_recovery_paise,
            writeoff_paise,
            currency,
            reason_code,
            stage,
            outcome,
            status,
            received_at,
            closed_at,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, 0, 0, $7, $8,
            'INR', $9, 'CLOSED', $10, $11, NOW(), $12, NOW(), NOW()
          ) RETURNING id`,
          [
            merchant_id,
            finalAcquirer,
            `MANUAL_${Date.now()}`, // Generate unique network_case_id
            transaction_id,
            original_gross_paise,
            chargeback_paise_val,
            pending_recovery,
            writeoff,
            reason_code,
            outcome,
            normalizedStatus,
            normalizedStatus === 'OPEN' ? null : new Date()
          ]
        );

        if (insertResult.rowCount > 0) {
          successRecords.push(row);
          console.log(`   ✅ Inserted chargeback for ${transaction_id}: ${chargeback_amount} paise`);
        }

      } catch (error) {
        console.error(`   ❌ Error processing ${row.transaction_id}:`, error.message);
        failedRecords.push({ ...row, reason: error.message });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    const response = {
      total: results.length,
      success: successRecords.length,
      failed: failedRecords.length,
      successRecords: successRecords.slice(0, 5),
      failedRecords: failedRecords
    };

    console.log(`✅ [Chargeback Upload] Complete: ${successRecords.length} success, ${failedRecords.length} failed\n`);

    res.json(response);

  } catch (error) {
    console.error('❌ [Chargeback Upload] Error:', error);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Refund/Chargeback Upload API running on port ${PORT}`);
  console.log(`   POST /api/refunds/upload`);
  console.log(`   POST /api/chargebacks/upload`);
});
