import { demoDataGenerator } from '@/lib/demo-data-generator'
import type {
  AnalyticsKPIs,
  MatchRateDaily,
  SLACycle,
  ExceptionBuckets,
  ThroughputHourly,
  TrendData,
  ReasonCodeData,
  SLAHeatmapData,
  AgingException,
  LateBankFile,
  AlertThreshold,
  AlertEvent
} from '@/types/analytics'
import seedrandom from 'seedrandom'

export class AnalyticsService {
  private rng: seedrandom.PRNG
  
  constructor(seed?: string) {
    this.rng = seedrandom(seed || 'settlepaisa-analytics-2025')
  }
  
  // Generate random number between min and max
  private random(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min
  }
  
  // Convert paise to rupees
  private paiseToRupees(paise: bigint): number {
    return Number(paise) / 100
  }
  
  // Format hours with 2 decimal places
  private formatHours(hours: number): number {
    return Math.round(hours * 100) / 100
  }
  
  // Generate date range
  private generateDateRange(days: number): string[] {
    const dates: string[] = []
    const today = new Date()
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      dates.push(date.toISOString().split('T')[0])
    }
    
    return dates
  }
  
  // Get current date in IST
  private getCurrentDateIST(): string {
    return new Date().toISOString().split('T')[0]
  }
  
  // Generate match rate daily data
  generateMatchRateDaily(days: number = 30): MatchRateDaily[] {
    const data: MatchRateDaily[] = []
    const dates = this.generateDateRange(days)
    const acquirers = demoDataGenerator.getAcquirers()
    const merchants = demoDataGenerator.getMerchants()
    
    for (const date of dates) {
      for (const acquirer of acquirers) {
        // Generate aggregate for all merchants per acquirer
        let totalMatched = 0
        let totalUnmatched = 0
        let totalExceptions = 0
        let totalAmountPaise = BigInt(0)
        
        for (const merchant of merchants) {
          // Base transaction count with some variance
          const baseCount = this.random(80, 150)
          const varianceFactor = 0.8 + (this.rng() * 0.4) // 0.8 to 1.2 multiplier
          const txnCount = Math.floor(baseCount * varianceFactor)
          
          // Distribution: ~87% matched, ~10% unmatched, ~3% exceptions (with variance)
          const matchRateBase = 0.87 + (this.rng() * 0.1) - 0.05 // 0.82 to 0.92
          const exceptionRate = 0.03 + (this.rng() * 0.04) // 0.03 to 0.07
          const unmatchedRate = 1 - matchRateBase - exceptionRate
          
          const matched = Math.floor(txnCount * matchRateBase)
          const exceptions = Math.floor(txnCount * exceptionRate)
          const unmatched = txnCount - matched - exceptions
          
          totalMatched += matched
          totalUnmatched += unmatched
          totalExceptions += exceptions
          
          // Generate amounts
          for (let i = 0; i < txnCount; i++) {
            totalAmountPaise += BigInt(this.random(10000, 500000)) // ₹100 to ₹5000
          }
        }
        
        const totalTxns = totalMatched + totalUnmatched + totalExceptions
        const matchRate = totalTxns > 0 ? (totalMatched / totalTxns) * 100 : 0
        
        data.push({
          acquirer: acquirer.code,
          cycle_date: date,
          matched: totalMatched,
          unmatched: totalUnmatched,
          exceptions: totalExceptions,
          match_rate_pct: Math.round(matchRate * 100) / 100,
          total_transactions: totalTxns,
          total_amount_paise: totalAmountPaise,
          total_amount_rupees: this.paiseToRupees(totalAmountPaise)
        })
      }
    }
    
    return data
  }
  
  // Generate SLA cycle data
  generateSLACycles(days: number = 30): SLACycle[] {
    const data: SLACycle[] = []
    const dates = this.generateDateRange(days)
    const acquirers = demoDataGenerator.getAcquirers()
    
    for (const date of dates) {
      for (const acquirer of acquirers) {
        // Expected file time: 7 AM IST for most acquirers
        const expectedHour = acquirer.code === 'AXIS' ? 7 : acquirer.code === 'HDFC' ? 8 : 6
        const expectedTime = `${date}T${expectedHour.toString().padStart(2, '0')}:00:00+05:30`
        
        // Simulate late files (10% chance of being late, 2% chance of missing)
        const rand = this.rng()
        let receivedTime: string | undefined
        let hoursLate = 0
        let slaMet = true
        
        if (rand > 0.98) {
          // 2% missing files
          receivedTime = undefined
          hoursLate = 24 // Consider missing as 24h late
          slaMet = false
        } else if (rand > 0.90) {
          // 8% late files
          const delayHours = this.rng() * 6 + 0.5 // 0.5 to 6.5 hours late
          const receivedDate = new Date(expectedTime)
          receivedDate.setHours(receivedDate.getHours() + delayHours)
          receivedTime = receivedDate.toISOString()
          hoursLate = delayHours
          slaMet = delayHours <= 2 // SLA breach if > 2 hours
        } else {
          // 90% on time (with some minor variance)
          const variance = (this.rng() * 0.5) - 0.25 // -15 to +15 minutes
          const receivedDate = new Date(expectedTime)
          receivedDate.setMinutes(receivedDate.getMinutes() + variance * 60)
          receivedTime = receivedDate.toISOString()
          hoursLate = Math.max(0, variance)
          slaMet = true
        }
        
        data.push({
          acquirer: acquirer.code,
          cycle_date: date,
          file_expected_at_ist: expectedTime,
          file_received_at_ist: receivedTime,
          hours_late: this.formatHours(hoursLate),
          sla_met_bool: slaMet,
          impacted_merchants_count: this.random(8, 15),
          status: !receivedTime ? 'MISSING' : hoursLate > 2 ? 'LATE' : 'ON_TIME'
        })
      }
    }
    
    return data
  }
  
  // Generate exception buckets
  generateExceptionBuckets(days: number = 7): ExceptionBuckets[] {
    const data: ExceptionBuckets[] = []
    const dates = this.generateDateRange(days)
    const acquirers = demoDataGenerator.getAcquirers()
    
    const reasonCodes = [
      'BANK_FILE_AWAITED',
      'AMOUNT_MISMATCH', 
      'DATE_MISMATCH',
      'MISSING_IN_BANK',
      'MISSING_IN_PG',
      'DUPLICATE_IN_BANK'
    ]
    
    for (const date of dates) {
      for (const acquirer of acquirers) {
        for (const reasonCode of reasonCodes) {
          // Generate counts for each aging bucket
          const totalCount = this.random(5, 50)
          const aged24h = Math.floor(totalCount * (0.6 + this.rng() * 0.3)) // 60-90%
          const aged48h = Math.floor((totalCount - aged24h) * (0.4 + this.rng() * 0.4)) // 40-80% of remaining
          const aged72h = totalCount - aged24h - aged48h
          
          // Calculate total amount
          const avgAmount = this.random(50000, 300000) // ₹500 to ₹3000
          const totalAmountPaise = BigInt(totalCount * avgAmount)
          
          data.push({
            cycle_date: date,
            acquirer: acquirer.code,
            reason_code: reasonCode,
            count: totalCount,
            aged_24h: aged24h,
            aged_48h: aged48h,
            aged_72h: aged72h,
            total_amount_paise: totalAmountPaise,
            total_amount_rupees: this.paiseToRupees(totalAmountPaise)
          })
        }
      }
    }
    
    return data
  }
  
  // Generate throughput hourly data
  generateThroughputHourly(date?: string): ThroughputHourly[] {
    const data: ThroughputHourly[] = []
    const targetDate = date || this.getCurrentDateIST()
    const acquirers = demoDataGenerator.getAcquirers()
    
    // Generate data for business hours (6 AM to 10 PM IST)
    for (let hour = 6; hour <= 22; hour++) {
      for (const acquirer of acquirers) {
        const hourStr = `${targetDate} ${hour.toString().padStart(2, '0')}:00`
        
        // Peak hours: 9-11 AM, 2-4 PM, 7-9 PM
        const isPeakHour = (hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16) || (hour >= 19 && hour <= 21)
        const baseVolume = isPeakHour ? this.random(200, 400) : this.random(50, 150)
        
        const ingested = baseVolume
        // Processing efficiency: 95-99%
        const normalizedRate = 0.95 + (this.rng() * 0.04)
        const matchedRate = 0.85 + (this.rng() * 0.12) // 85-97% of normalized
        
        const normalized = Math.floor(ingested * normalizedRate)
        const matched = Math.floor(normalized * matchedRate)
        
        data.push({
          acquirer: acquirer.code,
          hour_ist: hourStr,
          ingested,
          normalized,
          matched,
          completion_rate_pct: Math.round((matched / ingested) * 10000) / 100 // 2 decimal places
        })
      }
    }
    
    return data
  }
  
  // Calculate today's KPIs
  calculateKPIs(date?: string): AnalyticsKPIs {
    const targetDate = date || this.getCurrentDateIST()
    
    // Get data for today
    const matchRateData = this.generateMatchRateDaily(1).filter(d => d.cycle_date === targetDate)
    const slaData = this.generateSLACycles(1).filter(d => d.cycle_date === targetDate)
    const exceptionData = this.generateExceptionBuckets(1).filter(d => d.cycle_date === targetDate)
    
    // Calculate match rate
    const totalMatched = matchRateData.reduce((sum, d) => sum + d.matched, 0)
    const totalUnmatched = matchRateData.reduce((sum, d) => sum + d.unmatched, 0)
    const totalExceptions = matchRateData.reduce((sum, d) => sum + d.exceptions, 0)
    const totalTxns = totalMatched + totalUnmatched + totalExceptions
    
    const matchRateToday = totalTxns > 0 ? (totalMatched / totalTxns) * 100 : 0
    
    // Calculate unmatched value (estimate)
    const unmatchedValuePaise = BigInt(totalUnmatched * this.random(100000, 400000))
    
    // Calculate exceptions value
    const exceptionsValuePaise = exceptionData.reduce((sum, d) => sum + d.total_amount_paise, BigInt(0))
    
    // Calculate SLA metrics
    const slaMetCount = slaData.filter(d => d.sla_met_bool).length
    const slaMetPct = slaData.length > 0 ? (slaMetCount / slaData.length) * 100 : 100
    
    const avgDelay = slaData.length > 0 
      ? slaData.reduce((sum, d) => sum + d.hours_late, 0) / slaData.length 
      : 0
    
    return {
      match_rate_today: Math.round(matchRateToday * 100) / 100,
      unmatched_today: totalUnmatched,
      unmatched_value_paise: unmatchedValuePaise,
      unmatched_value_rupees: this.paiseToRupees(unmatchedValuePaise),
      exceptions_open: totalExceptions,
      exceptions_value_paise: exceptionsValuePaise,
      exceptions_value_rupees: this.paiseToRupees(exceptionsValuePaise),
      sla_met_pct_today: Math.round(slaMetPct * 100) / 100,
      avg_bank_file_delay_hours: this.formatHours(avgDelay),
      last_updated: new Date().toISOString()
    }
  }
  
  // Generate trend data for match rates
  generateMatchRateTrends(days: number = 30, acquirer?: string): TrendData {
    const matchRateData = this.generateMatchRateDaily(days)
    const filtered = acquirer 
      ? matchRateData.filter(d => d.acquirer === acquirer)
      : matchRateData
    
    // Group by acquirer
    const grouped = new Map<string, MatchRateDaily[]>()
    for (const item of filtered) {
      if (!grouped.has(item.acquirer)) {
        grouped.set(item.acquirer, [])
      }
      grouped.get(item.acquirer)!.push(item)
    }
    
    const series = Array.from(grouped.entries()).map(([acq, data]) => ({
      name: acq,
      data: data.map(d => ({
        date: d.cycle_date,
        value: d.match_rate_pct
      }))
    }))
    
    const dates = this.generateDateRange(days)
    
    return {
      series,
      categories: dates
    }
  }
  
  // Generate reason code distribution
  generateReasonCodeDistribution(days: number = 7, acquirer?: string): ReasonCodeData[] {
    const exceptionData = this.generateExceptionBuckets(days)
    const filtered = acquirer 
      ? exceptionData.filter(d => d.acquirer === acquirer)
      : exceptionData
    
    // Aggregate by reason code
    const aggregated = new Map<string, { count: number, amount: bigint, acquirer: string }>()
    
    for (const item of filtered) {
      const key = `${item.reason_code}_${item.acquirer}`
      if (!aggregated.has(key)) {
        aggregated.set(key, { count: 0, amount: BigInt(0), acquirer: item.acquirer })
      }
      const current = aggregated.get(key)!
      current.count += item.count
      current.amount += item.total_amount_paise
    }
    
    const totalCount = Array.from(aggregated.values()).reduce((sum, d) => sum + d.count, 0)
    
    return Array.from(aggregated.entries()).map(([key, data]) => {
      const [reasonCode, acq] = key.split('_')
      return {
        reason_code: reasonCode,
        count: data.count,
        percentage: totalCount > 0 ? Math.round((data.count / totalCount) * 10000) / 100 : 0,
        amount_paise: data.amount,
        amount_rupees: this.paiseToRupees(data.amount),
        acquirer: acq
      }
    }).sort((a, b) => b.count - a.count).slice(0, 6) // Top 6 reason codes
  }
  
  // Generate SLA heatmap
  generateSLAHeatmap(days: number = 30): SLAHeatmapData {
    const slaData = this.generateSLACycles(days)
    const acquirers = [...new Set(slaData.map(d => d.acquirer))].sort()
    const dates = this.generateDateRange(days)
    
    return {
      acquirers,
      dates,
      cells: slaData.map(d => ({
        acquirer: d.acquirer,
        date: d.cycle_date,
        hours_late: d.hours_late,
        sla_met: d.sla_met_bool,
        status: d.status,
        impacted_merchants: d.impacted_merchants_count
      }))
    }
  }
}

// Singleton instance
export const analyticsService = new AnalyticsService()