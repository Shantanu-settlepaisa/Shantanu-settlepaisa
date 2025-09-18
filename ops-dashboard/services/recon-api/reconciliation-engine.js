// Reconciliation Engine with Reason Classification
// OP-0012+0013 Implementation

// Reason codes in priority order
const REASON_CODES = {
  BANK_FILE_MISSING: 'BANK_FILE_MISSING',
  PG_TXN_MISSING_IN_BANK: 'PG_TXN_MISSING_IN_BANK',
  BANK_TXN_MISSING_IN_PG: 'BANK_TXN_MISSING_IN_PG',
  UTR_MISSING_OR_INVALID: 'UTR_MISSING_OR_INVALID',
  UTR_MISMATCH: 'UTR_MISMATCH',
  DATE_OUT_OF_WINDOW: 'DATE_OUT_OF_WINDOW',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  FEE_MISMATCH: 'FEE_MISMATCH',
  ROUNDING_ERROR: 'ROUNDING_ERROR',
  STATUS_MISMATCH: 'STATUS_MISMATCH',
  DUPLICATE_BANK_ENTRY: 'DUPLICATE_BANK_ENTRY',
  DUPLICATE_PG_ENTRY: 'DUPLICATE_PG_ENTRY',
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  SCHEME_OR_MID_MISMATCH: 'SCHEME_OR_MID_MISMATCH',
  FEES_VARIANCE: 'FEES_VARIANCE',
  PARTIAL_CAPTURE_OR_REFUND_PENDING: 'PARTIAL_CAPTURE_OR_REFUND_PENDING',
  SPLIT_SETTLEMENT_UNALLOCATED: 'SPLIT_SETTLEMENT_UNALLOCATED'
};

// Match tiers
const MATCH_TIERS = {
  EXACT: 'A',    // Exact match on all critical fields
  STRONG: 'B',   // Match with minor variance
  HEURISTIC: 'C' // Fuzzy match based on patterns
};

// Tolerances (configurable per merchant)
const DEFAULT_TOLERANCES = {
  amountPaise: 100,        // ₹1.00 in paise
  amountPercent: 0.001,    // 0.1%
  dateWindowDays: 2,       // T+2
  feeVariancePercent: 0.02 // 2% fee variance
};

class ReconciliationEngine {
  constructor(tolerances = DEFAULT_TOLERANCES) {
    this.tolerances = tolerances;
    this.stats = {
      total: 0,
      matched: 0,
      unmatched: 0,
      exceptions: 0,
      reasonCounts: {}
    };
  }

  // Main reconciliation method
  reconcile(pgTransactions, bankRecords, cycleDate, source = 'MANUAL') {
    const result = {
      id: this.generateId(),
      cycleDate,
      source,
      createdAt: new Date().toISOString(),
      matched: [],
      unmatched: [],
      exceptions: [],
      stats: null,
      topReasons: []
    };

    // Check for missing bank file
    if (!bankRecords || bankRecords.length === 0) {
      pgTransactions.forEach(txn => {
        result.unmatched.push(this.createUnmatchedItem(
          txn, 
          REASON_CODES.BANK_FILE_MISSING,
          'No bank file uploaded for this cycle',
          source
        ));
      });
      result.stats = this.calculateStats(result);
      return result;
    }

    // Index bank records for faster lookup
    const bankIndex = this.indexBankRecords(bankRecords);
    const usedBankRecords = new Set();
    
    // Check for duplicates
    const pgDuplicates = this.findDuplicates(pgTransactions, 'utr');
    const bankDuplicates = this.findDuplicates(bankRecords, 'UTR');

    // Process each PG transaction
    pgTransactions.forEach(pgTxn => {
      // Check for duplicate PG entries first
      if (pgDuplicates.has(pgTxn.utr)) {
        result.exceptions.push(this.createException(
          pgTxn,
          null,
          REASON_CODES.DUPLICATE_PG_ENTRY,
          `Duplicate UTR ${pgTxn.utr} found in ${pgDuplicates.get(pgTxn.utr)} PG transactions`,
          source
        ));
        return;
      }

      // Try to match with bank records
      const matchResult = this.matchTransaction(pgTxn, bankIndex, usedBankRecords, cycleDate);
      
      if (matchResult.matched) {
        result.matched.push({
          ...matchResult.match,
          source,
          matchTier: matchResult.tier
        });
      } else {
        // Classify the reason for no match
        const reasonClassification = this.classifyUnmatchedReason(
          pgTxn, 
          matchResult.potentialMatches,
          cycleDate
        );
        
        if (reasonClassification.isException) {
          result.exceptions.push(this.createException(
            pgTxn,
            matchResult.closestMatch,
            reasonClassification.code,
            reasonClassification.detail,
            source
          ));
        } else {
          result.unmatched.push(this.createUnmatchedItem(
            pgTxn,
            reasonClassification.code,
            reasonClassification.detail,
            source
          ));
        }
      }
    });

    // Find unmatched bank records
    bankRecords.forEach(bankRecord => {
      if (!usedBankRecords.has(bankRecord)) {
        // Check for duplicate bank entries
        if (bankDuplicates.has(bankRecord.UTR)) {
          result.exceptions.push(this.createException(
            null,
            bankRecord,
            REASON_CODES.DUPLICATE_BANK_ENTRY,
            `Duplicate UTR ${bankRecord.UTR} found in ${bankDuplicates.get(bankRecord.UTR)} bank records`,
            source
          ));
        } else {
          result.unmatched.push(this.createUnmatchedItem(
            bankRecord,
            REASON_CODES.BANK_TXN_MISSING_IN_PG,
            'No corresponding PG transaction found',
            source,
            true // isBank flag
          ));
        }
      }
    });

    // Calculate statistics
    result.stats = this.calculateStats(result);
    result.topReasons = this.calculateTopReasons(result);

    return result;
  }

  // Match a single transaction
  matchTransaction(pgTxn, bankIndex, usedBankRecords, cycleDate) {
    // Check for missing UTR
    if (!pgTxn.utr || pgTxn.utr === '') {
      return {
        matched: false,
        potentialMatches: [],
        reason: REASON_CODES.UTR_MISSING_OR_INVALID
      };
    }

    const utr = (pgTxn.utr || '').toUpperCase();
    let potentialMatches = bankIndex.byUTR.get(utr) || [];
    
    // Check for UTR format mismatch (e.g., RRN vs UTR)
    if (potentialMatches.length === 0) {
      // Check if it's a different format (RRN instead of UTR)
      if (utr.startsWith('RRN')) {
        // Try to find by transaction ID or amount
        const amountMatches = bankIndex.byAmount.get(pgTxn.amount) || [];
        if (amountMatches.length > 0) {
          return {
            matched: false,
            potentialMatches: amountMatches,
            reason: REASON_CODES.UTR_MISMATCH,
            closestMatch: amountMatches[0]
          };
        }
      }
      
      return {
        matched: false,
        potentialMatches: [],
        reason: REASON_CODES.PG_TXN_MISSING_IN_BANK
      };
    }

    // Try to find best match
    let bestMatch = null;
    let bestScore = 0;
    let bestTier = null;

    potentialMatches.forEach(bankRecord => {
      if (usedBankRecords.has(bankRecord)) return;

      const matchResult = this.scoreMatch(pgTxn, bankRecord, cycleDate);
      
      if (matchResult.score > bestScore) {
        bestScore = matchResult.score;
        bestMatch = bankRecord;
        bestTier = matchResult.tier;
      }
    });

    if (bestMatch && bestScore >= 70) {
      usedBankRecords.add(bestMatch);
      return {
        matched: true,
        tier: bestTier,
        match: {
          pgTransaction: pgTxn,
          bankRecord: bestMatch,
          confidence: bestScore,
          matchedOn: this.getMatchedFields(pgTxn, bestMatch)
        }
      };
    }

    return {
      matched: false,
      potentialMatches,
      closestMatch: bestMatch,
      closestScore: bestScore
    };
  }

  // Score a potential match
  scoreMatch(pgTxn, bankRecord, cycleDate) {
    let score = 0;
    let tier = null;

    // Check date window first
    if (!this.isWithinDateWindow(pgTxn.captured_at, bankRecord.DATE, cycleDate)) {
      return { score: 0, tier: null, reason: REASON_CODES.DATE_OUT_OF_WINDOW };
    }

    // Check amount match with enhanced fee detection
    const amountMatch = this.checkAmountMatch(pgTxn.amount, bankRecord.AMOUNT);
    const diff = Math.abs(pgTxn.amount - bankRecord.AMOUNT);
    
    if (amountMatch.exact) {
      score = 100;
      tier = MATCH_TIERS.EXACT;
    } else if (amountMatch.withinTolerance) {
      score = 85;
      tier = MATCH_TIERS.STRONG;
    } else {
      // Check for specific mismatch patterns
      if (diff >= 200 && diff <= 500) {
        // Likely fee difference (₹2 to ₹5)
        return { score: 0, tier: null, reason: 'FEE_MISMATCH' };
      } else if (diff === 1) {
        // Rounding error
        return { score: 0, tier: null, reason: 'ROUNDING_ERROR' };
      }
      return { score: 0, tier: null, reason: REASON_CODES.AMOUNT_MISMATCH };
    }

    // Additional checks for exact tier
    if (tier === MATCH_TIERS.EXACT) {
      // Check for status consistency
      if (pgTxn.status && bankRecord.STATUS && pgTxn.status !== bankRecord.STATUS) {
        score = 80;
        tier = MATCH_TIERS.STRONG;
      }
    }

    return { score, tier };
  }

  // Check if amount matches within tolerance
  checkAmountMatch(pgAmount, bankAmount) {
    const diff = Math.abs(pgAmount - bankAmount);
    const tolerance = Math.max(this.tolerances.amountPaise, pgAmount * this.tolerances.amountPercent);
    
    return {
      exact: diff === 0,
      withinTolerance: diff <= tolerance,
      difference: diff,
      toleranceUsed: tolerance
    };
  }

  // Check if dates are within acceptable window
  isWithinDateWindow(pgDate, bankDate, cycleDate) {
    // Handle missing or invalid dates
    if (!pgDate || !bankDate) {
      return true; // Allow match if dates are missing
    }
    
    try {
      const pgTime = new Date(pgDate).getTime();
      const bankTime = new Date(bankDate).getTime();
      
      // Check if dates are valid
      if (isNaN(pgTime) || isNaN(bankTime)) {
        return true; // Allow match if dates can't be parsed
      }
      
      const windowMs = this.tolerances.dateWindowDays * 24 * 60 * 60 * 1000;
      return Math.abs(pgTime - bankTime) <= windowMs;
    } catch (error) {
      // If date parsing fails, allow the match
      return true;
    }
  }

  // Classify reason for unmatched transaction
  classifyUnmatchedReason(pgTxn, potentialMatches, cycleDate) {
    // Priority order classification
    
    // 1. Missing or invalid UTR
    if (!pgTxn.utr || pgTxn.utr === '') {
      return {
        code: REASON_CODES.UTR_MISSING_OR_INVALID,
        detail: 'Transaction missing UTR reference',
        isException: true
      };
    }

    // 2. No potential matches found
    if (!potentialMatches || potentialMatches.length === 0) {
      return {
        code: REASON_CODES.PG_TXN_MISSING_IN_BANK,
        detail: `UTR ${pgTxn.utr} not found in bank records`,
        isException: false
      };
    }

    // 3. Check closest match for specific reason
    const closestMatch = potentialMatches[0];
    
    // Date out of window
    if (!this.isWithinDateWindow(pgTxn.captured_at, closestMatch.DATE, cycleDate)) {
      const pgDateStr = pgTxn.captured_at || cycleDate;
      const pgDate = pgDateStr ? (pgDateStr.includes('T') ? pgDateStr.split('T')[0] : pgDateStr) : cycleDate;
      const bankDate = closestMatch.DATE || cycleDate;
      return {
        code: REASON_CODES.DATE_OUT_OF_WINDOW,
        detail: `PG date ${pgDate} vs Bank date ${bankDate} exceeds ${this.tolerances.dateWindowDays} day window`,
        isException: true
      };
    }

    // Amount mismatch with detailed classification
    const amountCheck = this.checkAmountMatch(pgTxn.amount, closestMatch.AMOUNT);
    const diff = Math.abs(pgTxn.amount - closestMatch.AMOUNT);
    
    if (!amountCheck.withinTolerance) {
      // Classify the type of amount mismatch
      if (diff >= 200 && diff <= 500) {
        return {
          code: REASON_CODES.FEE_MISMATCH,
          detail: `Fee difference: PG ₹${(pgTxn.amount/100).toFixed(2)} vs Bank ₹${(closestMatch.AMOUNT/100).toFixed(2)} (diff: ₹${(diff/100).toFixed(2)})`,
          isException: true
        };
      } else if (diff === 1) {
        return {
          code: REASON_CODES.ROUNDING_ERROR,
          detail: `Rounding difference: ₹0.01`,
          isException: true
        };
      } else {
        return {
          code: REASON_CODES.AMOUNT_MISMATCH,
          detail: `PG ₹${(pgTxn.amount/100).toFixed(2)} vs Bank ₹${(closestMatch.AMOUNT/100).toFixed(2)} (diff: ₹${(diff/100).toFixed(2)})`,
          isException: true
        };
      }
    }

    // Status mismatch
    if (pgTxn.status && closestMatch.STATUS && pgTxn.status !== closestMatch.STATUS) {
      return {
        code: REASON_CODES.STATUS_MISMATCH,
        detail: `PG status '${pgTxn.status}' vs Bank status '${closestMatch.STATUS}'`,
        isException: true
      };
    }

    // Default fallback
    return {
      code: REASON_CODES.PG_TXN_MISSING_IN_BANK,
      detail: 'Unable to match with bank records',
      isException: false
    };
  }

  // Index bank records for efficient lookup
  indexBankRecords(bankRecords) {
    const index = {
      byUTR: new Map(),
      byAmount: new Map(),
      byDate: new Map()
    };

    bankRecords.forEach(record => {
      // Index by UTR
      const utr = (record.UTR || '').toUpperCase();
      if (utr) {
        if (!index.byUTR.has(utr)) {
          index.byUTR.set(utr, []);
        }
        index.byUTR.get(utr).push(record);
      }

      // Index by amount
      const amount = record.AMOUNT;
      if (!index.byAmount.has(amount)) {
        index.byAmount.set(amount, []);
      }
      index.byAmount.get(amount).push(record);

      // Index by date
      const date = record.DATE;
      if (!index.byDate.has(date)) {
        index.byDate.set(date, []);
      }
      index.byDate.get(date).push(record);
    });

    return index;
  }

  // Find duplicate entries
  findDuplicates(records, utrField) {
    const utrCounts = new Map();
    const duplicates = new Map();

    records.forEach(record => {
      const utr = record[utrField];
      if (utr) {
        utrCounts.set(utr, (utrCounts.get(utr) || 0) + 1);
      }
    });

    utrCounts.forEach((count, utr) => {
      if (count > 1) {
        duplicates.set(utr, count);
      }
    });

    return duplicates;
  }

  // Create unmatched item
  createUnmatchedItem(transaction, reasonCode, reasonDetail, source, isBank = false) {
    if (isBank) {
      return {
        type: 'BANK',
        transaction,
        reasonCode,
        reasonDetail,
        source,
        amount: transaction.AMOUNT,
        utr: transaction.UTR,
        date: transaction.DATE
      };
    }
    
    return {
      type: 'PG',
      transaction,
      reasonCode,
      reasonDetail,
      source,
      amount: transaction.amount,
      utr: transaction.utr,
      date: transaction.captured_at
    };
  }

  // Create exception
  createException(pgTxn, bankRecord, reasonCode, reasonDetail, source) {
    const severity = this.getSeverity(reasonCode);
    
    return {
      pgTransaction: pgTxn,
      bankRecord,
      reasonCode,
      reasonDetail,
      severity,
      source,
      resolution: this.getResolution(reasonCode),
      createdAt: new Date().toISOString()
    };
  }

  // Get severity for reason code
  getSeverity(reasonCode) {
    const critical = [
      REASON_CODES.BANK_FILE_MISSING,
      REASON_CODES.UTR_MISSING_OR_INVALID,
      REASON_CODES.DUPLICATE_PG_ENTRY,
      REASON_CODES.DUPLICATE_BANK_ENTRY
    ];
    
    const high = [
      REASON_CODES.AMOUNT_MISMATCH,
      REASON_CODES.DATE_OUT_OF_WINDOW,
      REASON_CODES.STATUS_MISMATCH,
      REASON_CODES.FEES_VARIANCE
    ];

    if (critical.includes(reasonCode)) return 'CRITICAL';
    if (high.includes(reasonCode)) return 'HIGH';
    return 'MEDIUM';
  }

  // Get resolution guidance
  getResolution(reasonCode) {
    const resolutions = {
      [REASON_CODES.BANK_FILE_MISSING]: 'Upload bank reconciliation file for this cycle',
      [REASON_CODES.PG_TXN_MISSING_IN_BANK]: 'Check with bank for transaction status',
      [REASON_CODES.BANK_TXN_MISSING_IN_PG]: 'Verify if transaction was processed through different channel',
      [REASON_CODES.UTR_MISSING_OR_INVALID]: 'Contact payment gateway for UTR reference',
      [REASON_CODES.DATE_OUT_OF_WINDOW]: 'Check for settlement delays or holiday impact',
      [REASON_CODES.AMOUNT_MISMATCH]: 'Verify fees and deductions with bank statement',
      [REASON_CODES.STATUS_MISMATCH]: 'Reconcile transaction status with both parties',
      [REASON_CODES.DUPLICATE_PG_ENTRY]: 'Investigate duplicate transaction submission',
      [REASON_CODES.DUPLICATE_BANK_ENTRY]: 'Check for duplicate bank postings',
      [REASON_CODES.CURRENCY_MISMATCH]: 'Verify currency conversion rates',
      [REASON_CODES.SCHEME_OR_MID_MISMATCH]: 'Verify merchant ID configuration',
      [REASON_CODES.FEES_VARIANCE]: 'Review fee structure with bank',
      [REASON_CODES.PARTIAL_CAPTURE_OR_REFUND_PENDING]: 'Check for partial captures or pending refunds',
      [REASON_CODES.SPLIT_SETTLEMENT_UNALLOCATED]: 'Review split settlement allocation'
    };

    return resolutions[reasonCode] || 'Manual review required';
  }

  // Get matched fields
  getMatchedFields(pgTxn, bankRecord) {
    const fields = [];
    
    if (pgTxn.utr === bankRecord.UTR) fields.push('utr');
    if (pgTxn.amount === bankRecord.AMOUNT) fields.push('amount_exact');
    if (this.checkAmountMatch(pgTxn.amount, bankRecord.AMOUNT).withinTolerance) {
      fields.push('amount_tolerance');
    }
    
    // Safe date parsing
    try {
      const pgDateObj = pgTxn.captured_at ? new Date(pgTxn.captured_at) : null;
      if (pgDateObj && !isNaN(pgDateObj.getTime())) {
        const pgDate = pgDateObj.toISOString().split('T')[0];
        if (pgDate === bankRecord.DATE) fields.push('date_exact');
      }
    } catch (e) {
      // Skip date matching if parsing fails
    }
    
    return fields;
  }

  // Calculate statistics
  calculateStats(result) {
    const stats = {
      total: result.matched.length + result.unmatched.length,
      matched: result.matched.length,
      unmatched: result.unmatched.length,
      exceptions: result.exceptions.length,
      matchRate: 0,
      reasonCounts: {}
    };

    // Calculate match rate
    if (stats.total > 0) {
      stats.matchRate = (stats.matched / stats.total * 100).toFixed(2);
    }

    // Count reasons
    [...result.unmatched, ...result.exceptions].forEach(item => {
      const code = item.reasonCode;
      stats.reasonCounts[code] = (stats.reasonCounts[code] || 0) + 1;
    });

    return stats;
  }

  // Calculate top reasons
  calculateTopReasons(result) {
    const reasonCounts = {};
    const total = result.unmatched.length + result.exceptions.length;

    [...result.unmatched, ...result.exceptions].forEach(item => {
      const code = item.reasonCode;
      reasonCounts[code] = (reasonCounts[code] || 0) + 1;
    });

    return Object.entries(reasonCounts)
      .map(([code, count]) => ({
        code,
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  // Generate unique ID
  generateId() {
    return `recon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = {
  ReconciliationEngine,
  REASON_CODES,
  MATCH_TIERS,
  DEFAULT_TOLERANCES
};