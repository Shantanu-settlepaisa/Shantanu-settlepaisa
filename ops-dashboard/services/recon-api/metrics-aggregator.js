/**
 * Unified Metrics Aggregator for Reconciliation
 * Implements Definition A: matched = in_settlement + sent_to_bank + credited
 */

class MetricsAggregator {
  constructor() {
    // Daily metrics cache
    this.metricsCache = new Map();
    
    // Status definitions
    this.STATUSES = {
      CAPTURED: 'captured',
      IN_SETTLEMENT: 'in_settlement',
      SENT_TO_BANK: 'sent_to_bank',
      CREDITED: 'credited',
      UNSETTLED: 'unsettled',
      UNMATCHED: 'unmatched'
    };
    
    // Source types
    this.SOURCES = {
      MANUAL: 'MANUAL',
      CONNECTOR: 'CONNECTOR',
      ALL: 'ALL'
    };
  }

  /**
   * Calculate daily metrics for a given date range and source
   * Implements Definition A: matched = in_settlement + sent_to_bank + credited
   */
  calculateDailyMetrics(transactions, dateRange, source = 'ALL') {
    const metrics = {
      date: dateRange.date,
      source: source,
      
      // Core counts
      captured_count: 0,
      captured_amount: 0,
      
      // Settlement states
      in_settlement_count: 0,
      in_settlement_amount: 0,
      sent_to_bank_count: 0,
      sent_to_bank_amount: 0,
      credited_count: 0,
      credited_amount: 0,
      unsettled_count: 0,
      unsettled_amount: 0,
      
      // Matched/Unmatched (Definition A)
      matched_count: 0,
      matched_amount: 0,
      unmatched_count: 0,
      unmatched_amount: 0,
      
      // Exceptions
      exceptions_open_count: 0,
      exceptions_by_reason: [],
      exceptions_by_severity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      
      // Settlement metrics
      net_settlement_amount: 0,
      batches_count: 0
    };
    
    // Filter transactions by source if specified
    let filteredTxns = transactions;
    if (source !== 'ALL') {
      filteredTxns = transactions.filter(txn => txn.source === source);
    }
    
    // Process each transaction
    filteredTxns.forEach(txn => {
      // All captured transactions
      metrics.captured_count++;
      metrics.captured_amount += txn.amount || 0;
      
      // Settlement state classification
      switch (txn.settlement_state) {
        case 'IN_SETTLEMENT':
          metrics.in_settlement_count++;
          metrics.in_settlement_amount += txn.amount || 0;
          break;
        case 'SENT_TO_BANK':
          metrics.sent_to_bank_count++;
          metrics.sent_to_bank_amount += txn.amount || 0;
          break;
        case 'CREDITED':
          metrics.credited_count++;
          metrics.credited_amount += txn.amount || 0;
          metrics.net_settlement_amount += (txn.amount || 0) - (txn.fees || 0) - (txn.tax || 0);
          break;
        case 'UNSETTLED':
        case 'FAILED':
          metrics.unsettled_count++;
          metrics.unsettled_amount += txn.amount || 0;
          break;
      }
      
      // Process exceptions
      if (txn.exception_reason) {
        metrics.exceptions_open_count++;
        
        // Add to reason breakdown
        const existingReason = metrics.exceptions_by_reason.find(
          r => r.reason === txn.exception_reason
        );
        if (existingReason) {
          existingReason.count++;
          existingReason.amount += txn.amount || 0;
        } else {
          metrics.exceptions_by_reason.push({
            reason: txn.exception_reason,
            count: 1,
            amount: txn.amount || 0
          });
        }
        
        // Severity classification
        const severity = this.classifySeverity(txn.exception_reason);
        metrics.exceptions_by_severity[severity]++;
      }
    });
    
    // Calculate matched/unmatched using Definition A
    metrics.matched_count = metrics.in_settlement_count + 
                           metrics.sent_to_bank_count + 
                           metrics.credited_count;
    metrics.matched_amount = metrics.in_settlement_amount + 
                            metrics.sent_to_bank_amount + 
                            metrics.credited_amount;
    
    metrics.unmatched_count = metrics.captured_count - metrics.matched_count;
    metrics.unmatched_amount = metrics.captured_amount - metrics.matched_amount;
    
    // Count unique batches
    const uniqueBatches = new Set(
      filteredTxns
        .filter(txn => txn.settlement_batch_id)
        .map(txn => txn.settlement_batch_id)
    );
    metrics.batches_count = uniqueBatches.size;
    
    // Sort exceptions by count
    metrics.exceptions_by_reason.sort((a, b) => b.count - a.count);
    
    // Validate invariants
    this.validateInvariants(metrics);
    
    return metrics;
  }
  
  /**
   * Aggregate metrics for a date range
   */
  aggregateMetrics(dailyMetrics) {
    const aggregated = {
      captured_count: 0,
      captured_amount: 0,
      in_settlement_count: 0,
      in_settlement_amount: 0,
      sent_to_bank_count: 0,
      sent_to_bank_amount: 0,
      credited_count: 0,
      credited_amount: 0,
      unsettled_count: 0,
      unsettled_amount: 0,
      matched_count: 0,
      matched_amount: 0,
      unmatched_count: 0,
      unmatched_amount: 0,
      exceptions_open_count: 0,
      exceptions_by_reason: {},
      exceptions_by_severity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      net_settlement_amount: 0,
      batches_count: 0,
      
      // By source breakdown
      by_source: {
        MANUAL: {
          captured: 0,
          matched: 0,
          match_rate: 0
        },
        CONNECTOR: {
          captured: 0,
          matched: 0,
          match_rate: 0
        }
      }
    };
    
    // Sum up daily metrics
    dailyMetrics.forEach(day => {
      Object.keys(aggregated).forEach(key => {
        if (typeof aggregated[key] === 'number') {
          aggregated[key] += day[key] || 0;
        }
      });
      
      // Aggregate exceptions by reason
      day.exceptions_by_reason.forEach(reason => {
        if (!aggregated.exceptions_by_reason[reason.reason]) {
          aggregated.exceptions_by_reason[reason.reason] = {
            count: 0,
            amount: 0
          };
        }
        aggregated.exceptions_by_reason[reason.reason].count += reason.count;
        aggregated.exceptions_by_reason[reason.reason].amount += reason.amount;
      });
      
      // Aggregate by source
      if (day.source === 'MANUAL') {
        aggregated.by_source.MANUAL.captured += day.captured_count;
        aggregated.by_source.MANUAL.matched += day.matched_count;
      } else if (day.source === 'CONNECTOR') {
        aggregated.by_source.CONNECTOR.captured += day.captured_count;
        aggregated.by_source.CONNECTOR.matched += day.matched_count;
      }
    });
    
    // Calculate match rates
    if (aggregated.by_source.MANUAL.captured > 0) {
      aggregated.by_source.MANUAL.match_rate = 
        (aggregated.by_source.MANUAL.matched / aggregated.by_source.MANUAL.captured) * 100;
    }
    if (aggregated.by_source.CONNECTOR.captured > 0) {
      aggregated.by_source.CONNECTOR.match_rate = 
        (aggregated.by_source.CONNECTOR.matched / aggregated.by_source.CONNECTOR.captured) * 100;
    }
    
    // Convert exceptions_by_reason to array and sort
    aggregated.exceptions_by_reason = Object.entries(aggregated.exceptions_by_reason)
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        amount: data.amount,
        percentage: (data.count / aggregated.exceptions_open_count * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count);
    
    return aggregated;
  }
  
  /**
   * Calculate exception ageing metrics
   */
  calculateExceptionAgeing(exceptions, currentDate = new Date()) {
    const ageBuckets = {
      '0-24h': { count: 0, amount: 0, reasons: {} },
      '24-48h': { count: 0, amount: 0, reasons: {} },
      '2-7d': { count: 0, amount: 0, reasons: {} },
      '>7d': { count: 0, amount: 0, reasons: {} }
    };
    
    exceptions.forEach(exc => {
      const ageInHours = (currentDate - new Date(exc.created_at)) / (1000 * 60 * 60);
      let bucket;
      
      if (ageInHours <= 24) {
        bucket = '0-24h';
      } else if (ageInHours <= 48) {
        bucket = '24-48h';
      } else if (ageInHours <= 168) { // 7 days
        bucket = '2-7d';
      } else {
        bucket = '>7d';
      }
      
      ageBuckets[bucket].count++;
      ageBuckets[bucket].amount += exc.amount || 0;
      
      // Track reasons per bucket
      if (!ageBuckets[bucket].reasons[exc.reason]) {
        ageBuckets[bucket].reasons[exc.reason] = {
          count: 0,
          amount: 0
        };
      }
      ageBuckets[bucket].reasons[exc.reason].count++;
      ageBuckets[bucket].reasons[exc.reason].amount += exc.amount || 0;
    });
    
    return ageBuckets;
  }
  
  /**
   * Calculate burn-down metrics for exceptions
   */
  calculateBurnDown(exceptions, days = 14) {
    const burnDown = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayMetrics = {
        date: dateStr,
        opened: 0,
        resolved: 0,
        net_open: 0
      };
      
      exceptions.forEach(exc => {
        const createdDate = new Date(exc.created_at).toISOString().split('T')[0];
        const resolvedDate = exc.resolved_at ? 
          new Date(exc.resolved_at).toISOString().split('T')[0] : null;
        
        if (createdDate === dateStr) {
          dayMetrics.opened++;
        }
        if (resolvedDate === dateStr) {
          dayMetrics.resolved++;
        }
        
        // Count as open if created before/on this date and not resolved or resolved after
        if (createdDate <= dateStr && (!resolvedDate || resolvedDate > dateStr)) {
          dayMetrics.net_open++;
        }
      });
      
      burnDown.push(dayMetrics);
    }
    
    return burnDown;
  }
  
  /**
   * Classify exception severity
   */
  classifySeverity(reason) {
    const critical = ['BANK_FILE_MISSING', 'UTR_MISSING_OR_INVALID'];
    const high = ['AMOUNT_MISMATCH', 'DUPLICATE_UTR', 'DUPLICATE_BANK_ENTRY'];
    const medium = ['DATE_OUT_OF_WINDOW', 'STATUS_MISMATCH', 'CURRENCY_MISMATCH'];
    
    if (critical.includes(reason)) return 'critical';
    if (high.includes(reason)) return 'high';
    if (medium.includes(reason)) return 'medium';
    return 'low';
  }
  
  /**
   * Validate invariants
   */
  validateInvariants(metrics) {
    const invariants = [];
    
    // Invariant 1: captured = matched + unmatched
    const inv1 = metrics.captured_count === (metrics.matched_count + metrics.unmatched_count);
    if (!inv1) {
      invariants.push({
        rule: 'captured = matched + unmatched',
        passed: false,
        details: `${metrics.captured_count} != ${metrics.matched_count} + ${metrics.unmatched_count}`
      });
    }
    
    // Invariant 2: captured = in_settlement + sent_to_bank + credited + unsettled
    const settlementSum = metrics.in_settlement_count + metrics.sent_to_bank_count + 
                         metrics.credited_count + metrics.unsettled_count;
    const inv2 = Math.abs(metrics.captured_count - settlementSum) <= 1; // Allow rounding
    if (!inv2) {
      invariants.push({
        rule: 'captured = sum(settlement states)',
        passed: false,
        details: `${metrics.captured_count} != ${settlementSum}`
      });
    }
    
    // Invariant 3: matched = in_settlement + sent_to_bank + credited (Definition A)
    const matchedSum = metrics.in_settlement_count + metrics.sent_to_bank_count + metrics.credited_count;
    const inv3 = metrics.matched_count === matchedSum;
    if (!inv3) {
      invariants.push({
        rule: 'matched = in_settlement + sent_to_bank + credited',
        passed: false,
        details: `${metrics.matched_count} != ${matchedSum}`
      });
    }
    
    if (invariants.length > 0) {
      console.warn('[MetricsAggregator] Invariant violations detected:', invariants);
    }
    
    return invariants;
  }
  
  /**
   * Get comparison metrics for trend calculation
   */
  getComparisonMetrics(current, previous) {
    return {
      match_rate_delta: previous.captured_count > 0 ? 
        ((current.matched_count / current.captured_count) - 
         (previous.matched_count / previous.captured_count)) * 100 : 0,
      
      unmatched_value_delta: previous.unmatched_amount > 0 ?
        ((current.unmatched_amount - previous.unmatched_amount) / 
         previous.unmatched_amount) * 100 : 0,
      
      exceptions_delta: previous.exceptions_open_count > 0 ?
        ((current.exceptions_open_count - previous.exceptions_open_count) / 
         previous.exceptions_open_count) * 100 : 0,
      
      credited_delta: previous.credited_amount > 0 ?
        ((current.credited_amount - previous.credited_amount) / 
         previous.credited_amount) * 100 : 0
    };
  }
}

module.exports = MetricsAggregator;