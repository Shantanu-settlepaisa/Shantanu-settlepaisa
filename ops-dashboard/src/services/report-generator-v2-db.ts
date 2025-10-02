import type {
  SettlementSummaryRow,
  BankMISRow,
  ReconOutcomeRow,
  TaxReportRow,
  ReportFilters,
  ReportType
} from '@/types/reports'

// V2 Database-Connected Report Generator
export class ReportGeneratorV2DB {
  private readonly API_BASE_URL = 'http://localhost:5108'
  
  // Convert paise to rupees for display
  private paiseToRupees(paise: string | number | bigint): number {
    const paiseNum = typeof paise === 'bigint' ? Number(paise) : Number(paise)
    return paiseNum / 100
  }
  
  // Format Indian currency
  private formatIndianCurrency(rupees: number): string {
    const formatted = rupees.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
    return `₹${formatted}`
  }

  // Fetch data from V2 database via API
  private async fetchV2Data(endpoint: string, params?: Record<string, string>): Promise<any> {
    const url = new URL(`${this.API_BASE_URL}${endpoint}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }

    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error(`Failed to fetch from ${endpoint}: ${response.status}`)
    }
    
    return response.json()
  }
  
  // Generate Settlement Summary Report from V2 Database
  async generateSettlementSummary(filters: ReportFilters): Promise<SettlementSummaryRow[]> {
    try {
      // Fetch settlement batches from V2 database
      const params: Record<string, string> = {}
      if (filters.fromDate) params.from_date = filters.fromDate
      if (filters.toDate) params.to_date = filters.toDate
      if (filters.cycleDate) params.cycle_date = filters.cycleDate
      if (filters.merchant) params.merchant_id = filters.merchant
      
      const settlementData = await this.fetchV2Data('/api/reports/settlements', params)
      const rows: SettlementSummaryRow[] = []
      
      // Transform database results to report format
      for (const settlement of settlementData.settlements || []) {
        rows.push({
          cycleDate: settlement.cycle_date,
          acquirer: settlement.acquirer_name || 'N/A',
          merchant: settlement.merchant_id,
          merchantName: settlement.merchant_name || `Merchant ${settlement.merchant_id}`,
          grossAmountPaise: BigInt(settlement.gross_amount_paise || 0),
          grossAmountRupees: this.paiseToRupees(settlement.gross_amount_paise || 0),
          feesPaise: BigInt(settlement.total_commission_paise || 0),
          feesRupees: this.paiseToRupees(settlement.total_commission_paise || 0),
          gstPaise: BigInt(settlement.total_gst_paise || 0),
          gstRupees: this.paiseToRupees(settlement.total_gst_paise || 0),
          tdsPaise: BigInt(settlement.total_tds_paise || 0),
          tdsRupees: this.paiseToRupees(settlement.total_tds_paise || 0),
          netAmountPaise: BigInt(settlement.net_amount_paise || 0),
          netAmountRupees: this.paiseToRupees(settlement.net_amount_paise || 0),
          transactionCount: settlement.total_transactions || 0
        })
      }
      
      return rows
    } catch (error) {
      console.error('Failed to generate settlement summary:', error)
      return []
    }
  }
  
  // Generate Bank MIS Report from V2 Database
  async generateBankMIS(filters: ReportFilters): Promise<BankMISRow[]> {
    try {
      const params: Record<string, string> = {}
      if (filters.cycleDate) params.cycle_date = filters.cycleDate
      if (filters.fromDate) params.from_date = filters.fromDate
      if (filters.toDate) params.to_date = filters.toDate
      
      const misData = await this.fetchV2Data('/api/reports/bank-mis', params)
      const rows: BankMISRow[] = []
      
      // Transform database results to report format
      for (const record of misData.records || []) {
        rows.push({
          txnId: record.transaction_id,
          pgRefId: record.pgw_ref,
          bankRefId: record.bank_reference || 'N/A',
          utr: record.utr,
          pgAmountPaise: BigInt(record.pg_amount_paise || 0),
          pgAmountRupees: this.paiseToRupees(record.pg_amount_paise || 0),
          bankAmountPaise: BigInt(record.bank_amount_paise || 0),
          bankAmountRupees: this.paiseToRupees(record.bank_amount_paise || 0),
          deltaRupees: this.paiseToRupees((record.pg_amount_paise || 0) - (record.bank_amount_paise || 0)),
          pgDate: record.pg_date,
          bankDate: record.bank_date,
          reconStatus: record.recon_status || 'PENDING',
          acquirer: record.acquirer || 'N/A',
          merchant: record.merchant_id,
          paymentMethod: record.payment_mode
        })
      }
      
      return rows
    } catch (error) {
      console.error('Failed to generate bank MIS:', error)
      return []
    }
  }
  
  // Generate Reconciliation Outcome Report from V2 Database
  async generateReconOutcome(filters: ReportFilters): Promise<ReconOutcomeRow[]> {
    try {
      const params: Record<string, string> = {}
      if (filters.cycleDate) params.cycle_date = filters.cycleDate
      if (filters.fromDate) params.from_date = filters.fromDate
      if (filters.toDate) params.to_date = filters.toDate
      
      const reconData = await this.fetchV2Data('/api/reports/recon-outcome', params)
      const rows: ReconOutcomeRow[] = []
      
      // Transform database results to report format
      for (const outcome of reconData.outcomes || []) {
        rows.push({
          txnId: outcome.transaction_id,
          pgRefId: outcome.pgw_ref,
          bankRefId: outcome.bank_reference || 'N/A',
          amountPaise: BigInt(outcome.amount_paise || 0),
          amountRupees: this.paiseToRupees(outcome.amount_paise || 0),
          status: outcome.status,
          exceptionType: outcome.exception_type || 'N/A',
          merchant: outcome.merchant_id,
          acquirer: outcome.acquirer || 'N/A',
          paymentMethod: outcome.payment_mode,
          reconDate: outcome.recon_date,
          comments: outcome.comments || ''
        })
      }
      
      return rows
    } catch (error) {
      console.error('Failed to generate recon outcome:', error)
      return []
    }
  }
  
  // Generate Tax Report from V2 Database
  async generateTaxReport(filters: ReportFilters): Promise<TaxReportRow[]> {
    try {
      const params: Record<string, string> = {}
      if (filters.cycleDate) params.cycle_date = filters.cycleDate
      if (filters.fromDate) params.from_date = filters.fromDate
      if (filters.toDate) params.to_date = filters.toDate
      if (filters.merchant) params.merchant_id = filters.merchant
      
      const taxData = await this.fetchV2Data('/api/reports/tax', params)
      const rows: TaxReportRow[] = []
      
      // Transform database results to report format
      for (const record of taxData.records || []) {
        rows.push({
          cycleDate: record.cycle_date,
          merchant: record.merchant_id,
          merchantName: record.merchant_name || `Merchant ${record.merchant_id}`,
          grossAmountPaise: BigInt(record.gross_amount_paise || 0),
          grossAmountRupees: this.paiseToRupees(record.gross_amount_paise || 0),
          commissionPaise: BigInt(record.commission_paise || 0),
          commissionRupees: this.paiseToRupees(record.commission_paise || 0),
          gstRatePct: record.gst_rate_pct || 18.0,
          gstAmountPaise: BigInt(record.gst_amount_paise || 0),
          gstAmountRupees: this.paiseToRupees(record.gst_amount_paise || 0),
          tdsRatePct: record.tds_rate_pct || 2.0,
          tdsAmountPaise: BigInt(record.tds_amount_paise || 0),
          tdsAmountRupees: this.paiseToRupees(record.tds_amount_paise || 0),
          invoiceNumber: record.invoice_number || 'N/A',
          pan: record.pan || 'N/A',
          gstin: record.gstin || 'N/A'
        })
      }
      
      return rows
    } catch (error) {
      console.error('Failed to generate tax report:', error)
      return []
    }
  }

  // Generic report generation method
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
        throw new Error(`Unsupported report type: ${type}`)
    }
  }

  // Generate CSV format for any report type
  async generateCSV(type: ReportType, filters: ReportFilters): Promise<string> {
    const data = await this.generateReport(type, filters)
    
    if (data.length === 0) {
      return 'No data available for the selected filters\n'
    }

    // Get headers from first row
    const headers = Object.keys(data[0])
    const csvHeaders = headers.join(',')
    
    // Convert rows to CSV format
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header]
        if (value === null || value === undefined) return ''
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"` // Escape quotes and wrap in quotes
        }
        if (typeof value === 'bigint') return value.toString()
        return value
      }).join(',')
    })
    
    return [csvHeaders, ...csvRows].join('\n')
  }
}

// Singleton instance
export const reportGeneratorV2DB = new ReportGeneratorV2DB()