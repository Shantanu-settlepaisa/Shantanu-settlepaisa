import { demoDataGenerator } from '@/lib/demo-data-generator'
import type {
  SettlementSummaryRow,
  BankMISRow,
  ReconOutcomeRow,
  TaxReportRow,
  ReportFilters,
  ReportType
} from '@/types/reports'

// Enhanced Report Generator with Real Demo Data
export class ReportGeneratorV2 {
  private demoData: ReturnType<typeof demoDataGenerator.generateDemoData>
  
  constructor() {
    // Generate demo data for last 30 days
    this.demoData = demoDataGenerator.generateDemoData(30)
  }
  
  // Convert paise to rupees for display
  private paiseToRupees(paise: bigint): number {
    return Number(paise) / 100
  }
  
  // Format Indian currency
  private formatIndianCurrency(rupees: number): string {
    const formatted = rupees.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
    return `₹${formatted}`
  }
  
  // Generate Settlement Summary Report
  async generateSettlementSummary(filters: ReportFilters): Promise<SettlementSummaryRow[]> {
    const rows: SettlementSummaryRow[] = []
    
    // Filter settlements based on filters
    let filteredSettlements = this.demoData.settlements
    
    if (filters.fromDate) {
      filteredSettlements = filteredSettlements.filter(s => s.cycle_date >= filters.fromDate!)
    }
    
    if (filters.toDate) {
      filteredSettlements = filteredSettlements.filter(s => s.cycle_date <= filters.toDate!)
    }
    
    if (filters.cycleDate) {
      filteredSettlements = filteredSettlements.filter(s => s.cycle_date === filters.cycleDate)
    }
    
    if (filters.acquirer && filters.acquirer !== 'all') {
      const acquirer = demoDataGenerator.getAcquirers().find(a => a.code === filters.acquirer)
      if (acquirer) {
        filteredSettlements = filteredSettlements.filter(s => s.acquirer_id === acquirer.id)
      }
    }
    
    if (filters.merchant) {
      filteredSettlements = filteredSettlements.filter(s => s.merchant_id === filters.merchant)
    }
    
    // Convert to report rows
    for (const settlement of filteredSettlements) {
      const merchant = demoDataGenerator.getMerchant(settlement.merchant_id)
      const acquirer = demoDataGenerator.getAcquirer(settlement.acquirer_id)
      
      if (!merchant || !acquirer) continue
      
      rows.push({
        cycleDate: settlement.cycle_date,
        acquirer: acquirer.code,
        merchant: merchant.id,
        merchantName: merchant.name,
        grossAmountPaise: settlement.gross_amount_paise,
        grossAmountRupees: this.paiseToRupees(settlement.gross_amount_paise),
        feesPaise: settlement.mdr_amount_paise,
        feesRupees: this.paiseToRupees(settlement.mdr_amount_paise),
        gstPaise: settlement.gst_amount_paise,
        gstRupees: this.paiseToRupees(settlement.gst_amount_paise),
        tdsPaise: settlement.tds_amount_paise,
        tdsRupees: this.paiseToRupees(settlement.tds_amount_paise),
        netAmountPaise: settlement.net_amount_paise,
        netAmountRupees: this.paiseToRupees(settlement.net_amount_paise),
        transactionCount: settlement.transaction_count
      })
    }
    
    return rows
  }
  
  // Generate Bank MIS Report
  async generateBankMIS(filters: ReportFilters): Promise<BankMISRow[]> {
    const rows: BankMISRow[] = []
    const cycleDate = filters.cycleDate || new Date().toISOString().split('T')[0]
    
    // Get transactions and recon results for the cycle
    const cycleTxns = this.demoData.transactions.filter(t => t.pg_date === cycleDate)
    const cycleRecon = this.demoData.reconResults.filter(r => r.cycle_date === cycleDate)
    
    // Create recon map
    const reconMap = new Map(cycleRecon.map(r => [r.txn_id, r]))
    
    for (const txn of cycleTxns) {
      const recon = reconMap.get(txn.txn_id)
      const merchant = demoDataGenerator.getMerchant(txn.merchant_id)
      const acquirer = demoDataGenerator.getAcquirer(txn.acquirer_id)
      
      if (!merchant || !acquirer) continue
      
      // Apply filters
      if (filters.acquirer && filters.acquirer !== 'all' && acquirer.code !== filters.acquirer) {
        continue
      }
      
      if (filters.merchant && txn.merchant_id !== filters.merchant) {
        continue
      }
      
      const bankAmount = recon?.bank_amount_paise || txn.amount_paise
      const delta = txn.amount_paise - bankAmount
      
      rows.push({
        txnId: txn.txn_id,
        utr: txn.utr,
        rrn: txn.rrn,
        pgAmountPaise: txn.amount_paise,
        pgAmountRupees: this.paiseToRupees(txn.amount_paise),
        bankAmountPaise: bankAmount,
        bankAmountRupees: this.paiseToRupees(bankAmount),
        deltaPaise: delta,
        deltaRupees: this.paiseToRupees(delta),
        pgDate: txn.pg_date,
        bankDate: txn.bank_date,
        reconStatus: recon?.status || 'MATCHED',
        reasonCode: recon?.reason_code,
        acquirer: acquirer.code,
        merchant: merchant.id,
        merchantName: merchant.name,
        paymentMethod: txn.payment_method
      })
    }
    
    return rows
  }
  
  // Generate Recon Outcome Report
  async generateReconOutcome(filters: ReportFilters): Promise<ReconOutcomeRow[]> {
    const rows: ReconOutcomeRow[] = []
    const cycleDate = filters.cycleDate || new Date().toISOString().split('T')[0]
    
    // Get recon results for the cycle
    let cycleRecon = this.demoData.reconResults.filter(r => r.cycle_date === cycleDate)
    
    // Apply status filter
    if (filters.status) {
      cycleRecon = cycleRecon.filter(r => r.status === filters.status)
    }
    
    // Get transaction details
    const txnMap = new Map(this.demoData.transactions.map(t => [t.txn_id, t]))
    
    for (const recon of cycleRecon) {
      const txn = txnMap.get(recon.txn_id)
      if (!txn) continue
      
      const merchant = demoDataGenerator.getMerchant(txn.merchant_id)
      const acquirer = demoDataGenerator.getAcquirer(txn.acquirer_id)
      
      if (!merchant || !acquirer) continue
      
      // Apply filters
      if (filters.acquirer && filters.acquirer !== 'all' && acquirer.code !== filters.acquirer) {
        continue
      }
      
      if (filters.merchant && txn.merchant_id !== filters.merchant) {
        continue
      }
      
      rows.push({
        reconJobId: `JOB_${cycleDate.replace(/-/g, '')}`,
        cycleDate,
        txnId: recon.txn_id,
        pgRefId: txn.utr,
        bankRefId: recon.status !== 'UNMATCHED' ? txn.rrn : undefined,
        amountPaise: recon.pg_amount_paise,
        amountRupees: this.paiseToRupees(recon.pg_amount_paise),
        status: recon.status,
        matchedAt: recon.status === 'MATCHED' ? new Date().toISOString() : undefined,
        exceptionType: recon.reason_code,
        exceptionReason: this.getReasonDescription(recon.reason_code),
        merchant: merchant.id,
        merchantName: merchant.name,
        acquirer: acquirer.code,
        paymentMethod: txn.payment_method
      })
    }
    
    return rows
  }
  
  // Generate Tax Report
  async generateTaxReport(filters: ReportFilters): Promise<TaxReportRow[]> {
    const rows: TaxReportRow[] = []
    
    // Group settlements by month and merchant
    const monthlyData = new Map<string, Map<string, typeof this.demoData.settlements>>()
    
    for (const settlement of this.demoData.settlements) {
      // Apply date filters
      if (filters.fromDate && settlement.cycle_date < filters.fromDate) continue
      if (filters.toDate && settlement.cycle_date > filters.toDate) continue
      if (filters.merchant && settlement.merchant_id !== filters.merchant) continue
      
      const month = settlement.cycle_date.substring(0, 7) // YYYY-MM
      
      if (!monthlyData.has(month)) {
        monthlyData.set(month, new Map())
      }
      
      const monthData = monthlyData.get(month)!
      if (!monthData.has(settlement.merchant_id)) {
        monthData.set(settlement.merchant_id, [])
      }
      
      monthData.get(settlement.merchant_id)!.push(settlement)
    }
    
    // Generate tax report rows
    for (const [month, merchantData] of monthlyData) {
      for (const [merchantId, settlements] of merchantData) {
        const merchant = demoDataGenerator.getMerchant(merchantId)
        if (!merchant) continue
        
        // Aggregate amounts
        const totalGross = settlements.reduce((sum, s) => sum + s.gross_amount_paise, BigInt(0))
        const totalMdr = settlements.reduce((sum, s) => sum + s.mdr_amount_paise, BigInt(0))
        const totalGst = settlements.reduce((sum, s) => sum + s.gst_amount_paise, BigInt(0))
        const totalTds = settlements.reduce((sum, s) => sum + s.tds_amount_paise, BigInt(0))
        
        rows.push({
          cycleDate: `${month}-01`,
          merchant: merchant.id,
          merchantName: merchant.name,
          grossAmountPaise: totalGross,
          grossAmountRupees: this.paiseToRupees(totalGross),
          commissionPaise: totalMdr,
          commissionRupees: this.paiseToRupees(totalMdr),
          gstRatePct: 18,
          gstAmountPaise: totalGst,
          gstAmountRupees: this.paiseToRupees(totalGst),
          tdsRatePct: merchant.tds_rate / 100,
          tdsAmountPaise: totalTds,
          tdsAmountRupees: this.paiseToRupees(totalTds),
          hsnCode: '997214',
          sacCode: 'SAC9972',
          invoiceNumber: `INV${month.replace(/-/g, '')}${merchant.id}`
        })
      }
    }
    
    return rows
  }
  
  // Get reason code description
  private getReasonDescription(code?: string): string | undefined {
    if (!code) return undefined
    
    const descriptions: Record<string, string> = {
      'BANK_FILE_AWAITED': 'Bank file not yet received',
      'AMOUNT_MISMATCH': 'PG and Bank amounts do not match',
      'DATE_MISMATCH': 'Transaction dates do not match',
      'MISSING_IN_BANK': 'Transaction not found in bank file',
      'MISSING_IN_PG': 'Transaction not found in PG records',
      'DUPLICATE_IN_BANK': 'Duplicate transaction in bank file'
    }
    
    return descriptions[code] || code
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
  
  // Generate CSV content
  async generateCSV(type: ReportType, filters: ReportFilters): Promise<string> {
    const data = await this.generateReport(type, filters)
    if (data.length === 0) return ''
    
    // Get headers based on report type
    const headers = this.getCSVHeaders(type)
    
    // Convert data to CSV rows
    const rows = data.map(row => {
      return headers.map(header => {
        const value = row[header.field]
        
        // Format currency values
        if (header.type === 'currency' && typeof value === 'number') {
          return this.formatIndianCurrency(value)
        }
        
        // Handle null/undefined
        if (value === null || value === undefined) {
          return ''
        }
        
        // Handle strings with commas
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`
        }
        
        return value
      }).join(',')
    })
    
    // Combine headers and rows
    const csvHeaders = headers.map(h => h.label).join(',')
    return [csvHeaders, ...rows].join('\n')
  }
  
  // Get CSV headers for report type
  private getCSVHeaders(type: ReportType): Array<{ field: string, label: string, type?: string }> {
    switch (type) {
      case 'SETTLEMENT_SUMMARY':
        return [
          { field: 'cycleDate', label: 'cycle_date' },
          { field: 'acquirer', label: 'acquirer' },
          { field: 'merchantName', label: 'merchant' },
          { field: 'grossAmountRupees', label: 'gross_amount', type: 'currency' },
          { field: 'feesRupees', label: 'fees', type: 'currency' },
          { field: 'gstRupees', label: 'gst', type: 'currency' },
          { field: 'tdsRupees', label: 'tds', type: 'currency' },
          { field: 'netAmountRupees', label: 'net_amount', type: 'currency' },
          { field: 'transactionCount', label: 'txn_count' }
        ]
        
      case 'BANK_MIS':
        return [
          { field: 'txnId', label: 'txn_id' },
          { field: 'utr', label: 'utr_rrn' },
          { field: 'pgAmountRupees', label: 'pg_amount', type: 'currency' },
          { field: 'bankAmountRupees', label: 'bank_amount', type: 'currency' },
          { field: 'deltaRupees', label: 'delta', type: 'currency' },
          { field: 'pgDate', label: 'pg_date' },
          { field: 'bankDate', label: 'bank_date' },
          { field: 'reconStatus', label: 'recon_status' },
          { field: 'reasonCode', label: 'reason_code' },
          { field: 'acquirer', label: 'acquirer' },
          { field: 'merchantName', label: 'merchant' },
          { field: 'paymentMethod', label: 'method' }
        ]
        
      case 'RECON_OUTCOME':
        return [
          { field: 'txnId', label: 'txn_id' },
          { field: 'status', label: 'status' },
          { field: 'exceptionType', label: 'reason_code' },
          { field: 'amountRupees', label: 'pg_amount', type: 'currency' },
          { field: 'amountRupees', label: 'bank_amount', type: 'currency' },
          { field: 'deltaRupees', label: 'delta', type: 'currency' },
          { field: 'cycleDate', label: 'cycle_date' },
          { field: 'acquirer', label: 'acquirer' },
          { field: 'merchantName', label: 'merchant' }
        ]
        
      case 'TAX':
        return [
          { field: 'cycleDate', label: 'month' },
          { field: 'merchantName', label: 'merchant' },
          { field: 'commissionRupees', label: 'commission_base', type: 'currency' },
          { field: 'gstRatePct', label: 'gst_18_pct' },
          { field: 'gstAmountRupees', label: 'gst_amount', type: 'currency' },
          { field: 'tdsRatePct', label: 'tds_pct' },
          { field: 'tdsAmountRupees', label: 'tds', type: 'currency' },
          { field: 'netAmountRupees', label: 'net_payable', type: 'currency' }
        ]
        
      default:
        return []
    }
  }
}

// Singleton instance
export const reportGeneratorV2 = new ReportGeneratorV2()