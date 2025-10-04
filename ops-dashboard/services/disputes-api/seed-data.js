const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'settlepaisa123',
  database: 'settlepaisa_v2'
});

async function seedChargebacks() {
  console.log('🌱 Seeding chargeback data...');

  const merchants = [
    { id: 'MERCH_001', name: 'Flipkart' },
    { id: 'MERCH_002', name: 'Amazon India' },
    { id: 'MERCH_003', name: 'Myntra' }
  ];

  const acquirers = ['VISA', 'MASTERCARD', 'RUPAY', 'PAYTM', 'PHONEPE'];
  
  const reasonCodes = [
    { code: '10.4', desc: 'Fraudulent Transaction - Card Not Present', category: 'FRAUD' },
    { code: '13.1', desc: 'Merchandise Not Received', category: 'NON_RECEIPT' },
    { code: '13.3', desc: 'Not as Described', category: 'QUALITY' },
    { code: '11.1', desc: 'Card Recovery Bulletin', category: 'AUTHORIZATION' },
    { code: '4853', desc: 'Cardholder Dispute', category: 'QUALITY' }
  ];

  const stages = [
    { stage: 'NEW', status: 'OPEN', outcome: 'PENDING', count: 8 },
    { stage: 'UNDER_REVIEW', status: 'OPEN', outcome: 'PENDING', count: 12 },
    { stage: 'REPRESENTMENT', status: 'OPEN', outcome: 'PENDING', count: 3 },
    { stage: 'PRE_ARBIT', status: 'OPEN', outcome: 'PENDING', count: 5 },
    { stage: 'CLOSED', status: 'RECOVERED', outcome: 'WON', count: 15 },
    { stage: 'CLOSED', status: 'WRITEOFF', outcome: 'LOST', count: 7 },
    { stage: 'CLOSED', status: 'WRITEOFF', outcome: 'PARTIAL', count: 2 }
  ];

  let totalInserted = 0;

  for (const stageConfig of stages) {
    for (let i = 0; i < stageConfig.count; i++) {
      const merchant = merchants[Math.floor(Math.random() * merchants.length)];
      const acquirer = acquirers[Math.floor(Math.random() * acquirers.length)];
      const reasonCode = reasonCodes[Math.floor(Math.random() * reasonCodes.length)];

      const daysAgo = Math.floor(Math.random() * 45);
      const receivedAt = new Date();
      receivedAt.setDate(receivedAt.getDate() - daysAgo);

      const evidenceDueDays = Math.floor(Math.random() * 3) + 7;
      const evidenceDueAt = new Date(receivedAt);
      evidenceDueAt.setDate(evidenceDueAt.getDate() + evidenceDueDays);

      let closedAt = null;
      if (stageConfig.stage === 'CLOSED') {
        closedAt = new Date(receivedAt);
        closedAt.setDate(closedAt.getDate() + Math.floor(Math.random() * 15) + evidenceDueDays);
      }

      const chargebackId = uuidv4();
      const networkCaseId = `CB${new Date().getFullYear()}${String(totalInserted + 1).padStart(6, '0')}`;
      const caseRef = `${acquirer}-${new Date().getFullYear()}-${String(totalInserted + 1).padStart(3, '0')}-${chargebackId.substring(0, 8)}`;
      const amount = Math.floor(Math.random() * 4990000) + 10000; // ₹100 to ₹50,000

      await pool.query(`
        INSERT INTO sp_v2_chargebacks (
          id, merchant_id, merchant_name, acquirer, network_case_id, case_ref,
          txn_ref, rrn, utr,
          original_gross_paise, chargeback_paise, fees_paise,
          recovered_paise, writeoff_paise,
          reason_code, reason_description,
          stage, status, outcome,
          assigned_to, assigned_team,
          received_at, evidence_due_at, deadline_at, closed_at,
          source_system, created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
        )
      `, [
        chargebackId,
        merchant.id,
        merchant.name,
        acquirer,
        networkCaseId,
        caseRef,
        `TXN${Date.now()}${totalInserted}`,
        Math.random() > 0.3 ? `RRN${Math.floor(Math.random() * 900000000) + 100000000}` : null,
        acquirer === 'PAYTM' || acquirer === 'PHONEPE' ? `UTR${Math.floor(Math.random() * 900000000) + 100000000}` : null,
        amount,
        amount,
        5000,
        stageConfig.status === 'RECOVERED' ? amount : 0,
        stageConfig.status === 'WRITEOFF' ? amount : 0,
        reasonCode.code,
        reasonCode.desc,
        stageConfig.stage,
        stageConfig.status,
        stageConfig.outcome,
        Math.random() > 0.5 ? `user_${Math.floor(Math.random() * 5) + 1}` : null,
        Math.random() > 0.5 ? 'OPS' : null,
        receivedAt,
        evidenceDueAt,
        evidenceDueAt,
        closedAt,
        'SEED_DATA',
        'SYSTEM',
        'SYSTEM'
      ]);

      totalInserted++;
    }
  }

  console.log(`✅ Inserted ${totalInserted} chargebacks`);
  await pool.end();
}

seedChargebacks().catch(console.error);
