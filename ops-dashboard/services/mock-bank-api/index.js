const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const seedrandom = require('seedrandom');

const app = express();
const PORT = process.env.PORT || 5102;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Generate deterministic bank reconciliation data
function generateBankRecon(bank, cycle, seed = 'settlepaisa-bank') {
  const rng = seedrandom(`${bank}-${cycle}-${seed}`);
  const records = [];
  const cycleDate = cycle.replace(/-/g, '');
  
  // Fixed amounts that match PG data (in paise)
  const matchingAmounts = [
    150000, 250000, 350000, 450000, 550000,
    650000, 750000, 850000, 950000, 1050000
  ];
  
  // Generate 20 records total for realistic demo
  // First 10: Perfect matches with PG
  for (let i = 1; i <= 10; i++) {
    records.push({
      TRANSACTION_ID: `TXN${cycleDate}${String(i).padStart(3, '0')}`,
      UTR: `UTR${cycleDate}${String(i).padStart(3, '0')}`,
      AMOUNT: matchingAmounts[i - 1],
      DATE: cycle
    });
  }
  
  // Next 5: Amount mismatches (same UTR, different amount)
  for (let i = 11; i <= 15; i++) {
    records.push({
      TRANSACTION_ID: `TXN${cycleDate}${String(i).padStart(3, '0')}`,
      UTR: `UTR${cycleDate}${String(i).padStart(3, '0')}`,
      AMOUNT: matchingAmounts[(i - 11) % 5] - 500, // Slightly less than PG amount
      DATE: cycle
    });
  }
  
  // Last 5: Unmatched bank records (no corresponding PG)
  for (let i = 26; i <= 30; i++) {
    records.push({
      TRANSACTION_ID: `TXN${cycleDate}${String(i).padStart(3, '0')}`,
      UTR: `UTR${cycleDate}${String(i).padStart(3, '0')}`,
      AMOUNT: Math.floor(200000 + rng() * 800000),
      DATE: cycle
    });
  }
  
  return records;
}

// AXIS Bank reconciliation endpoint
app.get('/api/bank/axis/recon', (req, res) => {
  const { cycle } = req.query;
  
  if (!cycle) {
    return res.status(400).json({ error: 'Cycle parameter required' });
  }
  
  const records = generateBankRecon('axis', cycle);
  
  console.log(`[Mock Bank API] Returning ${records.length} AXIS records for cycle ${cycle}`);
  
  res.json({
    bank: 'AXIS',
    cycle,
    count: records.length,
    records
  });
});

// HDFC Bank reconciliation endpoint
app.get('/api/bank/hdfc/recon', (req, res) => {
  const { cycle } = req.query;
  
  if (!cycle) {
    return res.status(400).json({ error: 'Cycle parameter required' });
  }
  
  const records = generateBankRecon('hdfc', cycle);
  
  // HDFC uses different field names
  const hdfcRecords = records.map(r => ({
    txn_id: r.TRANSACTION_ID,
    utr_number: r.UTR,
    txn_amount: r.AMOUNT,
    txn_date: r.DATE
  }));
  
  console.log(`[Mock Bank API] Returning ${hdfcRecords.length} HDFC records for cycle ${cycle}`);
  
  res.json({
    bank: 'HDFC',
    cycle,
    count: hdfcRecords.length,
    records: hdfcRecords
  });
});

// ICICI Bank reconciliation endpoint
app.get('/api/bank/icici/recon', (req, res) => {
  const { cycle } = req.query;
  
  if (!cycle) {
    return res.status(400).json({ error: 'Cycle parameter required' });
  }
  
  const records = generateBankRecon('icici', cycle);
  
  // ICICI uses different field names
  const iciciRecords = records.map(r => ({
    transaction_ref: r.TRANSACTION_ID,
    bank_utr: r.UTR,
    amount_inr: r.AMOUNT / 100, // ICICI returns in rupees
    value_date: r.DATE
  }));
  
  console.log(`[Mock Bank API] Returning ${iciciRecords.length} ICICI records for cycle ${cycle}`);
  
  res.json({
    bank: 'ICICI',
    cycle,
    count: iciciRecords.length,
    records: iciciRecords
  });
});

// Generic bank endpoint (returns CSV-like structure)
app.get('/api/bank/:bankName/csv', (req, res) => {
  const { bankName } = req.params;
  const { cycle } = req.query;
  
  if (!cycle) {
    return res.status(400).json({ error: 'Cycle parameter required' });
  }
  
  const records = generateBankRecon(bankName, cycle);
  
  // Convert to CSV format
  const headers = Object.keys(records[0]);
  const csv = [
    headers.join(','),
    ...records.map(r => headers.map(h => r[h]).join(','))
  ].join('\n');
  
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', `attachment; filename="${bankName}_RECON_${cycle.replace(/-/g, '')}.csv"`);
  res.send(csv);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'mock-bank-api',
    banks: ['axis', 'hdfc', 'icici']
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Mock Bank API] Server running on port ${PORT}`);
  console.log(`[Mock Bank API] Endpoints:`);
  console.log(`  - GET /api/bank/axis/recon?cycle=YYYY-MM-DD`);
  console.log(`  - GET /api/bank/hdfc/recon?cycle=YYYY-MM-DD`);
  console.log(`  - GET /api/bank/icici/recon?cycle=YYYY-MM-DD`);
  console.log(`  - GET /api/bank/:bank/csv?cycle=YYYY-MM-DD`);
});