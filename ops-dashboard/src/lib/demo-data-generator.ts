// Demo Data Generator for Reports
// Deterministic, idempotent seeding with fixed PRNG

import seedrandom from 'seedrandom'

export interface DemoMerchant {
  id: string
  name: string
  mdr_rate: number // in basis points (e.g., 175 = 1.75%)
  tds_rate: number // in basis points (e.g., 100 = 1%)
}

export interface DemoAcquirer {
  id: string
  name: string
  code: string
}

export interface DemoTransaction {
  txn_id: string
  merchant_id: string
  acquirer_id: string
  amount_paise: bigint
  payment_method: 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET'
  utr: string
  rrn: string
  pg_date: string
  bank_date: string
  status: 'SUCCESS' | 'FAILED' | 'PENDING'
  created_at: string
}

export interface SettlementBatch {
  batch_id: string
  cycle_date: string
  merchant_id: string
  acquirer_id: string
  gross_amount_paise: bigint
  mdr_amount_paise: bigint
  gst_amount_paise: bigint // 18% of MDR
  tds_amount_paise: bigint
  net_amount_paise: bigint
  transaction_count: number
  status: 'PROCESSED' | 'PENDING' | 'FAILED'
}

export interface ReconResult {
  txn_id: string
  pg_amount_paise: bigint
  bank_amount_paise: bigint
  status: 'MATCHED' | 'UNMATCHED' | 'EXCEPTION'
  reason_code?: string
  cycle_date: string
}

export class DemoDataGenerator {
  private rng: seedrandom.PRNG
  
  // Fixed demo data
  private readonly merchants: DemoMerchant[] = [
    { id: 'MERCH001', name: 'Flipkart', mdr_rate: 175, tds_rate: 100 },
    { id: 'MERCH002', name: 'Amazon', mdr_rate: 150, tds_rate: 200 },
    { id: 'MERCH003', name: 'Myntra', mdr_rate: 200, tds_rate: 100 }
  ]
  
  private readonly acquirers: DemoAcquirer[] = [
    { id: 'ACQ001', name: 'AXIS Bank', code: 'AXIS' },
    { id: 'ACQ002', name: 'Bank of Baroda', code: 'BOB' },
    { id: 'ACQ003', name: 'HDFC Bank', code: 'HDFC' }
  ]
  
  private readonly paymentMethods = ['UPI', 'CARD', 'NETBANKING', 'WALLET'] as const
  
  private readonly reconReasonCodes = [
    'BANK_FILE_AWAITED',
    'AMOUNT_MISMATCH', 
    'DATE_MISMATCH',
    'MISSING_IN_BANK',
    'MISSING_IN_PG',
    'DUPLICATE_IN_BANK'
  ]
  
  constructor(seed?: string) {
    // Use fixed seed for deterministic generation
    this.rng = seedrandom(seed || 'settlepaisa-demo-2025')
  }
  
  // Generate random number between min and max (inclusive)
  private random(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min
  }
  
  // Generate random amount in paise (₹100 to ₹50,000)
  private randomAmountPaise(): bigint {
    return BigInt(this.random(10000, 5000000))
  }
  
  // Generate transaction ID
  private generateTxnId(date: string, index: number): string {
    const dateStr = date.replace(/-/g, '')
    return `TXN${dateStr}${String(index).padStart(6, '0')}`
  }
  
  // Generate UTR
  private generateUtr(date: string, index: number): string {
    const dateStr = date.replace(/-/g, '')
    return `UTR${dateStr}${String(index).padStart(8, '0')}`
  }
  
  // Generate RRN
  private generateRrn(date: string, index: number): string {
    const dateStr = date.replace(/-/g, '')
    return `RRN${dateStr}${String(index).padStart(10, '0')}`
  }
  
  // Check if date is working day (Mon-Fri)
  private isWorkingDay(date: Date): boolean {
    const day = date.getDay()
    return day >= 1 && day <= 5
  }
  
  // Generate transactions for a single day
  generateDayTransactions(date: string): DemoTransaction[] {
    const transactions: DemoTransaction[] = []
    
    if (!this.isWorkingDay(new Date(date))) {
      return transactions
    }
    
    let txIndex = 1
    
    for (const merchant of this.merchants) {
      for (const acquirer of this.acquirers) {
        // Generate 80-150 transactions per merchant per day
        const txCount = this.random(80, 150)
        
        for (let i = 0; i < txCount; i++) {
          const txn: DemoTransaction = {
            txn_id: this.generateTxnId(date, txIndex++),
            merchant_id: merchant.id,
            acquirer_id: acquirer.id,
            amount_paise: this.randomAmountPaise(),
            payment_method: this.paymentMethods[this.random(0, 3)],
            utr: this.generateUtr(date, txIndex),
            rrn: this.generateRrn(date, txIndex),
            pg_date: date,
            bank_date: date,
            status: 'SUCCESS',
            created_at: `${date}T${String(this.random(0, 23)).padStart(2, '0')}:${String(this.random(0, 59)).padStart(2, '0')}:00Z`
          }
          transactions.push(txn)
        }
      }
    }
    
    return transactions
  }
  
  // Generate settlement batch for a cycle
  generateSettlementBatch(
    cycleDate: string,
    transactions: DemoTransaction[]
  ): SettlementBatch[] {
    const batches: SettlementBatch[] = []
    
    // Group transactions by merchant and acquirer
    const groups = new Map<string, DemoTransaction[]>()
    
    for (const txn of transactions) {
      if (txn.status !== 'SUCCESS') continue
      
      const key = `${txn.merchant_id}_${txn.acquirer_id}`
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(txn)
    }
    
    // Create batch for each group
    for (const [key, txns] of groups) {
      const [merchantId, acquirerId] = key.split('_')
      const merchant = this.merchants.find(m => m.id === merchantId)!
      
      // Calculate amounts
      const grossAmount = txns.reduce((sum, txn) => sum + txn.amount_paise, BigInt(0))
      const mdrAmount = (grossAmount * BigInt(merchant.mdr_rate)) / BigInt(10000)
      const gstAmount = (mdrAmount * BigInt(1800)) / BigInt(10000) // 18% GST
      const tdsAmount = (grossAmount * BigInt(merchant.tds_rate)) / BigInt(10000)
      const netAmount = grossAmount - mdrAmount - gstAmount - tdsAmount
      
      const batch: SettlementBatch = {
        batch_id: `BATCH_${cycleDate.replace(/-/g, '')}_${merchantId}_${acquirerId}`,
        cycle_date: cycleDate,
        merchant_id: merchantId,
        acquirer_id: acquirerId,
        gross_amount_paise: grossAmount,
        mdr_amount_paise: mdrAmount,
        gst_amount_paise: gstAmount,
        tds_amount_paise: tdsAmount,
        net_amount_paise: netAmount,
        transaction_count: txns.length,
        status: 'PROCESSED'
      }
      
      batches.push(batch)
    }
    
    return batches
  }
  
  // Generate reconciliation results
  generateReconResults(transactions: DemoTransaction[], cycleDate: string): ReconResult[] {
    const results: ReconResult[] = []
    
    for (const txn of transactions) {
      if (txn.status !== 'SUCCESS') continue
      
      const rand = this.rng()
      let status: 'MATCHED' | 'UNMATCHED' | 'EXCEPTION'
      let reasonCode: string | undefined
      let bankAmount = txn.amount_paise
      
      if (rand < 0.7) {
        // 70% matched
        status = 'MATCHED'
      } else if (rand < 0.9) {
        // 20% unmatched
        status = 'UNMATCHED'
        reasonCode = this.reconReasonCodes[this.random(0, 2)]
        if (reasonCode === 'MISSING_IN_BANK') {
          bankAmount = BigInt(0)
        }
      } else {
        // 10% exceptions
        status = 'EXCEPTION'
        reasonCode = this.reconReasonCodes[this.random(3, 5)]
        
        if (reasonCode === 'AMOUNT_MISMATCH') {
          // Create small mismatch
          const delta = BigInt(this.random(100, 10000))
          bankAmount = txn.amount_paise - delta
        } else if (reasonCode === 'MISSING_IN_PG') {
          bankAmount = BigInt(0)
        }
      }
      
      const result: ReconResult = {
        txn_id: txn.txn_id,
        pg_amount_paise: txn.amount_paise,
        bank_amount_paise: bankAmount,
        status,
        reason_code: reasonCode,
        cycle_date: cycleDate
      }
      
      results.push(result)
    }
    
    return results
  }
  
  // Generate all demo data for last N days
  generateDemoData(days: number = 30): {
    transactions: DemoTransaction[]
    settlements: SettlementBatch[]
    reconResults: ReconResult[]
  } {
    const allTransactions: DemoTransaction[] = []
    const allSettlements: SettlementBatch[] = []
    const allReconResults: ReconResult[] = []
    
    const endDate = new Date()
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - days)
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0]
      
      // Generate transactions
      const dayTransactions = this.generateDayTransactions(dateStr)
      allTransactions.push(...dayTransactions)
      
      // Generate settlements
      if (dayTransactions.length > 0) {
        const settlements = this.generateSettlementBatch(dateStr, dayTransactions)
        allSettlements.push(...settlements)
        
        // Generate recon results
        const reconResults = this.generateReconResults(dayTransactions, dateStr)
        allReconResults.push(...reconResults)
      }
    }
    
    return {
      transactions: allTransactions,
      settlements: allSettlements,
      reconResults: allReconResults
    }
  }
  
  // Get merchant by ID
  getMerchant(id: string): DemoMerchant | undefined {
    return this.merchants.find(m => m.id === id)
  }
  
  // Get acquirer by ID
  getAcquirer(id: string): DemoAcquirer | undefined {
    return this.acquirers.find(a => a.id === id)
  }
  
  // Get all merchants
  getMerchants(): DemoMerchant[] {
    return this.merchants
  }
  
  // Get all acquirers
  getAcquirers(): DemoAcquirer[] {
    return this.acquirers
  }
}

// Singleton instance
export const demoDataGenerator = new DemoDataGenerator()