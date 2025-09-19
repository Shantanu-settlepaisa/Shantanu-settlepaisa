import type {
  SettlementSummaryRow,
  BankMISRow,
  ReconOutcomeRow,
  TaxReportRow,
  ReportFilters,
  ReportType
} from '@/types/reports'

// Mock data generators for demo purposes
// In production, these would query actual database tables

export class ReportGenerator {
  // Convert paise to rupees for display
  private paiseToRupees(paise: bigint): number {
    return Number(paise) / 100
  }

  // Generate Settlement Summary Report
  async generateSettlementSummary(filters: ReportFilters): Promise<SettlementSummaryRow[]> {
    const rows: SettlementSummaryRow[] = []
    
    // Mock data generation
    const startDate = new Date(filters.fromDate || new Date().toISOString().split('T')[0])
    const endDate = new Date(filters.toDate || new Date().toISOString().split('T')[0])
    
    const acquirers = ['AXIS', 'HDFC', 'ICICI', 'BOB']
    const merchants = [
      { id: 'MERCH001', name: 'Flipkart' },
      { id: 'MERCH002', name: 'Amazon' },
      { id: 'MERCH003', name: 'Myntra' }
    ]
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const cycleDate = date.toISOString().split('T')[0]
      
      for (const acquirer of acquirers) {
        if (filters.acquirer && filters.acquirer !== acquirer) continue
        
        for (const merchant of merchants) {
          if (filters.merchant && filters.merchant !== merchant.id) continue
          
          const grossAmount = BigInt(Math.floor(Math.random() * 10000000))
          const fees = grossAmount / BigInt(100) // 1% fees
          const gst = fees * BigInt(18) / BigInt(100) // 18% GST
          const tds = grossAmount * BigInt(1) / BigInt(100) // 1% TDS
          const netAmount = grossAmount - fees - gst - tds
          
          rows.push({
            cycleDate,
            acquirer,
            merchant: merchant.id,
            merchantName: merchant.name,
            grossAmountPaise: grossAmount,
            grossAmountRupees: this.paiseToRupees(grossAmount),
            feesPaise: fees,
            feesRupees: this.paiseToRupees(fees),
            gstPaise: gst,
            gstRupees: this.paiseToRupees(gst),
            tdsPaise: tds,
            tdsRupees: this.paiseToRupees(tds),
            netAmountPaise: netAmount,
            netAmountRupees: this.paiseToRupees(netAmount),
            transactionCount: Math.floor(Math.random() * 1000) + 100
          })
        }
      }
    }
    
    return rows
  }

  // Generate Bank MIS Report
  async generateBankMIS(filters: ReportFilters): Promise<BankMISRow[]> {
    const rows: BankMISRow[] = []
    const cycleDate = filters.cycleDate || new Date().toISOString().split('T')[0]
    
    // Generate mock transactions
    for (let i = 0; i < 100; i++) {
      const pgAmount = BigInt(Math.floor(Math.random() * 100000))
      const bankAmount = Math.random() > 0.95 
        ? pgAmount + BigInt(Math.floor(Math.random() * 100)) // 5% mismatch
        : pgAmount
      const delta = pgAmount - bankAmount
      
      const status = delta === BigInt(0) ? 'MATCHED' : 
                    Math.random() > 0.5 ? 'UNMATCHED' : 'EXCEPTION'
      
      rows.push({
        txnId: `TXN${String(i + 1).padStart(6, '0')}`,
        utr: `UTR${String(i + 1).padStart(8, '0')}`,
        rrn: `RRN${String(i + 1).padStart(12, '0')}`,
        pgAmountPaise: pgAmount,
        pgAmountRupees: this.paiseToRupees(pgAmount),
        bankAmountPaise: bankAmount,
        bankAmountRupees: this.paiseToRupees(bankAmount),
        deltaPaise: delta,
        deltaRupees: this.paiseToRupees(delta),
        pgDate: cycleDate,
        bankDate: cycleDate,
        reconStatus: status as any,
        reasonCode: status !== 'MATCHED' ? 'AMOUNT_MISMATCH' : undefined,
        acquirer: filters.acquirer || 'AXIS',
        merchant: 'MERCH001',
        merchantName: 'Flipkart',
        paymentMethod: ['UPI', 'CARD', 'NETBANKING'][Math.floor(Math.random() * 3)]
      })
    }
    
    return rows
  }

  // Generate Recon Outcome Report
  async generateReconOutcome(filters: ReportFilters): Promise<ReconOutcomeRow[]> {
    const rows: ReconOutcomeRow[] = []
    const cycleDate = filters.cycleDate || new Date().toISOString().split('T')[0]
    const statuses = filters.status ? [filters.status] : ['MATCHED', 'UNMATCHED', 'EXCEPTION']
    
    let txnCount = 0
    for (const status of statuses) {
      const count = status === 'MATCHED' ? 80 : status === 'UNMATCHED' ? 15 : 5
      
      for (let i = 0; i < count; i++) {
        txnCount++
        const amount = BigInt(Math.floor(Math.random() * 100000))
        
        rows.push({
          reconJobId: `JOB_${cycleDate.replace(/-/g, '')}`,
          cycleDate,
          txnId: `TXN${String(txnCount).padStart(6, '0')}`,
          pgRefId: `PG${String(txnCount).padStart(8, '0')}`,
          bankRefId: status !== 'UNMATCHED' ? `BNK${String(txnCount).padStart(8, '0')}` : undefined,
          amountPaise: amount,
          amountRupees: this.paiseToRupees(amount),
          status: status as any,
          matchedAt: status === 'MATCHED' ? new Date().toISOString() : undefined,
          exceptionType: status === 'EXCEPTION' ? 'AMOUNT_MISMATCH' : undefined,
          exceptionReason: status === 'EXCEPTION' ? 'PG and Bank amounts do not match' : undefined,
          merchant: 'MERCH001',
          merchantName: 'Flipkart',
          acquirer: filters.acquirer || 'AXIS',
          paymentMethod: 'UPI'
        })
      }
    }
    
    return rows
  }

  // Generate Tax Report
  async generateTaxReport(filters: ReportFilters): Promise<TaxReportRow[]> {
    const rows: TaxReportRow[] = []
    
    const startDate = new Date(filters.fromDate || new Date().toISOString().split('T')[0])
    const endDate = new Date(filters.toDate || new Date().toISOString().split('T')[0])
    
    const merchants = [
      { id: 'MERCH001', name: 'Flipkart' },
      { id: 'MERCH002', name: 'Amazon' },
      { id: 'MERCH003', name: 'Myntra' }
    ]
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const cycleDate = date.toISOString().split('T')[0]
      
      for (const merchant of merchants) {
        if (filters.merchant && filters.merchant !== merchant.id) continue
        
        const grossAmount = BigInt(Math.floor(Math.random() * 10000000))
        const commission = grossAmount / BigInt(100) // 1% commission
        const gstRate = 18 // 18% GST
        const gstAmount = commission * BigInt(gstRate) / BigInt(100)
        const tdsRate = 1 // 1% TDS
        const tdsAmount = grossAmount * BigInt(tdsRate) / BigInt(100)
        
        rows.push({
          cycleDate,
          merchant: merchant.id,
          merchantName: merchant.name,
          grossAmountPaise: grossAmount,
          grossAmountRupees: this.paiseToRupees(grossAmount),
          commissionPaise: commission,
          commissionRupees: this.paiseToRupees(commission),
          gstRatePct: gstRate,
          gstAmountPaise: gstAmount,
          gstAmountRupees: this.paiseToRupees(gstAmount),
          tdsRatePct: tdsRate,
          tdsAmountPaise: tdsAmount,
          tdsAmountRupees: this.paiseToRupees(tdsAmount),
          hsnCode: '997214',
          sacCode: 'SAC9972',
          invoiceNumber: `INV${cycleDate.replace(/-/g, '')}${merchant.id}`
        })
      }
    }
    
    return rows
  }

  // Generate report based on type
  async generateReport(type: ReportType, filters: ReportFilters): Promise<any[]> {
    switch (type) {
      case 'SETTLEMENT_SUMMARY':
        return this.generateSettlementSummary(filters)
      case 'BANK_MIS':
        return this.generateBankMIS(filters)
      case 'RECON_OUTCOME':
        return this.generateReconOutcome(filters)
      case 'TAX':
        return this.generateTaxReport(filters)
      default:
        throw new Error(`Unknown report type: ${type}`)
    }
  }
}

// Singleton instance
export const reportGenerator = new ReportGenerator()