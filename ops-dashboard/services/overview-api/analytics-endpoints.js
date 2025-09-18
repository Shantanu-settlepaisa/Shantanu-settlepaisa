// Analytics endpoints for Overview API

// ===== Mode Stacked (100% stacked bar) =====
function createModeStackedEndpoint(app, mockTransactions, mockSettlements, filterTransactions, filterSettlements) {
  app.get('/api/analytics/mode-stacked', async (req, res) => {
    const { from, to, merchantId, acquirerId } = req.query;
    
    try {
      console.log(`[Analytics Mode Stacked] Request: from=${from}, to=${to}`);
      
      // Filter transactions
      const txns = filterTransactions(mockTransactions, from, to, merchantId, acquirerId);
      const settlements = filterSettlements(mockSettlements, from, to);
      
      // Group by mode
      const modeMap = {};
      const allModes = ['UPI', 'CARD', 'NETBANKING', 'WALLET', 'QR'];
      
      // Initialize all modes
      allModes.forEach(mode => {
        modeMap[mode] = {
          mode,
          capturedCount: 0,
          capturedAmount: BigInt(0),
          settledCount: 0,
          settledAmount: BigInt(0)
        };
      });
      
      // Process transactions
      txns.forEach(txn => {
        const mode = txn.payment_mode;
        if (!modeMap[mode]) return;
        
        modeMap[mode].capturedCount++;
        modeMap[mode].capturedAmount += BigInt(txn.amount_paise);
        
        // Check if settled
        const isSettled = settlements.some(s => s.txn_id === txn.id);
        if (isSettled) {
          modeMap[mode].settledCount++;
          modeMap[mode].settledAmount += BigInt(txn.amount_paise);
        }
      });
      
      // Calculate percentages and format response
      const slices = Object.values(modeMap)
        .filter(m => m.capturedCount > 0)
        .map(m => {
          const total = m.capturedCount;
          const settledPct = total > 0 ? parseFloat(((m.settledCount / total) * 100).toFixed(1)) : 0;
          const unsettledPct = parseFloat((100 - settledPct).toFixed(1));
          const unsettledCount = m.capturedCount - m.settledCount;
          const unsettledAmount = m.capturedAmount - m.settledAmount;
          
          return {
            mode: m.mode,
            settled: {
              count: m.settledCount,
              amountPaise: m.settledAmount.toString(),
              pct: settledPct
            },
            unsettled: {
              count: unsettledCount,
              amountPaise: unsettledAmount.toString(),
              pct: unsettledPct
            },
            settlementSrPct: settledPct
          };
        });
      
      // Calculate totals
      const totalCount = txns.length;
      const totalAmount = txns.reduce((sum, t) => sum + BigInt(t.amount_paise), BigInt(0));
      
      res.json({
        slices,
        totals: {
          count: totalCount,
          amountPaise: totalAmount.toString()
        }
      });
    } catch (error) {
      console.error('[Analytics Mode Stacked] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

// ===== GMV Trend V2 (with rolling averages) =====
function createGmvTrendV2Endpoint(app, mockTransactions, mockSettlements, filterTransactions, filterSettlements) {
  app.get('/api/analytics/gmv-trend-v2', async (req, res) => {
    const { from, to, merchantId, acquirerId, mode } = req.query;
    
    try {
      console.log(`[Analytics GMV Trend V2] Request: from=${from}, to=${to}, mode=${mode}`);
      
      // Get wider date range for rolling average calculation
      const startDate = new Date(from);
      const endDate = new Date(to);
      const extendedStartDate = new Date(startDate);
      extendedStartDate.setDate(extendedStartDate.getDate() - 7);
      
      // Filter transactions with extended range
      const extendedTxns = filterTransactions(
        mockTransactions, 
        extendedStartDate.toISOString().split('T')[0],
        to,
        merchantId,
        acquirerId,
        mode
      );
      const extendedSettlements = filterSettlements(
        mockSettlements,
        extendedStartDate.toISOString().split('T')[0],
        to
      );
      
      // Group by date
      const dailyMap = {};
      extendedTxns.forEach(txn => {
        const date = txn.txn_date;
        if (!dailyMap[date]) {
          dailyMap[date] = {
            date,
            capturedPaise: BigInt(0),
            capturedTxns: 0,
            settledPaise: BigInt(0),
            settledTxns: 0
          };
        }
        
        dailyMap[date].capturedPaise += BigInt(txn.amount_paise);
        dailyMap[date].capturedTxns++;
        
        const isSettled = extendedSettlements.some(s => s.txn_id === txn.id);
        if (isSettled) {
          dailyMap[date].settledPaise += BigInt(txn.amount_paise);
          dailyMap[date].settledTxns++;
        }
      });
      
      // Convert to sorted array
      const allDays = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
      
      // Calculate 7-day rolling averages
      const calculateRollingAvg = (data, field) => {
        const result = {};
        for (let i = 0; i < data.length; i++) {
          const startIdx = Math.max(0, i - 6);
          const window = data.slice(startIdx, i + 1);
          const sum = window.reduce((acc, d) => acc + BigInt(d[field]), BigInt(0));
          result[data[i].date] = sum / BigInt(window.length);
        }
        return result;
      };
      
      const capturedAvg7 = calculateRollingAvg(allDays, 'capturedPaise');
      const settledAvg7 = calculateRollingAvg(allDays, 'settledPaise');
      
      // Filter to requested date range and add rolling averages
      const points = allDays
        .filter(d => d.date >= from && d.date <= to)
        .map(d => ({
          date: d.date,
          capturedPaise: d.capturedPaise.toString(),
          capturedTxns: d.capturedTxns,
          settledPaise: d.settledPaise.toString(),
          settledTxns: d.settledTxns,
          unsettledPaise: (d.capturedPaise - d.settledPaise).toString(),
          capturedPaiseAvg7: capturedAvg7[d.date]?.toString() || d.capturedPaise.toString(),
          settledPaiseAvg7: settledAvg7[d.date]?.toString() || d.settledPaise.toString()
        }));
      
      res.json({ points });
    } catch (error) {
      console.error('[Analytics GMV Trend V2] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

// ===== Settlement Failure Pareto =====
function createParetoEndpoint(app, mockTransactions, mockSettlements, mockReconciliations, filterTransactions, filterSettlements) {
  app.get('/api/analytics/settlement-failure-pareto', async (req, res) => {
    const { from, to, merchantId, acquirerId, mode, limit = 8 } = req.query;
    
    try {
      console.log(`[Analytics Pareto] Request: from=${from}, to=${to}, limit=${limit}`);
      
      // Filter data
      const txns = filterTransactions(mockTransactions, from, to, merchantId, acquirerId, mode);
      const settlements = filterSettlements(mockSettlements, from, to);
      const recons = mockReconciliations.filter(r => {
        if (!r.cycle_date) return false;
        if (from && r.cycle_date < from) return false;
        if (to && r.cycle_date > to) return false;
        return true;
      });
      
      // Get unsettled transactions
      const unsettledTxns = txns.filter(t => !settlements.some(s => s.txn_id === t.id));
      
      // Group by reason
      const reasonMap = {};
      unsettledTxns.forEach(txn => {
        const recon = recons.find(r => r.txn_id === txn.id);
        let reason = 'Unknown';
        
        if (recon) {
          if (recon.status === 'UNMATCHED_PG') {
            reason = 'Technical Decline';
          } else if (recon.status === 'UNMATCHED_BANK') {
            reason = 'Bank Processing Delay';
          } else if (recon.status === 'EXCEPTION') {
            if (recon.reason_code === 'MISSING_UTR') {
              reason = 'Missing UTR';
            } else if (recon.reason_code === 'AMOUNT_MISMATCH') {
              reason = 'Amount Mismatch';
            } else if (recon.reason_code === 'FILE_MISSING') {
              reason = 'File Missing';
            } else {
              reason = 'Exception - Other';
            }
          }
        } else {
          // Random assignment for demo
          const rand = Math.random();
          if (rand < 0.3) reason = 'Technical Decline';
          else if (rand < 0.5) reason = 'Insufficient Balance';
          else if (rand < 0.7) reason = 'Bank Processing Delay';
          else if (rand < 0.85) reason = 'Network Timeout';
          else reason = 'Other';
        }
        
        if (!reasonMap[reason]) {
          reasonMap[reason] = {
            reason,
            txns: 0,
            impactPaise: BigInt(0)
          };
        }
        reasonMap[reason].txns++;
        reasonMap[reason].impactPaise += BigInt(txn.amount_paise);
      });
      
      // Sort by impact and limit
      let bars = Object.values(reasonMap)
        .sort((a, b) => {
          const diff = b.impactPaise - a.impactPaise;
          return diff > 0n ? 1 : diff < 0n ? -1 : 0;
        })
        .slice(0, parseInt(limit));
      
      // Calculate total impact
      const totalImpact = bars.reduce((sum, b) => sum + b.impactPaise, BigInt(0));
      
      // Add percentages
      bars = bars.map(b => ({
        reason: b.reason,
        txns: b.txns,
        impactPaise: b.impactPaise.toString(),
        sharePct: totalImpact > 0n ? 
          parseFloat(((b.impactPaise * 100n) / totalImpact).toString()).toFixed(1) : 0
      }));
      
      // Calculate cumulative percentages
      let cumPct = 0;
      const cumulative = bars.map(b => {
        cumPct += parseFloat(b.sharePct);
        return {
          reason: b.reason,
          cumPct: parseFloat(cumPct.toFixed(1))
        };
      });
      
      // Totals
      const totals = {
        unsettledTxns: unsettledTxns.length,
        unsettledPaise: unsettledTxns.reduce((sum, t) => sum + BigInt(t.amount_paise), BigInt(0)).toString(),
        topReason: bars[0] || null
      };
      
      res.json({ bars, cumulative, totals });
    } catch (error) {
      console.error('[Analytics Pareto] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

// Helper to calculate date difference in days
function daysDiff(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

// ===== Update KPIs V2 with deltas =====
function createKpisV2WithDeltasEndpoint(app, mockTransactions, mockSettlements, filterTransactions, filterSettlements) {
  app.get('/api/analytics/kpis-v3', async (req, res) => {
    const { from, to, merchantId, acquirerId, mode } = req.query;
    
    try {
      console.log(`[Analytics KPIs V3] Request: from=${from}, to=${to}`);
      
      // Current window
      const capturedTxns = filterTransactions(mockTransactions, from, to, merchantId, acquirerId, mode);
      const settledTxns = filterSettlements(mockSettlements, from, to, merchantId, acquirerId, mode);
      
      const capturedCount = capturedTxns.length;
      const settledCount = settledTxns.length;
      const unsettledCount = Math.max(0, capturedCount - settledCount);
      
      const capturedAmount = capturedTxns.reduce((sum, t) => sum + BigInt(t.amount_paise), BigInt(0));
      const settledAmount = settledTxns.reduce((sum, s) => sum + BigInt(s.amount_paise), BigInt(0));
      const unsettledAmount = capturedAmount - settledAmount;
      
      const settlementSrPct = capturedCount > 0 
        ? parseFloat(((settledCount / capturedCount) * 100).toFixed(1))
        : 0;
      
      // Previous window (equal length)
      const windowDays = daysDiff(from, to) + 1;
      const prevTo = new Date(from);
      prevTo.setDate(prevTo.getDate() - 1);
      const prevFrom = new Date(prevTo);
      prevFrom.setDate(prevFrom.getDate() - windowDays + 1);
      
      const prevFromStr = prevFrom.toISOString().split('T')[0];
      const prevToStr = prevTo.toISOString().split('T')[0];
      
      const prevCapturedTxns = filterTransactions(mockTransactions, prevFromStr, prevToStr, merchantId, acquirerId, mode);
      const prevSettledTxns = filterSettlements(mockSettlements, prevFromStr, prevToStr, merchantId, acquirerId, mode);
      
      const prevCapturedCount = prevCapturedTxns.length;
      const prevSettledCount = prevSettledTxns.length;
      const prevUnsettledCount = Math.max(0, prevCapturedCount - prevSettledCount);
      
      const prevCapturedAmount = prevCapturedTxns.reduce((sum, t) => sum + BigInt(t.amount_paise), BigInt(0));
      const prevSettledAmount = prevSettledTxns.reduce((sum, s) => sum + BigInt(s.amount_paise), BigInt(0));
      const prevUnsettledAmount = prevCapturedAmount - prevSettledAmount;
      
      const prevSettlementSrPct = prevCapturedCount > 0 
        ? parseFloat(((prevSettledCount / prevCapturedCount) * 100).toFixed(1))
        : 0;
      
      // Calculate deltas
      const deltas = {
        settledCount: settledCount - prevSettledCount,
        settledAmountPaise: (settledAmount - prevSettledAmount).toString(),
        unsettledCount: unsettledCount - prevUnsettledCount,
        unsettledAmountPaise: (unsettledAmount - prevUnsettledAmount).toString(),
        settlementSrPctPoints: parseFloat((settlementSrPct - prevSettlementSrPct).toFixed(1))
      };
      
      res.json({
        settled: {
          count: settledCount,
          amountPaise: settledAmount.toString()
        },
        unsettled: {
          count: unsettledCount,
          amountPaise: unsettledAmount.toString()
        },
        settlementSrPct,
        deltas
      });
    } catch (error) {
      console.error('[Analytics KPIs V3] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = {
  createModeStackedEndpoint,
  createGmvTrendV2Endpoint,
  createParetoEndpoint,
  createKpisV2WithDeltasEndpoint
};