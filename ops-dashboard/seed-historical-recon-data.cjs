/**
 * SettlePaisa V2 - Historical Recon Data Seeder
 * 
 * Generates realistic 30-day historical reconciliation data with:
 * - Business logic (weekdays vs weekends)
 * - Varying match rates (80-95%)
 * - Different payment methods
 * - Exception scenarios
 * - Multiple merchants
 * 
 * Date Range: September 1-30, 2025
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123'
});

// Configuration
const MERCHANTS = ['MERCH001', 'MERCH002', 'MERCH003'];
const BANKS = ['AXIS', 'HDFC', 'ICICI', 'SBI'];
const PAYMENT_METHODS = [
  { method: 'UPI', weight: 0.60 },      // 60%
  { method: 'CARD', weight: 0.30 },     // 30%
  { method: 'NETBANKING', weight: 0.10 } // 10%
];

// Helper: Get random item from array
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper: Get weighted random payment method
function getPaymentMethod() {
  const rand = Math.random();
  let cumulative = 0;
  for (const pm of PAYMENT_METHODS) {
    cumulative += pm.weight;
    if (rand < cumulative) return pm.method;
  }
  return 'UPI';
}

// Helper: Generate random amount (₹100 to ₹10,000)
function randomAmount() {
  return Math.floor(Math.random() * (1000000 - 10000) + 10000); // 100 to 10000 rupees in paise
}

// Helper: Check if date is weekend
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

// Helper: Get transaction volume for day
function getVolumeForDay(date, dayIndex) {
  const baseVolume = isWeekend(date) ? 12 : 25; // Weekend: 12, Weekday: 25
  
  // Add slight variation
  const variation = Math.floor(Math.random() * 6) - 3; // -3 to +3
  return Math.max(10, baseVolume + variation);
}

// Helper: Get match rate for day (improves over time)
function getMatchRateForDay(dayIndex) {
  // Start at 80%, improve to 95% over 30 days
  const baseRate = 0.80;
  const improvement = 0.15 * (dayIndex / 30); // Linear improvement
  const dailyVariation = (Math.random() * 0.05) - 0.025; // ±2.5% daily variation
  
  return Math.min(0.95, Math.max(0.78, baseRate + improvement + dailyVariation));
}

// Helper: Generate UTR
function generateUTR(date, index) {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  return `UTR${dateStr}${String(index).padStart(3, '0')}`;
}

// Helper: Generate RRN
function generateRRN(date, index) {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  return `RRN${dateStr}${String(index).padStart(3, '0')}`;
}

// Main seeding function
async function seedHistoricalData() {
  console.log('🌱 Starting historical data seed...\n');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('📅 Generating data for September 1-30, 2025\n');
    
    let totalTransactions = 0;
    let totalMatched = 0;
    let totalExceptions = 0;
    
    // Loop through each day in September
    for (let day = 1; day <= 30; day++) {
      const date = new Date(2025, 8, day); // Month is 0-indexed (8 = September)
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      
      const volume = getVolumeForDay(date, day);
      const matchRate = getMatchRateForDay(day);
      const matchedCount = Math.floor(volume * matchRate);
      const unmatchedCount = volume - matchedCount;
      
      console.log(`📆 ${dateStr} (${dayName}) - Volume: ${volume}, Match Rate: ${(matchRate * 100).toFixed(1)}%`);
      
      // Generate transactions for this day
      const dayTransactions = [];
      const dayBankStatements = [];
      
      for (let i = 1; i <= volume; i++) {
        const txnId = `TXN${dateStr.replace(/-/g, '')}${String(i).padStart(3, '0')}`;
        const merchant = randomItem(MERCHANTS);
        const amount = randomAmount();
        const paymentMethod = getPaymentMethod();
        const bank = randomItem(BANKS);
        const utr = generateUTR(date, i);
        const rrn = paymentMethod === 'UPI' ? generateRRN(date, i) : null;
        
        // Random hour between 10 AM and 8 PM
        const hour = Math.floor(Math.random() * 10) + 10;
        const minute = Math.floor(Math.random() * 60);
        const timestamp = new Date(2025, 8, day, hour, minute, 0);
        
        // Determine if this transaction will be matched
        const isMatched = i <= matchedCount;
        const status = isMatched ? 'RECONCILED' : 'EXCEPTION';
        
        // Insert PG transaction
        const pgResult = await client.query(`
          INSERT INTO sp_v2_transactions (
            transaction_id,
            merchant_id,
            amount_paise,
            currency,
            transaction_date,
            transaction_timestamp,
            source_type,
            source_name,
            payment_method,
            utr,
            rrn,
            status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id
        `, [
          txnId,
          merchant,
          amount,
          'INR',
          dateStr,
          timestamp.toISOString(),
          'CONNECTOR',
          'HISTORICAL_SEED',
          paymentMethod,
          utr,
          rrn,
          status,
          timestamp.toISOString(),
          timestamp.toISOString()
        ]);
        
        const pgId = pgResult.rows[0].id;
        dayTransactions.push({ id: pgId, txnId, utr, amount, isMatched });
        
        // If matched, create corresponding bank statement
        if (isMatched) {
          const bankRef = `BANK${dateStr.replace(/-/g, '')}${String(i).padStart(3, '0')}`;
          
          // Bank amount might have slight variation (sometimes)
          const bankAmount = Math.random() > 0.95 ? amount + (Math.random() > 0.5 ? 100 : -100) : amount;
          
          const bankResult = await client.query(`
            INSERT INTO sp_v2_bank_statements (
              bank_ref,
              bank_name,
              amount_paise,
              transaction_date,
              value_date,
              utr,
              remarks,
              debit_credit,
              source_type,
              source_file,
              processed,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
          `, [
            bankRef,
            bank,
            bankAmount,
            dateStr,
            dateStr,
            utr,
            'Historical settlement',
            'CREDIT',
            'SFTP_CONNECTOR',
            `HISTORICAL_${dateStr}.csv`,
            true,
            timestamp.toISOString()
          ]);
          
          const bankId = bankResult.rows[0].id;
          
          // Skip match record creation due to UUID vs bigint schema mismatch
          // The important part is that PG transaction has status=RECONCILED
          // and bank statement has processed=true
          
          totalMatched++;
        } else {
          // Create unmatched bank statement (about 30% of unmatched have bank record)
          if (Math.random() > 0.7) {
            const bankRef = `BANK${dateStr.replace(/-/g, '')}${String(i).padStart(3, '0')}`;
            const differentUTR = `UTR${dateStr.replace(/-/g, '')}999${String(i).padStart(2, '0')}`;
            
            await client.query(`
              INSERT INTO sp_v2_bank_statements (
                bank_ref,
                bank_name,
                amount_paise,
                transaction_date,
                value_date,
                utr,
                remarks,
                debit_credit,
                source_type,
                source_file,
                processed,
                created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
              bankRef,
              bank,
              amount,
              dateStr,
              dateStr,
              differentUTR, // Different UTR = no match
              'Unmatched payment',
              'CREDIT',
              'SFTP_CONNECTOR',
              `HISTORICAL_${dateStr}.csv`,
              false,
              timestamp.toISOString()
            ]);
          }
          
          totalExceptions++;
        }
        
        totalTransactions++;
      }
      
      console.log(`   ✓ Created ${volume} transactions (${matchedCount} matched, ${unmatchedCount} unmatched)\n`);
    }
    
    await client.query('COMMIT');
    
    console.log('✅ Historical data seeding completed!\n');
    console.log('📊 Summary:');
    console.log(`   Total Transactions: ${totalTransactions}`);
    console.log(`   Total Matched: ${totalMatched} (${((totalMatched/totalTransactions)*100).toFixed(1)}%)`);
    console.log(`   Total Exceptions: ${totalExceptions} (${((totalExceptions/totalTransactions)*100).toFixed(1)}%)`);
    console.log(`   Date Range: 2025-09-01 to 2025-09-30`);
    console.log(`   Days: 30`);
    console.log(`   Merchants: ${MERCHANTS.join(', ')}`);
    console.log(`   Banks: ${BANKS.join(', ')}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Verification function
async function verifyData() {
  console.log('\n🔍 Verifying seeded data...\n');
  
  // Count transactions by date
  const txnsByDate = await pool.query(`
    SELECT 
      transaction_date,
      COUNT(*) as count,
      SUM(CASE WHEN status = 'RECONCILED' THEN 1 ELSE 0 END) as matched,
      SUM(CASE WHEN status = 'EXCEPTION' THEN 1 ELSE 0 END) as exceptions
    FROM sp_v2_transactions
    WHERE transaction_date >= '2025-09-01' AND transaction_date <= '2025-09-30'
    GROUP BY transaction_date
    ORDER BY transaction_date DESC
    LIMIT 10
  `);
  
  console.log('📅 Last 10 Days Summary:');
  console.table(txnsByDate.rows);
  
  // Overall stats
  const overallStats = await pool.query(`
    SELECT 
      COUNT(*) as total_transactions,
      SUM(CASE WHEN status = 'RECONCILED' THEN 1 ELSE 0 END) as reconciled,
      SUM(CASE WHEN status = 'EXCEPTION' THEN 1 ELSE 0 END) as exceptions,
      COUNT(DISTINCT merchant_id) as unique_merchants,
      COUNT(DISTINCT transaction_date) as days_covered
    FROM sp_v2_transactions
    WHERE transaction_date >= '2025-09-01' AND transaction_date <= '2025-09-30'
  `);
  
  console.log('\n📊 Overall Statistics:');
  console.table(overallStats.rows);
  
  // Bank statements
  const bankStats = await pool.query(`
    SELECT 
      COUNT(*) as total_bank_statements,
      SUM(CASE WHEN processed = true THEN 1 ELSE 0 END) as processed,
      SUM(CASE WHEN processed = false THEN 1 ELSE 0 END) as unprocessed
    FROM sp_v2_bank_statements
    WHERE transaction_date >= '2025-09-01' AND transaction_date <= '2025-09-30'
  `);
  
  console.log('\n🏦 Bank Statements:');
  console.table(bankStats.rows);
}

// Main execution
async function main() {
  try {
    await seedHistoricalData();
    await verifyData();
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await pool.end();
  }
}

main();
