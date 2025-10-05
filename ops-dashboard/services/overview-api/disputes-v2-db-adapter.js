const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'settlepaisa_v2',
  password: process.env.DB_PASSWORD || 'settlepaisa123',
  port: process.env.DB_PORT || 5433,
});

pool.on('connect', () => {
  console.log('[Disputes V2 DB] Connected to settlepaisa_v2 database');
});

pool.on('error', (err) => {
  console.error('[Disputes V2 DB] Unexpected error:', err);
});

async function getDisputesKpis(filters) {
  const { from, to, merchantId, acquirerId } = filters;
  
  let whereConditions = ['received_at >= $1', 'received_at <= $2'];
  let params = [from, to];
  let paramCount = 2;
  
  if (merchantId) {
    paramCount++;
    whereConditions.push(`merchant_id = $${paramCount}`);
    params.push(merchantId);
  }
  
  if (acquirerId) {
    paramCount++;
    whereConditions.push(`acquirer = $${paramCount}`);
    params.push(acquirerId);
  }
  
  const whereClause = whereConditions.join(' AND ');
  
  const query = `
    SELECT 
      COUNT(*) FILTER (WHERE status = 'OPEN') as open_count,
      COUNT(*) FILTER (
        WHERE status = 'OPEN' 
        AND evidence_due_at IS NOT NULL 
        AND evidence_due_at < NOW()
      ) as evidence_required_count,
      COUNT(*) FILTER (WHERE status = 'RECOVERED') as won_count,
      COUNT(*) FILTER (WHERE status = 'WRITEOFF') as lost_count,
      COUNT(*) FILTER (WHERE status IN ('OPEN', 'PENDING')) as pending_count,
      SUM(chargeback_paise)::TEXT as disputed_paise,
      SUM(recovered_paise)::TEXT as recovered_paise,
      SUM(writeoff_paise)::TEXT as written_off_paise,
      COUNT(*) as total_count,
      COALESCE(
        AVG(
          EXTRACT(EPOCH FROM (closed_at - received_at)) / 86400
        ) FILTER (WHERE closed_at IS NOT NULL),
        0
      )::INTEGER as avg_resolution_days
    FROM sp_v2_chargebacks
    WHERE ${whereClause}
  `;
  
  console.log('[Disputes V2 DB] KPIs Query:', { from, to, merchantId, acquirerId });
  
  const result = await pool.query(query, params);
  const row = result.rows[0];
  
  const wonCount = parseInt(row.won_count) || 0;
  const lostCount = parseInt(row.lost_count) || 0;
  const totalResolved = wonCount + lostCount;
  
  return {
    openCount: parseInt(row.open_count) || 0,
    evidenceRequiredCount: parseInt(row.evidence_required_count) || 0,
    pendingCount: parseInt(row.pending_count) || 0,
    wonCount,
    lostCount,
    disputedPaise: row.disputed_paise || '0',
    recoveredPaise: row.recovered_paise || '0',
    writtenOffPaise: row.written_off_paise || '0',
    totalCount: parseInt(row.total_count) || 0,
    avgResolutionDays: parseInt(row.avg_resolution_days) || 0,
    winRatePct: totalResolved > 0 ? Math.round((wonCount / totalResolved) * 100) : 0
  };
}

async function getOutcomeSummary(filters) {
  const { window, merchantId, acquirerId } = filters;
  
  const days = window === '90d' ? 90 : window === '30d' ? 30 : 7;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  let whereConditions = [
    'closed_at IS NOT NULL',
    `closed_at >= $1`,
    `status IN ('RECOVERED', 'WRITEOFF')`
  ];
  let params = [cutoffDate.toISOString()];
  let paramCount = 1;
  
  if (merchantId) {
    paramCount++;
    whereConditions.push(`merchant_id = $${paramCount}`);
    params.push(merchantId);
  }
  
  if (acquirerId) {
    paramCount++;
    whereConditions.push(`acquirer = $${paramCount}`);
    params.push(acquirerId);
  }
  
  const whereClause = whereConditions.join(' AND ');
  
  const query = `
    SELECT 
      COUNT(*) FILTER (WHERE status = 'RECOVERED') as won_count,
      COUNT(*) FILTER (WHERE status = 'WRITEOFF') as lost_count,
      COUNT(*) as total_resolved,
      COALESCE(
        AVG(EXTRACT(EPOCH FROM (closed_at - received_at)) / 86400),
        0
      )::INTEGER as avg_resolution_days
    FROM sp_v2_chargebacks
    WHERE ${whereClause}
  `;
  
  console.log('[Disputes V2 DB] Outcome Summary Query:', { window, merchantId, acquirerId });
  
  const result = await pool.query(query, params);
  const row = result.rows[0];
  
  const wonCount = parseInt(row.won_count) || 0;
  const lostCount = parseInt(row.lost_count) || 0;
  const totalResolved = parseInt(row.total_resolved) || 0;
  
  return {
    wonCount,
    lostCount,
    totalResolved,
    winRatePct: totalResolved > 0 ? Math.round((wonCount / totalResolved) * 100) : 0,
    avgResolutionDays: parseInt(row.avg_resolution_days) || 0
  };
}

async function getSlaBuckets(filters) {
  const { from, to, merchantId, acquirerId } = filters;
  
  let whereConditions = [
    'received_at >= $1',
    'received_at <= $2',
    'status = $3',
    'evidence_due_at IS NOT NULL'
  ];
  let params = [from, to, 'OPEN'];
  let paramCount = 3;
  
  if (merchantId) {
    paramCount++;
    whereConditions.push(`merchant_id = $${paramCount}`);
    params.push(merchantId);
  }
  
  if (acquirerId) {
    paramCount++;
    whereConditions.push(`acquirer = $${paramCount}`);
    params.push(acquirerId);
  }
  
  const whereClause = whereConditions.join(' AND ');
  
  const query = `
    SELECT 
      COUNT(*) FILTER (WHERE evidence_due_at < NOW()) as overdue_count,
      SUM(chargeback_paise) FILTER (WHERE evidence_due_at < NOW())::TEXT as overdue_amount,
      
      COUNT(*) FILTER (
        WHERE DATE(evidence_due_at) = CURRENT_DATE
      ) as today_count,
      SUM(chargeback_paise) FILTER (
        WHERE DATE(evidence_due_at) = CURRENT_DATE
      )::TEXT as today_amount,
      
      COUNT(*) FILTER (
        WHERE evidence_due_at > NOW() 
        AND evidence_due_at <= NOW() + INTERVAL '3 days'
      ) as two_to_three_count,
      SUM(chargeback_paise) FILTER (
        WHERE evidence_due_at > NOW() 
        AND evidence_due_at <= NOW() + INTERVAL '3 days'
      )::TEXT as two_to_three_amount
    FROM sp_v2_chargebacks
    WHERE ${whereClause}
  `;
  
  console.log('[Disputes V2 DB] SLA Buckets Query:', { from, to, merchantId, acquirerId });
  
  const result = await pool.query(query, params);
  const row = result.rows[0];
  
  return {
    overdue: {
      count: parseInt(row.overdue_count) || 0,
      amountPaise: row.overdue_amount || '0'
    },
    today: {
      count: parseInt(row.today_count) || 0,
      amountPaise: row.today_amount || '0'
    },
    twoToThree: {
      count: parseInt(row.two_to_three_count) || 0,
      amountPaise: row.two_to_three_amount || '0'
    }
  };
}

async function getChargebacksList(filters) {
  const { status, searchQuery, acquirer, slaBucket, limit = 50, offset = 0, from, to } = filters;
  
  let whereConditions = ['1=1'];
  let params = [];
  let paramCount = 0;
  
  // Date range filter (default last 7 days if not provided)
  if (from && to) {
    paramCount++;
    whereConditions.push(`received_at >= $${paramCount}`);
    params.push(from);
    paramCount++;
    whereConditions.push(`received_at <= $${paramCount}`);
    params.push(to);
  }
  
  // Status filter
  if (status && status !== 'All') {
    paramCount++;
    whereConditions.push(`status = $${paramCount}`);
    params.push(status.toUpperCase());
  }
  
  // Acquirer filter
  if (acquirer && acquirer !== 'All Acquirers') {
    paramCount++;
    whereConditions.push(`acquirer = $${paramCount}`);
    params.push(acquirer);
  }
  
  // Search query (case_ref, txn_ref, merchant_name)
  if (searchQuery) {
    paramCount++;
    whereConditions.push(`(
      case_ref ILIKE $${paramCount} OR 
      txn_ref ILIKE $${paramCount} OR 
      merchant_name ILIKE $${paramCount} OR
      rrn ILIKE $${paramCount}
    )`);
    params.push(`%${searchQuery}%`);
  }
  
  // SLA bucket filter
  if (slaBucket) {
    if (slaBucket === 'overdue') {
      whereConditions.push(`status = 'OPEN' AND evidence_due_at < NOW()`);
    } else if (slaBucket === 'today') {
      whereConditions.push(`status = 'OPEN' AND DATE(evidence_due_at) = CURRENT_DATE`);
    } else if (slaBucket === 'upcoming') {
      whereConditions.push(`status = 'OPEN' AND evidence_due_at > NOW() AND evidence_due_at <= NOW() + INTERVAL '3 days'`);
    }
  }
  
  const whereClause = whereConditions.join(' AND ');
  
  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM sp_v2_chargebacks
    WHERE ${whereClause}
  `;
  
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total) || 0;
  
  // Get paginated results
  paramCount++;
  const limitParam = paramCount;
  params.push(parseInt(limit));
  
  paramCount++;
  const offsetParam = paramCount;
  params.push(parseInt(offset));
  
  const query = `
    SELECT 
      id,
      case_ref,
      merchant_id,
      merchant_name,
      txn_ref,
      rrn,
      chargeback_paise,
      currency,
      status,
      reason_code,
      reason_description,
      acquirer,
      evidence_due_at,
      received_at,
      closed_at,
      updated_at,
      assigned_to
    FROM sp_v2_chargebacks
    WHERE ${whereClause}
    ORDER BY received_at DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;
  
  console.log('[Disputes V2 DB] Chargebacks List Query:', { status, searchQuery, acquirer, slaBucket, limit, offset });
  
  const result = await pool.query(query, params);
  
  // Format response to match frontend expectations
  const chargebacks = result.rows.map(row => ({
    id: row.id,
    caseRef: row.case_ref,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    transactionId: row.txn_ref,
    rrn: row.rrn,
    amountPaise: row.chargeback_paise.toString(),
    currency: row.currency,
    status: row.status,
    reason: row.reason_description || row.reason_code,
    reasonCode: row.reason_code,
    acquirer: row.acquirer,
    evidenceDueDate: row.evidence_due_at,
    createdAt: row.received_at,
    closedAt: row.closed_at,
    updatedAt: row.updated_at,
    owner: row.assigned_to
  }));
  
  return {
    chargebacks,
    pagination: {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  };
}

module.exports = {
  getDisputesKpis,
  getOutcomeSummary,
  getSlaBuckets,
  getChargebacksList
};
