export interface DataConsistencyCheck {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    credited: number;
    sentToBank: number;
    difference: number;
    percentageCompliance: number;
  };
}

/**
 * Guards data consistency for settlements
 * Core rule: credited ≤ sentToBank (always)
 */
export function validateSettlementConsistency(
  credited: number, 
  sentToBank: number,
  tolerance: number = 0 // Zero tolerance by default
): DataConsistencyCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const difference = sentToBank - credited;
  const isValid = credited <= sentToBank + tolerance;
  
  if (!isValid) {
    errors.push(
      `CRITICAL: Credited amount (₹${credited.toLocaleString('en-IN')}) exceeds sentToBank (₹${sentToBank.toLocaleString('en-IN')})`
    );
  }
  
  // Add warnings for edge cases
  if (difference > sentToBank * 0.1 && sentToBank > 0) {
    warnings.push(
      `Large gap detected: ₹${difference.toLocaleString('en-IN')} difference between sentToBank and credited`
    );
  }
  
  if (credited === 0 && sentToBank > 0) {
    warnings.push('No amount credited despite funds sent to bank');
  }
  
  const percentageCompliance = sentToBank > 0 
    ? Math.min((credited / sentToBank) * 100, 100) 
    : 0;
  
  return {
    isValid,
    errors,
    warnings,
    metrics: {
      credited,
      sentToBank,
      difference,
      percentageCompliance
    }
  };
}

/**
 * Batch validation for multiple settlement records
 */
export function validateBatchConsistency(
  settlements: Array<{ credited: number; sentToBank: number; id?: string }>
): {
  allValid: boolean;
  failedCount: number;
  results: Map<string, DataConsistencyCheck>;
} {
  const results = new Map<string, DataConsistencyCheck>();
  let failedCount = 0;
  
  settlements.forEach((settlement, index) => {
    const id = settlement.id || `settlement-${index}`;
    const check = validateSettlementConsistency(
      settlement.credited,
      settlement.sentToBank
    );
    
    results.set(id, check);
    if (!check.isValid) failedCount++;
  });
  
  return {
    allValid: failedCount === 0,
    failedCount,
    results
  };
}

/**
 * Real-time monitoring hook for data consistency
 */
export function useDataConsistencyMonitor() {
  return {
    validate: validateSettlementConsistency,
    validateBatch: validateBatchConsistency,
    rules: {
      core: 'credited ≤ sentToBank',
      description: 'Credited amount must never exceed amount sent to bank'
    }
  };
}