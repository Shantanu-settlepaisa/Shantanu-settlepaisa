// Reconciliation Engine for matching PG and Bank data
import { v4 as uuidv4 } from 'uuid'

export interface PGTransaction {
  transaction_id: string
  rrn: string
  utr: string
  amount: number
  captured_at: string
  payment_method: string
  bank: string
  merchant_id: string
}

export interface BankRecord {
  TRANSACTION_ID: string
  UTR: string
  AMOUNT: number
  DATE: string
}

export interface ReconciliationResult {
  id: string
  cycleDate: string
  pgSource: string
  bankSource: string
  totalPGTransactions: number
  totalBankRecords: number
  matched: MatchedRecord[]
  unmatchedPG: PGTransaction[]
  unmatchedBank: BankRecord[]
  exceptions: ExceptionRecord[]
  matchRate: number
  totalAmount: number
  reconciledAmount: number
  createdAt: string
}

export interface MatchedRecord {
  pgTransaction: PGTransaction
  bankRecord: BankRecord
  matchedOn: string[] // ['utr', 'amount']
  confidence: number
}

export interface ExceptionRecord {
  type: 'amount_mismatch' | 'duplicate_utr' | 'invalid_data'
  pgTransaction?: PGTransaction
  bankRecord?: BankRecord
  message: string
}

export class ReconciliationEngine {
  async reconcile(
    pgTransactions: PGTransaction[],
    bankRecords: BankRecord[],
    cycleDate: string,
    pgSource: string,
    bankSource: string
  ): Promise<ReconciliationResult> {
    const matched: MatchedRecord[] = []
    const unmatchedPG: PGTransaction[] = []
    const unmatchedBank: BankRecord[] = []
    const exceptions: ExceptionRecord[] = []
    
    // Create maps for faster lookup
    const bankByUTR = new Map<string, BankRecord[]>()
    const usedBankRecords = new Set<BankRecord>()
    
    // Index bank records by UTR
    bankRecords.forEach(record => {
      const utr = record.UTR.toUpperCase()
      if (!bankByUTR.has(utr)) {
        bankByUTR.set(utr, [])
      }
      bankByUTR.get(utr)!.push(record)
    })
    
    // Match PG transactions with Bank records
    pgTransactions.forEach(pgTxn => {
      const utr = pgTxn.utr.toUpperCase()
      const potentialMatches = bankByUTR.get(utr) || []
      
      if (potentialMatches.length === 0) {
        // No UTR match found
        unmatchedPG.push(pgTxn)
        return
      }
      
      // Find best match based on amount
      let bestMatch: BankRecord | null = null
      let bestScore = 0
      
      potentialMatches.forEach(bankRecord => {
        if (usedBankRecords.has(bankRecord)) return
        
        // Calculate match score
        let score = 0
        const matchedOn: string[] = ['utr']
        
        // Check amount match (allow small variance for fees)
        const amountDiff = Math.abs(pgTxn.amount - bankRecord.AMOUNT)
        const amountVariancePercent = (amountDiff / pgTxn.amount) * 100
        
        if (amountDiff === 0) {
          score += 100
          matchedOn.push('amount_exact')
        } else if (amountVariancePercent <= 1) {
          score += 90
          matchedOn.push('amount_close')
        } else if (amountVariancePercent <= 5) {
          score += 70
          matchedOn.push('amount_variance')
        } else {
          // Amount mismatch too high
          exceptions.push({
            type: 'amount_mismatch',
            pgTransaction: pgTxn,
            bankRecord,
            message: `Amount mismatch: PG ${pgTxn.amount} vs Bank ${bankRecord.AMOUNT} (${amountVariancePercent.toFixed(2)}% diff)`
          })
          return
        }
        
        if (score > bestScore) {
          bestScore = score
          bestMatch = bankRecord
        }
      })
      
      if (bestMatch && bestScore >= 70) {
        usedBankRecords.add(bestMatch)
        matched.push({
          pgTransaction: pgTxn,
          bankRecord: bestMatch,
          matchedOn: ['utr', 'amount'],
          confidence: bestScore
        })
      } else {
        unmatchedPG.push(pgTxn)
      }
    })
    
    // Find unmatched bank records
    bankRecords.forEach(record => {
      if (!usedBankRecords.has(record)) {
        unmatchedBank.push(record)
      }
    })
    
    // Check for duplicates
    const utrCounts = new Map<string, number>()
    pgTransactions.forEach(txn => {
      const count = (utrCounts.get(txn.utr) || 0) + 1
      utrCounts.set(txn.utr, count)
      if (count > 1) {
        exceptions.push({
          type: 'duplicate_utr',
          pgTransaction: txn,
          message: `Duplicate UTR found in PG transactions: ${txn.utr}`
        })
      }
    })
    
    // Calculate totals
    const totalAmount = pgTransactions.reduce((sum, txn) => sum + txn.amount, 0)
    const reconciledAmount = matched.reduce((sum, m) => sum + m.pgTransaction.amount, 0)
    const matchRate = pgTransactions.length > 0 
      ? (matched.length / pgTransactions.length) * 100 
      : 0
    
    return {
      id: uuidv4(),
      cycleDate,
      pgSource,
      bankSource,
      totalPGTransactions: pgTransactions.length,
      totalBankRecords: bankRecords.length,
      matched,
      unmatchedPG,
      unmatchedBank,
      exceptions,
      matchRate,
      totalAmount,
      reconciledAmount,
      createdAt: new Date().toISOString()
    }
  }
  
  // Format amount in Indian currency
  formatAmount(amount: number): string {
    const amountInRupees = amount / 100 // Convert from paise
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amountInRupees)
  }
  
  // Generate summary stats
  generateSummary(result: ReconciliationResult) {
    return {
      totalTransactions: result.totalPGTransactions,
      totalBankRecords: result.totalBankRecords,
      matched: result.matched.length,
      unmatchedPG: result.unmatchedPG.length,
      unmatchedBank: result.unmatchedBank.length,
      exceptions: result.exceptions.length,
      matchRate: `${result.matchRate.toFixed(2)}%`,
      totalAmount: this.formatAmount(result.totalAmount),
      reconciledAmount: this.formatAmount(result.reconciledAmount),
      unreconciledAmount: this.formatAmount(result.totalAmount - result.reconciledAmount)
    }
  }
}

export const reconciliationEngine = new ReconciliationEngine()