const express = require('express');

module.exports = function(pool) {
  const router = express.Router();

  // GET /v1/chargebacks/kpis - Get KPI metrics
  router.get('/kpis', async (req, res) => {
    const { from, to, merchantId, acquirerId } = req.query;

    try {
      let whereClause = '1=1';
      const params = [];
      let paramIndex = 1;

      if (from && to) {
        whereClause += ` AND received_at >= $${paramIndex} AND received_at <= $${paramIndex + 1}`;
        params.push(from, to);
        paramIndex += 2;
      }

      if (merchantId) {
        whereClause += ` AND merchant_id = $${paramIndex}`;
        params.push(merchantId);
        paramIndex++;
      }

      if (acquirerId) {
        whereClause += ` AND acquirer = $${paramIndex}`;
        params.push(acquirerId);
        paramIndex++;
      }

      const result = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'OPEN') as open_count,
          COUNT(*) FILTER (WHERE status = 'OPEN' AND stage = 'UNDER_REVIEW') as evidence_required_count,
          SUM(chargeback_paise + fees_paise) FILTER (WHERE status != 'WRITEOFF') as disputed_paise,
          SUM(recovered_paise) as recovered_paise,
          SUM(writeoff_paise) as written_off_paise
        FROM sp_v2_chargebacks
        WHERE ${whereClause}
      `, params);

      const row = result.rows[0];

      res.json({
        openCount: parseInt(row.open_count) || 0,
        evidenceRequiredCount: parseInt(row.evidence_required_count) || 0,
        disputedPaise: row.disputed_paise?.toString() || '0',
        recoveredPaise: row.recovered_paise?.toString() || '0',
        writtenOffPaise: row.written_off_paise?.toString() || '0'
      });
    } catch (error) {
      console.error('[Chargebacks KPIs] Error:', error);
      res.status(500).json({ error: 'Failed to fetch KPIs' });
    }
  });

  // GET /v1/chargebacks/outcome-summary - Get outcome stats
  router.get('/outcome-summary', async (req, res) => {
    const { window = '7d', merchantId, acquirerId } = req.query;

    try {
      const days = window === '7d' ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      let whereClause = `closed_at >= $1 AND status IN ('RECOVERED', 'WRITEOFF')`;
      const params = [cutoff];
      let paramIndex = 2;

      if (merchantId) {
        whereClause += ` AND merchant_id = $${paramIndex}`;
        params.push(merchantId);
        paramIndex++;
      }

      if (acquirerId) {
        whereClause += ` AND acquirer = $${paramIndex}`;
        params.push(acquirerId);
        paramIndex++;
      }

      const result = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE outcome = 'WON') as won_count,
          COUNT(*) FILTER (WHERE outcome = 'LOST') as lost_count,
          AVG(EXTRACT(EPOCH FROM (closed_at - received_at)) / 86400) as avg_resolution_days
        FROM sp_v2_chargebacks
        WHERE ${whereClause}
      `, params);

      const row = result.rows[0];
      const wonCount = parseInt(row.won_count) || 0;
      const lostCount = parseInt(row.lost_count) || 0;
      const total = wonCount + lostCount;

      res.json({
        wonCount,
        lostCount,
        winRatePct: total > 0 ? ((wonCount / total) * 100).toFixed(1) : 0,
        avgResolutionDays: Math.round(parseFloat(row.avg_resolution_days) || 0)
      });
    } catch (error) {
      console.error('[Chargebacks Outcome] Error:', error);
      res.status(500).json({ error: 'Failed to fetch outcome summary' });
    }
  });

  // GET /v1/chargebacks/sla-buckets - Get SLA deadline buckets
  router.get('/sla-buckets', async (req, res) => {
    const { from, to, merchantId, acquirerId } = req.query;

    try {
      let whereClause = 'status = \'OPEN\' AND deadline_at IS NOT NULL';
      const params = [];
      let paramIndex = 1;

      if (merchantId) {
        whereClause += ` AND merchant_id = $${paramIndex}`;
        params.push(merchantId);
        paramIndex++;
      }

      if (acquirerId) {
        whereClause += ` AND acquirer = $${paramIndex}`;
        params.push(acquirerId);
        paramIndex++;
      }

      const now = new Date();
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      const twoDaysLater = new Date(now);
      twoDaysLater.setDate(now.getDate() + 2);

      const threeDaysLater = new Date(now);
      threeDaysLater.setDate(now.getDate() + 3);

      const result = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE deadline_at < NOW()) as overdue_count,
          SUM(chargeback_paise + fees_paise) FILTER (WHERE deadline_at < NOW()) as overdue_amount,
          COUNT(*) FILTER (WHERE deadline_at >= NOW() AND deadline_at <= $${paramIndex}) as today_count,
          SUM(chargeback_paise + fees_paise) FILTER (WHERE deadline_at >= NOW() AND deadline_at <= $${paramIndex}) as today_amount,
          COUNT(*) FILTER (WHERE deadline_at >= $${paramIndex + 1} AND deadline_at <= $${paramIndex + 2}) as two_to_three_count,
          SUM(chargeback_paise + fees_paise) FILTER (WHERE deadline_at >= $${paramIndex + 1} AND deadline_at <= $${paramIndex + 2}) as two_to_three_amount
        FROM sp_v2_chargebacks
        WHERE ${whereClause}
      `, [...params, endOfToday, twoDaysLater, threeDaysLater]);

      const row = result.rows[0];

      res.json({
        overdue: {
          count: parseInt(row.overdue_count) || 0,
          amountPaise: row.overdue_amount?.toString() || '0'
        },
        today: {
          count: parseInt(row.today_count) || 0,
          amountPaise: row.today_amount?.toString() || '0'
        },
        twoToThree: {
          count: parseInt(row.two_to_three_count) || 0,
          amountPaise: row.two_to_three_amount?.toString() || '0'
        }
      });
    } catch (error) {
      console.error('[Chargebacks SLA] Error:', error);
      res.status(500).json({ error: 'Failed to fetch SLA buckets' });
    }
  });

  return router;
};
