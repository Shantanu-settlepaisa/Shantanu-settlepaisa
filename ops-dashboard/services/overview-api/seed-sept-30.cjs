const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

const MERCHANTS = ['MERCH001', 'MERCH002', 'MERCH003'];
const BANKS = ['AXIS', 'HDFC', 'ICICI', 'SBI'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount() {
  return Math.floor(Math.random() * (1000000 - 10000) + 10000);
}

async function seedSept30() {
  console.log('🌱 Creating Sept 30 data...\n');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const date = new Date(2025, 8, 30); // Sept 30
    const dateStr = '2025-09-30';
    const volume = 24; // Similar to other weekend days
    const matchedCount = 22; // ~92% match rate
    const unmatchedCount = volume - matchedCount;
    
    console.log(`📆 Creating ${volume} transactions for Sept 30 (${matchedCount} matched, ${unmatchedCount} exceptions)`);
    
    for (let i = 1; i <= volume; i++) {
      const txnId = `TXN${dateStr.replace(/-/g, '')}${String(i).padStart(3, '0')}`;
      const merchant = randomItem(MERCHANTS);
      const amount = randomAmount();
      const bank = randomItem(BANKS);
      const utr = `UTR${dateStr.replace(/-/g, '')}${String(i).padStart(3, '0')}`;
      
      const hour = Math.floor(Math.random() * 10) + 10;
      const minute = Math.floor(Math.random() * 60);
      const timestamp = new Date(2025, 8, 30, hour, minute, 0);
      
      const isMatched = i <= matchedCount;
      const status = isMatched ? 'RECONCILED' : 'EXCEPTION';
      
      // Insert transaction
      await client.query(`
        INSERT INTO sp_v2_transactions (
          transaction_id, merchant_id, amount_paise, currency,
          transaction_date, transaction_timestamp, source_type, source_name,
          payment_method, utr, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        txnId, merchant, amount, 'INR', dateStr, timestamp.toISOString(),
        'CONNECTOR', 'HISTORICAL_SEED', 'UPI', utr, status,
        timestamp.toISOString(), timestamp.toISOString()
      ]);
      
      // If matched, create bank statement
      if (isMatched) {
        const bankRef = `BANK${dateStr.replace(/-/g, '')}${String(i).padStart(3, '0')}`;
        await client.query(`
          INSERT INTO sp_v2_bank_statements (
            bank_ref, bank_name, amount_paise, transaction_date, value_date,
            utr, remarks, debit_credit, source_type, source_file, processed, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          bankRef, bank, amount, dateStr, dateStr, utr,
          'Historical settlement', 'CREDIT', 'SFTP_CONNECTOR',
          `HISTORICAL_${dateStr}.csv`, true, timestamp.toISOString()
        ]);
      }
    }
    
    await client.query('COMMIT');
    console.log('✅ Sept 30 data created!');
    console.log(`   ${matchedCount} matched, ${unmatchedCount} exceptions\n`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedSept30();
