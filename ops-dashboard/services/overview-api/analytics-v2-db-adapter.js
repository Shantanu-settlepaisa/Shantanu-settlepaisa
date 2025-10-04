/**
 * Analytics V2 Database Adapter
 * Connects Settlement Analytics endpoints to real PostgreSQL V2 database
 * Replaces mock data with actual queries to sp_v2_* tables
 */

const { Pool } = require('pg');

// PostgreSQL V2 connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'settlepaisa_v2',
  password: 'settlepaisa123',
  port: 5433,
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ [Analytics V2 DB] Connection failed:', err.message);
  } else {
    console.log('✅ [Analytics V2 DB] Connected to settlepaisa_v2 database');
  }
});

/**
 * Get Settlement KPIs (Settled, Unsettled, Settlement Rate)
 */
async function getSettlementKpis(params) {
  const { from, to, merchantId, acquirerId, mode } = params;
  
  try {
    // Calculate previous period dates (same duration)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const duration = toDate - fromDate;
    const prevTo = new Date(fromDate - 24 * 60 * 60 * 1000); // Day before current period
    const prevFrom = new Date(prevTo - duration);
    
    const query = `
      SELECT 
        -- Settled transactions (in settlement batches with COMPLETED/CREDITED status)
        COUNT(DISTINCT t.id) FILTER (
          WHERE sb.status IN ('COMPLETED', 'CREDITED')
        ) as settled_count,
        SUM(t.amount_paise) FILTER (
          WHERE sb.status IN ('COMPLETED', 'CREDITED')
        ) as settled_amount,
        
        -- Unsettled transactions (not in any settlement batch or in non-completed batches)
        COUNT(DISTINCT t.id) FILTER (
          WHERE si.id IS NULL OR sb.status NOT IN ('COMPLETED', 'CREDITED')
        ) as unsettled_count,
        SUM(t.amount_paise) FILTER (
          WHERE si.id IS NULL OR sb.status NOT IN ('COMPLETED', 'CREDITED')
        ) as unsettled_amount,
        
        -- Total for calculation
        COUNT(DISTINCT t.id) as total_count
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      LEFT JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE t.transaction_date >= $1 AND t.transaction_date <= $2
        ${merchantId ? 'AND t.merchant_id = $3' : ''}
        ${acquirerId ? `AND t.acquirer_code = $${merchantId ? 4 : 3}` : ''}
        ${mode ? `AND t.payment_method = $${merchantId && acquirerId ? 5 : merchantId || acquirerId ? 4 : 3}` : ''}
    `;
    
    const queryParams = [from, to];
    if (merchantId) queryParams.push(merchantId);
    if (acquirerId) queryParams.push(acquirerId);
    if (mode) queryParams.push(mode);
    
    // Get current period data
    const result = await pool.query(query, queryParams);
    const row = result.rows[0];
    
    const settledCount = parseInt(row.settled_count) || 0;
    const unsettledCount = parseInt(row.unsettled_count) || 0;
    const totalCount = parseInt(row.total_count) || 0;
    
    const settlementSrPct = totalCount > 0 
      ? Math.round((settledCount / totalCount) * 1000) / 10 
      : 0;
    
    // Get previous period data for deltas
    const prevParams = [prevFrom.toISOString().split('T')[0], prevTo.toISOString().split('T')[0]];
    if (merchantId) prevParams.push(merchantId);
    if (acquirerId) prevParams.push(acquirerId);
    if (mode) prevParams.push(mode);
    
    const prevResult = await pool.query(query, prevParams);
    const prevRow = prevResult.rows[0];
    
    const prevSettledCount = parseInt(prevRow.settled_count) || 0;
    const prevUnsettledCount = parseInt(prevRow.unsettled_count) || 0;
    const prevTotalCount = parseInt(prevRow.total_count) || 0;
    const prevSettlementSrPct = prevTotalCount > 0 
      ? Math.round((prevSettledCount / prevTotalCount) * 1000) / 10 
      : 0;
    
    // Calculate average settlement time (transaction_date to settlement batch completion)
    const avgTimeQuery = `
      SELECT 
        AVG(EXTRACT(EPOCH FROM (sb.updated_at - t.transaction_date)) / 3600) as avg_hours
      FROM sp_v2_transactions t
      JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE t.transaction_date >= $1 AND t.transaction_date <= $2
        AND sb.status IN ('COMPLETED', 'CREDITED')
        AND sb.updated_at IS NOT NULL
    `;
    
    const avgTimeResult = await pool.query(avgTimeQuery, [from, to]);
    const avgSettlementHrs = avgTimeResult.rows[0].avg_hours 
      ? Math.round(parseFloat(avgTimeResult.rows[0].avg_hours) * 10) / 10 
      : 0;
    
    // Count paid out batches (CREDITED status)
    const paidOutQuery = `
      SELECT COUNT(DISTINCT sb.id) as paid_out_count
      FROM sp_v2_settlement_batches sb
      JOIN sp_v2_settlement_items si ON sb.id = si.settlement_batch_id
      JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
      WHERE t.transaction_date >= $1 AND t.transaction_date <= $2
        AND sb.status = 'CREDITED'
    `;
    
    const paidOutResult = await pool.query(paidOutQuery, [from, to]);
    const paidOutCount = parseInt(paidOutResult.rows[0].paid_out_count) || 0;
    
    return {
      settled: {
        count: settledCount,
        amountPaise: row.settled_amount ? row.settled_amount.toString() : '0'
      },
      unsettled: {
        count: unsettledCount,
        amountPaise: row.unsettled_amount ? row.unsettled_amount.toString() : '0'
      },
      settlementSrPct,
      avgSettlementHrs,
      paidOutCount,
      deltas: {
        settled: {
          count: settledCount - prevSettledCount,
          amountPaise: ((row.settled_amount || 0) - (prevRow.settled_amount || 0)).toString()
        },
        unsettled: {
          count: unsettledCount - prevUnsettledCount,
          amountPaise: ((row.unsettled_amount || 0) - (prevRow.unsettled_amount || 0)).toString()
        },
        settlementSrPctPoints: Math.round((settlementSrPct - prevSettlementSrPct) * 10) / 10
      },
      window: {
        from,
        to,
        prevFrom: prevFrom.toISOString().split('T')[0],
        prevTo: prevTo.toISOString().split('T')[0]
      }
    };
  } catch (error) {
    console.error('❌ [Analytics V2 DB] getSettlementKpis error:', error.message);
    throw error;
  }
}

/**
 * Get Settlement Distribution by Payment Mode
 */
async function getSettlementByMode(params) {
  const { from, to, merchantId, acquirerId } = params;
  
  try {
    const query = `
      SELECT 
        t.payment_method as mode,
        
        -- Captured (all transactions)
        COUNT(DISTINCT t.id) as captured_count,
        SUM(t.amount_paise) as captured_amount,
        
        -- Settled (in COMPLETED/CREDITED batches)
        COUNT(DISTINCT t.id) FILTER (
          WHERE sb.status IN ('COMPLETED', 'CREDITED')
        ) as settled_count,
        SUM(t.amount_paise) FILTER (
          WHERE sb.status IN ('COMPLETED', 'CREDITED')
        ) as settled_amount
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      LEFT JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE t.transaction_date >= $1 AND t.transaction_date <= $2
        ${merchantId ? 'AND t.merchant_id = $3' : ''}
        ${acquirerId ? `AND t.acquirer_code = $${merchantId ? 4 : 3}` : ''}
      GROUP BY t.payment_method
      ORDER BY captured_count DESC
    `;
    
    const queryParams = [from, to];
    if (merchantId) queryParams.push(merchantId);
    if (acquirerId) queryParams.push(acquirerId);
    
    const result = await pool.query(query, queryParams);
    
    const distribution = result.rows.map(row => {
      const capturedCount = parseInt(row.captured_count) || 0;
      const settledCount = parseInt(row.settled_count) || 0;
      const settlementRate = capturedCount > 0 
        ? Math.round((settledCount / capturedCount) * 1000) / 10 
        : 0;
      
      return {
        mode: row.mode || 'UNKNOWN',
        captured: {
          count: capturedCount,
          amountPaise: row.captured_amount ? row.captured_amount.toString() : '0'
        },
        settled: {
          count: settledCount,
          amountPaise: row.settled_amount ? row.settled_amount.toString() : '0'
        },
        settlementRate
      };
    });
    
    return { distribution };
  } catch (error) {
    console.error('❌ [Analytics V2 DB] getSettlementByMode error:', error.message);
    throw error;
  }
}

/**
 * Get GMV Trend (daily settlement trend)
 */
async function getGmvTrend(params) {
  const { from, to, merchantId, acquirerId, mode } = params;
  
  try {
    const query = `
      SELECT 
        t.transaction_date::text as date,
        
        -- Captured
        COUNT(DISTINCT t.id) as captured_count,
        SUM(t.amount_paise) as captured_amount,
        
        -- Settled
        COUNT(DISTINCT t.id) FILTER (
          WHERE sb.status IN ('COMPLETED', 'CREDITED')
        ) as settled_count,
        SUM(t.amount_paise) FILTER (
          WHERE sb.status IN ('COMPLETED', 'CREDITED')
        ) as settled_amount
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      LEFT JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE t.transaction_date >= $1 AND t.transaction_date <= $2
        ${merchantId ? 'AND t.merchant_id = $3' : ''}
        ${acquirerId ? `AND t.acquirer_code = $${merchantId ? 4 : 3}` : ''}
        ${mode ? `AND t.payment_method = $${merchantId && acquirerId ? 5 : merchantId || acquirerId ? 4 : 3}` : ''}
      GROUP BY t.transaction_date
      ORDER BY t.transaction_date ASC
    `;
    
    const queryParams = [from, to];
    if (merchantId) queryParams.push(merchantId);
    if (acquirerId) queryParams.push(acquirerId);
    if (mode) queryParams.push(mode);
    
    const result = await pool.query(query, queryParams);
    
    const trend = result.rows.map(row => ({
      date: row.date,
      captured: {
        count: parseInt(row.captured_count) || 0,
        amountPaise: row.captured_amount ? row.captured_amount.toString() : '0'
      },
      settled: {
        count: parseInt(row.settled_count) || 0,
        amountPaise: row.settled_amount ? row.settled_amount.toString() : '0'
      }
    }));
    
    return { trend };
  } catch (error) {
    console.error('❌ [Analytics V2 DB] getGmvTrend error:', error.message);
    throw error;
  }
}

/**
 * Get Settlement Funnel (pipeline stages)
 */
async function getSettlementFunnel(params) {
  const { from, to, merchantId, acquirerId, mode } = params;
  
  try {
    const query = `
      SELECT 
        -- Captured (all transactions)
        COUNT(DISTINCT t.id) as captured_count,
        SUM(t.amount_paise) as captured_amount,
        
        -- In Settlement (PENDING_APPROVAL, PROCESSING batches)
        COUNT(DISTINCT t.id) FILTER (
          WHERE sb.status IN ('PENDING_APPROVAL', 'PROCESSING')
        ) as in_settlement_count,
        SUM(t.amount_paise) FILTER (
          WHERE sb.status IN ('PENDING_APPROVAL', 'PROCESSING')
        ) as in_settlement_amount,
        
        -- Sent to Bank (APPROVED, SENT batches)
        COUNT(DISTINCT t.id) FILTER (
          WHERE sb.status IN ('APPROVED', 'SENT', 'PENDING_CONFIRMATION')
        ) as sent_to_bank_count,
        SUM(t.amount_paise) FILTER (
          WHERE sb.status IN ('APPROVED', 'SENT', 'PENDING_CONFIRMATION')
        ) as sent_to_bank_amount,
        
        -- Credited (COMPLETED, CREDITED batches)
        COUNT(DISTINCT t.id) FILTER (
          WHERE sb.status IN ('COMPLETED', 'CREDITED')
        ) as credited_count,
        SUM(t.amount_paise) FILTER (
          WHERE sb.status IN ('COMPLETED', 'CREDITED')
        ) as credited_amount,
        
        -- Reconciliation status breakdown
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'RECONCILED') as matched_count,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'UNMATCHED' AND t.exception_reason IS NULL) as unmatched_pg_count,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'EXCEPTION') as exception_count
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      LEFT JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE t.transaction_date >= $1 AND t.transaction_date <= $2
        ${merchantId ? 'AND t.merchant_id = $3' : ''}
        ${acquirerId ? `AND t.acquirer_code = $${merchantId ? 4 : 3}` : ''}
        ${mode ? `AND t.payment_method = $${merchantId && acquirerId ? 5 : merchantId || acquirerId ? 4 : 3}` : ''}
    `;
    
    const queryParams = [from, to];
    if (merchantId) queryParams.push(merchantId);
    if (acquirerId) queryParams.push(acquirerId);
    if (mode) queryParams.push(mode);
    
    const result = await pool.query(query, queryParams);
    const row = result.rows[0];
    
    const capturedCount = parseInt(row.captured_count) || 0;
    const inSettlementCount = parseInt(row.in_settlement_count) || 0;
    const sentToBankCount = parseInt(row.sent_to_bank_count) || 0;
    const creditedCount = parseInt(row.credited_count) || 0;
    
    const stages = [
      {
        name: 'Captured',
        count: capturedCount,
        amountPaise: row.captured_amount || '0',
        percentage: 100
      },
      {
        name: 'In Settlement',
        count: inSettlementCount,
        amountPaise: row.in_settlement_amount || '0',
        percentage: capturedCount > 0 ? Math.round((inSettlementCount / capturedCount) * 100) : 0
      },
      {
        name: 'Sent to Bank',
        count: sentToBankCount,
        amountPaise: row.sent_to_bank_amount || '0',
        percentage: capturedCount > 0 ? Math.round((sentToBankCount / capturedCount) * 100) : 0
      },
      {
        name: 'Credited',
        count: creditedCount,
        amountPaise: row.credited_amount || '0',
        percentage: capturedCount > 0 ? Math.round((creditedCount / capturedCount) * 100) : 0
      }
    ];
    
    // Also count unmatched bank entries
    const bankUnmatchedQuery = `
      SELECT COUNT(*) as count
      FROM sp_v2_bank_statements
      WHERE transaction_date >= $1 AND transaction_date <= $2
        AND processed = false
    `;
    const bankResult = await pool.query(bankUnmatchedQuery, [from, to]);
    
    return {
      stages,
      reconStatuses: {
        MATCHED: parseInt(row.matched_count) || 0,
        UNMATCHED_PG: parseInt(row.unmatched_pg_count) || 0,
        UNMATCHED_BANK: parseInt(bankResult.rows[0].count) || 0,
        EXCEPTION: parseInt(row.exception_count) || 0
      }
    };
  } catch (error) {
    console.error('❌ [Analytics V2 DB] getSettlementFunnel error:', error.message);
    throw error;
  }
}

/**
 * Get Settlement Failure Reasons (exception analysis)
 */
async function getFailureReasons(params) {
  const { from, to, merchantId, acquirerId, mode } = params;
  
  try {
    const query = `
      SELECT 
        COALESCE(t.exception_reason, 'UNSETTLED_NO_BATCH') as reason,
        COUNT(*) as count,
        SUM(t.amount_paise) as impact_paise
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      LEFT JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE t.transaction_date >= $1 AND t.transaction_date <= $2
        AND (
          t.status = 'EXCEPTION' 
          OR si.id IS NULL 
          OR sb.status NOT IN ('COMPLETED', 'CREDITED')
        )
        ${merchantId ? 'AND t.merchant_id = $3' : ''}
        ${acquirerId ? `AND t.acquirer_code = $${merchantId ? 4 : 3}` : ''}
        ${mode ? `AND t.payment_method = $${merchantId && acquirerId ? 5 : merchantId || acquirerId ? 4 : 3}` : ''}
      GROUP BY t.exception_reason
      ORDER BY count DESC
      LIMIT 10
    `;
    
    const queryParams = [from, to];
    if (merchantId) queryParams.push(merchantId);
    if (acquirerId) queryParams.push(acquirerId);
    if (mode) queryParams.push(mode);
    
    const result = await pool.query(query, queryParams);
    
    const totalUnsettled = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const totalImpactPaise = result.rows.reduce((sum, row) => sum + BigInt(row.impact_paise || 0), BigInt(0));
    
    const reasons = result.rows.map(row => {
      const count = parseInt(row.count) || 0;
      const percentage = totalUnsettled > 0 
        ? Math.round((count / totalUnsettled) * 100) 
        : 0;
      
      return {
        reason: row.reason,
        count,
        percentage,
        impactPaise: row.impact_paise ? row.impact_paise.toString() : '0'
      };
    });
    
    return {
      reasons,
      totalUnsettled,
      totalImpactPaise: totalImpactPaise.toString()
    };
  } catch (error) {
    console.error('❌ [Analytics V2 DB] getFailureReasons error:', error.message);
    throw error;
  }
}

module.exports = {
  pool,
  getSettlementKpis,
  getSettlementByMode,
  getGmvTrend,
  getSettlementFunnel,
  getFailureReasons
};
