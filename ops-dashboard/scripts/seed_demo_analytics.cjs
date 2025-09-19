const { randomUUID } = require('crypto');
const dayjs = require('dayjs');

const SEED_DAYS = 60;
const SEED_RUN_ID = 'demo-v1';
const MERCHANTS = ['m_demo_01'];
const ACQUIRERS = ['axis', 'hdfc', 'sbi'];
const MODES = [
  { mode: 'UPI', share: 0.55, avg: 7000 },
  { mode: 'CARD', share: 0.25, avg: 22000 },
  { mode: 'NETBANKING', share: 0.12, avg: 16000 },
  { mode: 'WALLET', share: 0.06, avg: 5000 },
  { mode: 'QR', share: 0.02, avg: 3000 },
];

// Weighted mode picker
function pickMode() {
  const rand = Math.random();
  let cumulative = 0;
  for (const mode of MODES) {
    cumulative += mode.share;
    if (rand < cumulative) return mode;
  }
  return MODES[MODES.length - 1];
}

// Log-normal-ish amount sampler
function sampleAmount(avg) {
  const variance = avg * 0.4;
  const gaussian = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };
  const sample = Math.max(100, Math.round(avg + variance * gaussian()));
  return sample;
}

// Weighted recon status picker
function pickReconStatus() {
  const rand = Math.random();
  if (rand < 0.80) return 'MATCHED';
  if (rand < 0.88) return 'UNMATCHED_PG';
  if (rand < 0.95) return 'UNMATCHED_BANK';
  return 'EXCEPTION';
}

// Settlement lag picker (T+1, T+2, T+3+)
function pickLagDays() {
  const rand = Math.random();
  if (rand < 0.75) return 1; // T+1 (75%)
  if (rand < 0.95) return 2; // T+2 (20%)
  return Math.floor(3 + Math.random() * 4); // T+3 to T+6 (5%)
}

// Reason code picker for exceptions
function pickReason(status) {
  if (status !== 'EXCEPTION') return null;
  const reasons = ['MISSING_UTR', 'AMOUNT_MISMATCH', 'BANK_DELAY', 'FILE_MISSING'];
  return reasons[Math.floor(Math.random() * reasons.length)];
}

async function createTables(client) {
  // Create transactions table
  await client.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id              UUID PRIMARY KEY,
      merchant_id     TEXT NOT NULL,
      acquirer_id     TEXT NOT NULL,
      payment_mode    TEXT NOT NULL,
      txn_date        DATE NOT NULL,
      amount_paise    BIGINT NOT NULL,
      utr             TEXT,
      rrn             TEXT,
      status          TEXT NOT NULL,
      seed_run_id     TEXT,
      created_at      TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  // Create settlements table
  await client.query(`
    CREATE TABLE IF NOT EXISTS settlements (
      id              UUID PRIMARY KEY,
      txn_id          UUID REFERENCES transactions(id),
      settlement_date DATE NOT NULL,
      amount_paise    BIGINT NOT NULL,
      seed_run_id     TEXT
    )
  `);

  // Create reconciliation_results table
  await client.query(`
    CREATE TABLE IF NOT EXISTS reconciliation_results (
      id              UUID PRIMARY KEY,
      txn_id          UUID REFERENCES transactions(id),
      source_type     TEXT NOT NULL,
      status          TEXT NOT NULL,
      reason_code     TEXT,
      amount_paise    BIGINT NOT NULL,
      cycle_date      DATE NOT NULL,
      seed_run_id     TEXT
    )
  `);

  // Create indices for performance
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(txn_date);
    CREATE INDEX IF NOT EXISTS idx_settle_date ON settlements(settlement_date);
    CREATE INDEX IF NOT EXISTS idx_recon_cycle ON reconciliation_results(cycle_date);
    CREATE INDEX IF NOT EXISTS idx_txn_mode ON transactions(payment_mode);
  `);
}

async function main() {
  // Check environment flag
  if (process.env.DEMO_SEED !== '1') {
    console.log('Skipping seed: DEMO_SEED != 1');
    return;
  }

  // For demo, use a simple SQLite-like in-memory approach or connect to actual DB
  // Since we don't have a real PostgreSQL setup, we'll create mock data files
  const fs = require('fs');
  const path = require('path');
  
  const dataDir = path.join(__dirname, '..', 'mock-data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const transactions = [];
  const settlements = [];
  const reconciliations = [];

  const from = dayjs().subtract(SEED_DAYS, 'day').startOf('day');
  const to = dayjs().endOf('day');

  console.log(`Seeding demo data for ${SEED_DAYS} days...`);
  console.log(`From: ${from.format('YYYY-MM-DD')} To: ${to.format('YYYY-MM-DD')}`);

  for (let d = SEED_DAYS; d >= 0; d--) {
    const day = dayjs().subtract(d, 'day');
    const dayStr = day.format('YYYY-MM-DD');
    
    // Volume per day with weekday/weekend modulation
    const base = 300 + Math.floor(Math.random() * 120);
    const isWeekend = [0, 6].includes(day.day());
    const count = Math.round(base * (isWeekend ? 0.8 : 1.1));

    for (let i = 0; i < count; i++) {
      const mode = pickMode();
      const amount = sampleAmount(mode.avg);
      const merchant = MERCHANTS[0];
      const acquirer = ACQUIRERS[Math.floor(Math.random() * ACQUIRERS.length)];
      const txnId = randomUUID();
      
      // Generate UTR and RRN for some transactions
      const utr = mode.mode === 'UPI' ? `UTR${Date.now()}${Math.floor(Math.random() * 10000)}` : null;
      const rrn = `RRN${Date.now()}${Math.floor(Math.random() * 10000)}`;

      // Transaction record
      transactions.push({
        id: txnId,
        merchant_id: merchant,
        acquirer_id: acquirer,
        payment_mode: mode.mode,
        txn_date: dayStr,
        amount_paise: amount,
        utr: utr,
        rrn: rrn,
        status: 'CAPTURED',
        seed_run_id: SEED_RUN_ID,
        created_at: day.toISOString()
      });

      // Reconciliation outcome
      const reconStatus = pickReconStatus();
      const reason = pickReason(reconStatus);
      reconciliations.push({
        id: randomUUID(),
        txn_id: txnId,
        source_type: Math.random() > 0.3 ? 'connector' : 'manual',
        status: reconStatus,
        reason_code: reason,
        amount_paise: amount,
        cycle_date: dayStr,
        seed_run_id: SEED_RUN_ID
      });

      // Settlement (90% of transactions settle)
      const willSettle = Math.random() > 0.10;
      if (willSettle && d > 0) { // Don't settle today's transactions
        const lag = pickLagDays();
        const settlementDate = day.add(lag, 'day');
        
        // Only add settlement if date is not in future
        if (settlementDate.isBefore(dayjs()) || settlementDate.isSame(dayjs(), 'day')) {
          settlements.push({
            id: randomUUID(),
            txn_id: txnId,
            settlement_date: settlementDate.format('YYYY-MM-DD'),
            amount_paise: amount,
            seed_run_id: SEED_RUN_ID
          });
        }
      }
    }
  }

  // Save to JSON files for mock API to use
  fs.writeFileSync(
    path.join(dataDir, 'transactions.json'),
    JSON.stringify(transactions, null, 2)
  );
  fs.writeFileSync(
    path.join(dataDir, 'settlements.json'),
    JSON.stringify(settlements, null, 2)
  );
  fs.writeFileSync(
    path.join(dataDir, 'reconciliations.json'),
    JSON.stringify(reconciliations, null, 2)
  );

  console.log(`✅ Seeded ${transactions.length} transactions`);
  console.log(`✅ Seeded ${settlements.length} settlements`);
  console.log(`✅ Seeded ${reconciliations.length} reconciliation results`);
  
  // Calculate and display stats
  const modeStats = {};
  transactions.forEach(t => {
    if (!modeStats[t.payment_mode]) {
      modeStats[t.payment_mode] = { count: 0, amount: 0 };
    }
    modeStats[t.payment_mode].count++;
    modeStats[t.payment_mode].amount += t.amount_paise;
  });
  
  console.log('\n📊 Mode Distribution:');
  Object.entries(modeStats).forEach(([mode, stats]) => {
    const pct = ((stats.count / transactions.length) * 100).toFixed(1);
    const avgTicket = Math.round(stats.amount / stats.count / 100);
    console.log(`  ${mode}: ${pct}% (${stats.count} txns, avg ₹${avgTicket})`);
  });
  
  const settlementRate = ((settlements.length / transactions.length) * 100).toFixed(1);
  console.log(`\n💰 Settlement Rate: ${settlementRate}%`);
  
  const reconStats = {};
  reconciliations.forEach(r => {
    reconStats[r.status] = (reconStats[r.status] || 0) + 1;
  });
  
  console.log('\n🔍 Reconciliation Status Distribution:');
  Object.entries(reconStats).forEach(([status, count]) => {
    const pct = ((count / reconciliations.length) * 100).toFixed(1);
    console.log(`  ${status}: ${pct}% (${count} txns)`);
  });
}

main().catch(e => {
  console.error('Seed error:', e);
  process.exit(1);
});