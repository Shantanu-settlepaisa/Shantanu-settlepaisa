// Demo seed to ensure exceptions show up in reconciliation results
// Only runs when DEMO_SEED_EXCEPTIONS=1

function seedDemoExceptions(jobId, sourceType = 'manual') {
  if (process.env.DEMO_SEED_EXCEPTIONS !== '1') {
    return [];
  }
  
  console.log('[Demo Seed] Adding exception records for job:', jobId);
  
  const exceptionRecords = [
    {
      id: `${jobId}-exc-1`,
      jobId,
      txnId: 'TXN_EXC_001',
      utr: '', // Missing UTR
      rrn: 'RRN_EXC_001',
      pgAmountPaise: '250000', // 2500 rupees
      bankAmountPaise: null,
      deltaPaise: '250000',
      pgDate: new Date().toISOString().split('T')[0],
      bankDate: null,
      status: 'EXCEPTION',
      reasonCode: 'MISSING_UTR',
      reasonLabel: 'UTR not found in bank records',
      sourceType
    },
    {
      id: `${jobId}-exc-2`,
      jobId,
      txnId: 'TXN_EXC_002',
      utr: 'UTR_DUP_001',
      rrn: 'RRN_EXC_002',
      pgAmountPaise: '150000', // 1500 rupees
      bankAmountPaise: '150000',
      deltaPaise: '0',
      pgDate: new Date().toISOString().split('T')[0],
      bankDate: new Date().toISOString().split('T')[0],
      status: 'EXCEPTION',
      reasonCode: 'DUPLICATE_UTR',
      reasonLabel: 'Duplicate UTR found in multiple transactions',
      sourceType
    },
    {
      id: `${jobId}-exc-3`,
      jobId,
      txnId: 'TXN_EXC_003',
      utr: 'UTR_EXC_003',
      rrn: 'RRN_EXC_003',
      pgAmountPaise: '500000', // 5000 rupees
      bankAmountPaise: '495000', // 4950 rupees - mismatch
      deltaPaise: '5000', // 50 rupees difference
      pgDate: new Date().toISOString().split('T')[0],
      bankDate: new Date().toISOString().split('T')[0],
      status: 'EXCEPTION',
      reasonCode: 'AMOUNT_MISMATCH',
      reasonLabel: 'Amount mismatch between PG and Bank',
      sourceType
    },
    {
      id: `${jobId}-exc-4`,
      jobId,
      txnId: 'TXN_EXC_004',
      utr: 'UTR_EXC_004',
      rrn: 'RRN_EXC_004',
      pgAmountPaise: '100000', // 1000 rupees
      bankAmountPaise: '100000',
      deltaPaise: '0',
      pgDate: new Date().toISOString().split('T')[0],
      bankDate: new Date(Date.now() - 86400000).toISOString().split('T')[0], // 1 day diff
      status: 'EXCEPTION',
      reasonCode: 'DATE_MISMATCH',
      reasonLabel: 'Transaction date mismatch',
      sourceType
    },
    {
      id: `${jobId}-exc-5`,
      jobId,
      txnId: 'TXN_EXC_005',
      utr: 'UTR_EXC_005',
      rrn: 'RRN_EXC_005',
      pgAmountPaise: '300000', // 3000 rupees
      bankAmountPaise: '305000', // 3050 rupees - bank has more
      deltaPaise: '-5000', // -50 rupees difference
      pgDate: new Date().toISOString().split('T')[0],
      bankDate: new Date().toISOString().split('T')[0],
      status: 'EXCEPTION',
      reasonCode: 'AMOUNT_MISMATCH',
      reasonLabel: 'Bank amount exceeds PG amount',
      sourceType
    },
    {
      id: `${jobId}-exc-6`,
      jobId,
      txnId: 'TXN_EXC_006',
      utr: 'UTR_DUP_001', // Same UTR as TXN_EXC_002
      rrn: 'RRN_EXC_006',
      pgAmountPaise: '75000', // 750 rupees
      bankAmountPaise: '75000',
      deltaPaise: '0',
      pgDate: new Date().toISOString().split('T')[0],
      bankDate: new Date().toISOString().split('T')[0],
      status: 'EXCEPTION',
      reasonCode: 'DUPLICATE_UTR',
      reasonLabel: 'Duplicate UTR found in multiple transactions',
      sourceType
    }
  ];
  
  console.log(`[Demo Seed] Added ${exceptionRecords.length} exception records`);
  return exceptionRecords;
}

module.exports = { seedDemoExceptions };