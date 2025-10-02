const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5107;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'settlepaisa_v2',
  user: 'postgres',
  password: 'settlepaisa123',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

app.get('/analytics/kpis', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    const dateFilter = dateFrom && dateTo 
      ? `AND t.transaction_date BETWEEN $1 AND $2`
      : '';
    const params = dateFrom && dateTo ? [dateFrom, dateTo] : [];

    const settledQuery = `
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(t.amount_paise), 0) as total_amount_paise,
        COALESCE(AVG(EXTRACT(EPOCH FROM (si.created_at - t.created_at))/3600), 0) as avg_hours
      FROM sp_v2_transactions t
      LEFT JOIN sp_v2_settlement_items si ON t.transaction_id = si.transaction_id
      WHERE t.status = 'RECONCILED'
      ${dateFilter}
    `;

    const unsettledQuery = `
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount_paise), 0) as total_amount_paise
      FROM sp_v2_transactions
      WHERE status IN ('PENDING', 'EXCEPTION')
      ${dateFilter.replace('t.transaction_date', 'transaction_date')}
    `;

    const paidOutQuery = `
      SELECT COUNT(DISTINCT si.transaction_id) as count
      FROM sp_v2_settlement_items si
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      WHERE sb.status = 'COMPLETED'
      ${dateFrom && dateTo ? `AND sb.settlement_completed_at::date BETWEEN $1 AND $2` : ''}
    `;

    const [settledResult, unsettledResult, paidOutResult] = await Promise.all([
      pool.query(settledQuery, params),
      pool.query(unsettledQuery, params),
      pool.query(paidOutQuery, params)
    ]);

    const settled = settledResult.rows[0];
    const unsettled = unsettledResult.rows[0];
    const paidOut = paidOutResult.rows[0];

    const totalTransactions = parseInt(settled.count) + parseInt(unsettled.count);
    const settlementRate = totalTransactions > 0 
      ? (parseInt(settled.count) / totalTransactions * 100).toFixed(1)
      : 0;

    res.json({
      settled: {
        count: parseInt(settled.count),
        amountPaise: parseInt(settled.total_amount_paise)
      },
      unsettled: {
        count: parseInt(unsettled.count),
        amountPaise: parseInt(unsettled.total_amount_paise)
      },
      settlementRate: parseFloat(settlementRate),
      avgSettlementTimeHours: parseFloat(settled.avg_hours).toFixed(1),
      paidOutCount: parseInt(paidOut.count)
    });
  } catch (error) {
    console.error('Error fetching KPIs:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/analytics/payment-modes', async (req, res) => {
  try {
    const { dateFrom, dateTo, status } = req.query;
    
    let dateFilter = '';
    let statusFilter = '';
    const params = [];
    let paramIndex = 1;

    if (dateFrom && dateTo) {
      dateFilter = `AND transaction_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    }

    if (status === 'settled') {
      statusFilter = "AND status = 'RECONCILED'";
    } else if (status === 'unsettled') {
      statusFilter = "AND status IN ('PENDING', 'EXCEPTION')";
    }

    const query = `
      SELECT 
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(amount_paise), 0) as total_amount_paise
      FROM sp_v2_transactions
      WHERE 1=1
      ${dateFilter}
      ${statusFilter}
      GROUP BY payment_method
      ORDER BY count DESC
    `;

    const result = await pool.query(query, params);

    const breakdown = result.rows.map(row => ({
      mode: row.payment_method || 'UNKNOWN',
      count: parseInt(row.count),
      amountPaise: parseInt(row.total_amount_paise)
    }));

    res.json({ breakdown });
  } catch (error) {
    console.error('Error fetching payment modes:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/analytics/gmv-trend', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const query = `
      SELECT 
        transaction_date,
        COUNT(*) as count,
        COALESCE(SUM(amount_paise), 0) as total_amount_paise,
        COUNT(CASE WHEN status = 'RECONCILED' THEN 1 END) as settled_count
      FROM sp_v2_transactions
      WHERE transaction_date >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
      GROUP BY transaction_date
      ORDER BY transaction_date ASC
    `;

    const result = await pool.query(query);

    const trend = result.rows.map(row => ({
      date: row.transaction_date,
      capturedCount: parseInt(row.count),
      capturedAmountPaise: parseInt(row.total_amount_paise),
      settledCount: parseInt(row.settled_count),
      settlementRate: row.count > 0 
        ? parseFloat((row.settled_count / row.count * 100).toFixed(1))
        : 0
    }));

    res.json({ trend });
  } catch (error) {
    console.error('Error fetching GMV trend:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/analytics/funnel', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    const dateFilter = dateFrom && dateTo 
      ? `WHERE transaction_date BETWEEN $1 AND $2`
      : '';
    const params = dateFrom && dateTo ? [dateFrom, dateTo] : [];

    const capturedQuery = `
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      ${dateFilter}
    `;

    const reconciledQuery = `
      SELECT COUNT(*) as count
      FROM sp_v2_transactions
      ${dateFilter ? dateFilter + ' AND' : 'WHERE'} status = 'RECONCILED'
    `;

    const settledQuery = `
      SELECT COUNT(DISTINCT si.transaction_id) as count
      FROM sp_v2_settlement_items si
      JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
      ${dateFrom && dateTo ? 'WHERE t.transaction_date BETWEEN $1 AND $2' : ''}
    `;

    const paidOutQuery = `
      SELECT COUNT(DISTINCT si.transaction_id) as count
      FROM sp_v2_settlement_items si
      JOIN sp_v2_settlement_batches sb ON si.settlement_batch_id = sb.id
      JOIN sp_v2_transactions t ON si.transaction_id = t.transaction_id
      WHERE sb.status = 'COMPLETED'
      ${dateFrom && dateTo ? `AND t.transaction_date BETWEEN $1 AND $2` : ''}
    `;

    const [captured, reconciled, settled, paidOut] = await Promise.all([
      pool.query(capturedQuery, params),
      pool.query(reconciledQuery, params),
      pool.query(settledQuery, params),
      pool.query(paidOutQuery, params)
    ]);

    const capturedCount = parseInt(captured.rows[0].count);
    const reconciledCount = parseInt(reconciled.rows[0].count);
    const settledCount = parseInt(settled.rows[0].count);
    const paidOutCount = parseInt(paidOut.rows[0].count);

    res.json({
      funnel: {
        captured: {
          count: capturedCount,
          percentage: 100
        },
        reconciled: {
          count: reconciledCount,
          percentage: capturedCount > 0 ? (reconciledCount / capturedCount * 100).toFixed(1) : 0
        },
        settled: {
          count: settledCount,
          percentage: capturedCount > 0 ? (settledCount / capturedCount * 100).toFixed(1) : 0
        },
        paid_out: {
          count: paidOutCount,
          percentage: capturedCount > 0 ? (paidOutCount / capturedCount * 100).toFixed(1) : 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching funnel:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/analytics/settlement-rate', async (req, res) => {
  try {
    const yesterdayQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'RECONCILED' THEN 1 END) as settled
      FROM sp_v2_transactions
      WHERE transaction_date = CURRENT_DATE - INTERVAL '1 day'
    `;

    const lastWeekQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'RECONCILED' THEN 1 END) as settled
      FROM sp_v2_transactions
      WHERE transaction_date >= CURRENT_DATE - INTERVAL '7 days'
      AND transaction_date < CURRENT_DATE
    `;

    const lastMonthQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'RECONCILED' THEN 1 END) as settled
      FROM sp_v2_transactions
      WHERE transaction_date >= CURRENT_DATE - INTERVAL '30 days'
      AND transaction_date < CURRENT_DATE
    `;

    const [yesterday, lastWeek, lastMonth] = await Promise.all([
      pool.query(yesterdayQuery),
      pool.query(lastWeekQuery),
      pool.query(lastMonthQuery)
    ]);

    const calcRate = (row) => {
      const total = parseInt(row.total);
      const settled = parseInt(row.settled);
      return total > 0 ? (settled / total * 100).toFixed(1) : 0;
    };

    res.json({
      performance: {
        yesterday: {
          rate: parseFloat(calcRate(yesterday.rows[0])),
          settled: parseInt(yesterday.rows[0].settled),
          total: parseInt(yesterday.rows[0].total)
        },
        last_7_days: {
          rate: parseFloat(calcRate(lastWeek.rows[0])),
          settled: parseInt(lastWeek.rows[0].settled),
          total: parseInt(lastWeek.rows[0].total)
        },
        last_30_days: {
          rate: parseFloat(calcRate(lastMonth.rows[0])),
          settled: parseInt(lastMonth.rows[0].settled),
          total: parseInt(lastMonth.rows[0].total)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching settlement rate:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/analytics/failure-analysis', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    const dateFilter = dateFrom && dateTo 
      ? `AND e.created_at::date BETWEEN $1 AND $2`
      : '';
    const params = dateFrom && dateTo ? [dateFrom, dateTo] : [];

    const ERROR_OWNER_MAP = {
      'bank_error': 'Bank',
      'api_error': 'Gateway',
      'validation_error': 'Ops',
      'calculation_error': 'System',
      'config_error': 'Ops'
    };

    const ERROR_LABEL_MAP = {
      'bank_error': 'Bank Error',
      'api_error': 'API/Integration Error',
      'validation_error': 'Validation Error',
      'calculation_error': 'Calculation Error',
      'config_error': 'Configuration Error'
    };

    const query = `
      SELECT 
        COALESCE(e.error_code, e.error_type) as failure_reason,
        e.error_type as category,
        COUNT(*) as count,
        COUNT(DISTINCT e.batch_id) as affected_batches,
        COUNT(CASE WHEN e.is_resolved = false THEN 1 END) as open_count,
        COUNT(CASE WHEN e.is_resolved = true THEN 1 END) as resolved_count,
        COALESCE(SUM(
          CASE 
            WHEN b.net_amount_paise IS NOT NULL 
            THEN b.net_amount_paise 
            ELSE 0 
          END
        ), 0) as total_amount_paise
      FROM sp_v2_settlement_errors e
      LEFT JOIN sp_v2_settlement_batches b ON e.batch_id = b.id
      WHERE 1=1
      ${dateFilter}
      GROUP BY COALESCE(e.error_code, e.error_type), e.error_type
      ORDER BY count DESC
      LIMIT 10
    `;

    const result = await pool.query(query, params);

    const failures = result.rows.map(row => ({
      reason: row.failure_reason || 'UNKNOWN',
      label: ERROR_LABEL_MAP[row.failure_reason] || row.failure_reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
      owner: ERROR_OWNER_MAP[row.category] || 'System',
      category: row.category,
      count: parseInt(row.count),
      affectedBatches: parseInt(row.affected_batches),
      openCount: parseInt(row.open_count),
      resolvedCount: parseInt(row.resolved_count),
      amount_paise: parseInt(row.total_amount_paise)
    }));

    res.json({ failures });
  } catch (error) {
    console.error('Error fetching failure analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'settlement-analytics-api',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`✅ Settlement Analytics API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Database: settlepaisa_v2 @ localhost:5433`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing pool...');
  await pool.end();
  process.exit(0);
});
