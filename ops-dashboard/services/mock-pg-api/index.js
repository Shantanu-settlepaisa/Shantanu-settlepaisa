const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const seedrandom = require('seedrandom');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5101;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory storage for seeded data
const cycleData = new Map();

// Generate deterministic transactions based on seed
function generateTransactions(cycle, seed = 'settlepaisa') {
  const rng = seedrandom(`${cycle}-${seed}`);
  const transactions = [];
  const merchantIds = ['MERCH001', 'MERCH002', 'MERCH003'];
  const paymentMethods = ['UPI', 'CARD', 'NETBANKING', 'WALLET'];
  
  // Generate exactly 25 transactions for better demo
  const cycleDate = cycle.replace(/-/g, '');
  
  // Fixed amounts that will match with bank data (in paise)
  const matchingAmounts = [
    150000, 250000, 350000, 450000, 550000,
    650000, 750000, 850000, 950000, 1050000
  ];
  
  // First 10: Perfect matches with bank
  for (let i = 1; i <= 10; i++) {
    transactions.push({
      transaction_id: `TXN${cycleDate}${String(i).padStart(3, '0')}`,
      rrn: `RRN${cycleDate}${String(i).padStart(3, '0')}`,
      utr: `UTR${cycleDate}${String(i).padStart(3, '0')}`,
      amount: matchingAmounts[i - 1],
      captured_at: `${cycle}T${String(8 + i).padStart(2, '0')}:00:00Z`,
      payment_method: paymentMethods[i % 4],
      bank: 'AXIS',
      merchant_id: merchantIds[i % 3]
    });
  }
  
  // Next 5: Amount mismatches (UTR matches but amount different)
  for (let i = 11; i <= 15; i++) {
    transactions.push({
      transaction_id: `TXN${cycleDate}${String(i).padStart(3, '0')}`,
      rrn: `RRN${cycleDate}${String(i).padStart(3, '0')}`,
      utr: `UTR${cycleDate}${String(i).padStart(3, '0')}`,
      amount: matchingAmounts[(i - 11) % 5] + 10000, // Significant amount difference for exceptions
      captured_at: `${cycle}T${String(8 + i).padStart(2, '0')}:00:00Z`,
      payment_method: paymentMethods[i % 4],
      bank: 'AXIS',
      merchant_id: merchantIds[i % 3]
    });
  }
  
  // Add transactions with missing UTR (will generate exceptions)
  transactions.push({
    transaction_id: `TXN${cycleDate}016`,
    rrn: `RRN${cycleDate}016`,
    utr: '', // Missing UTR
    amount: 350000,
    captured_at: `${cycle}T14:00:00Z`,
    payment_method: 'UPI',
    bank: 'AXIS',
    merchant_id: 'MERCH001'
  });
  
  // Add duplicate UTR transaction (will generate exception)
  transactions.push({
    transaction_id: `TXN${cycleDate}017`,
    rrn: `RRN${cycleDate}017`,
    utr: `UTR${cycleDate}001`, // Duplicate UTR
    amount: 150000,
    captured_at: `${cycle}T14:30:00Z`,
    payment_method: 'UPI',
    bank: 'AXIS',
    merchant_id: 'MERCH001'
  });
  
  // Last 8: No matches in bank (unmatched PG)
  for (let i = 18; i <= 25; i++) {
    transactions.push({
      transaction_id: `TXN${cycleDate}${String(i).padStart(3, '0')}`,
      rrn: `RRN${cycleDate}${String(i).padStart(3, '0')}`,
      utr: `UTR${cycleDate}${String(i).padStart(3, '0')}`,
      amount: Math.floor(100000 + rng() * 900000),
      captured_at: `${cycle}T${String(8 + (i % 12)).padStart(2, '0')}:30:00Z`,
      payment_method: paymentMethods[Math.floor(rng() * 4)],
      bank: 'AXIS',
      merchant_id: merchantIds[Math.floor(rng() * 3)]
    });
  }
  
  return transactions;
}

// Admin endpoint to seed data
app.post('/admin/seed', (req, res) => {
  const { cycle, transactions } = req.body;
  
  if (!cycle) {
    return res.status(400).json({ error: 'Cycle date required' });
  }
  
  // Use provided transactions or generate deterministic ones
  const txns = transactions || generateTransactions(cycle);
  cycleData.set(cycle, txns);
  
  console.log(`[Mock PG API] Seeded ${txns.length} transactions for cycle ${cycle}`);
  
  res.json({ 
    message: 'Data seeded successfully',
    cycle,
    count: txns.length 
  });
});

// API endpoint to get transactions
app.get('/api/pg/transactions', async (req, res) => {
  const { cycle } = req.query;
  
  if (!cycle) {
    return res.status(400).json({ error: 'Cycle parameter required' });
  }
  
  // Try to fetch from database first
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5433,
    database: process.env.DB_NAME || 'settlepaisa_v2',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'settlepaisa123'
  });
  
  try {
    const result = await pool.query(`
      SELECT 
        transaction_id,
        merchant_id,
        amount_paise as amount,
        transaction_date,
        transaction_timestamp as captured_at,
        payment_method,
        utr,
        status
      FROM sp_v2_transactions
      WHERE transaction_date = $1
      ORDER BY transaction_timestamp
    `, [cycle]);
    
    await pool.end();
    
    if (result.rows.length > 0) {
      console.log(`[Mock PG API] Returning ${result.rows.length} transactions from DATABASE for cycle ${cycle}`);
      return res.json({
        cycle,
        count: result.rows.length,
        transactions: result.rows
      });
    }
  } catch (dbError) {
    console.error('[Mock PG API] Database query failed:', dbError.message);
    await pool.end();
  }
  
  // Fallback to mock data if database is empty
  let transactions = cycleData.get(cycle);
  if (!transactions) {
    transactions = generateTransactions(cycle);
    cycleData.set(cycle, transactions);
  }
  
  console.log(`[Mock PG API] Returning ${transactions.length} MOCK transactions for cycle ${cycle}`);
  
  res.json({
    cycle,
    count: transactions.length,
    transactions
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'mock-pg-api',
    cycles: Array.from(cycleData.keys())
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Mock PG API] Server running on port ${PORT}`);
  console.log(`[Mock PG API] Admin endpoint: POST /admin/seed`);
  console.log(`[Mock PG API] API endpoint: GET /api/pg/transactions?cycle=YYYY-MM-DD`);
});