import { v4 as uuidv4 } from 'uuid'
import seedrandom from 'seedrandom'
import type {
  Chargeback,
  ChargebackStatus,
  ChargebackCategory,
  ChargebackEvent,
  ChargebackEvidenceFile,
  ChargebackAllocation,
  ChargebackTransaction,
  ChargebackDetailResponse,
  ChargebackKPIResponse,
  ChargebackDashboardStats,
  ChargebackSummary,
  NetworkType,
  AllocationType,
  VALID_STATUS_TRANSITIONS,
  REASON_CODE_CATEGORIES
} from '@/types/chargebacks'

export class ChargebackService {
  private rng: seedrandom.PRNG
  private chargebacks: Map<string, Chargeback> = new Map()
  private events: Map<string, ChargebackEvent[]> = new Map()
  private evidence: Map<string, ChargebackEvidenceFile[]> = new Map()
  private allocations: Map<string, ChargebackAllocation[]> = new Map()
  
  constructor(seed?: string) {
    this.rng = seedrandom(seed || 'chargeback-demo-2025')
    this.generateDemoChargebacks()
  }
  
  // Generate random number between min and max
  private random(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min
  }
  
  // Generate demo chargebacks
  private generateDemoChargebacks(): void {
    const merchants = [
      { id: 'merch_1', name: 'Flipkart' },
      { id: 'merch_2', name: 'Amazon' },
      { id: 'merch_3', name: 'Myntra' }
    ]
    
    const acquirers = ['AXIS', 'BOB', 'HDFC', 'ICICI']
    const networks: NetworkType[] = ['VISA', 'MASTERCARD', 'RUPAY', 'UPI']
    
    const reasonCodes = [
      { code: '10.4', desc: 'Fraudulent Transaction - Card Not Present', category: 'FRAUD' as ChargebackCategory },
      { code: '13.1', desc: 'Merchandise Not Received', category: 'NON_RECEIPT' as ChargebackCategory },
      { code: '13.3', desc: 'Not as Described', category: 'QUALITY' as ChargebackCategory },
      { code: '11.1', desc: 'Card Recovery Bulletin', category: 'AUTHORIZATION' as ChargebackCategory },
      { code: '12.1', desc: 'Late Presentment', category: 'PROCESSING' as ChargebackCategory },
      { code: '4853', desc: 'Cardholder Dispute', category: 'QUALITY' as ChargebackCategory },
      { code: '4855', desc: 'Goods or Services Not Provided', category: 'NON_RECEIPT' as ChargebackCategory },
      { code: 'U002', desc: 'UPI Fraud', category: 'FRAUD' as ChargebackCategory }
    ]
    
    const statuses: Array<{ status: ChargebackStatus, count: number }> = [
      { status: 'OPEN', count: 8 },
      { status: 'EVIDENCE_REQUIRED', count: 12 },
      { status: 'REPRESENTMENT_SUBMITTED', count: 3 },
      { status: 'PENDING_BANK', count: 5 },
      { status: 'WON', count: 15 },
      { status: 'LOST', count: 7 },
      { status: 'CANCELLED', count: 2 }
    ]
    
    let chargebackIndex = 1
    
    for (const statusConfig of statuses) {
      for (let i = 0; i < statusConfig.count; i++) {
        const merchant = merchants[this.random(0, merchants.length - 1)]
        const acquirer = acquirers[this.random(0, acquirers.length - 1)]
        const network = networks[this.random(0, networks.length - 1)]
        const reasonCode = reasonCodes[this.random(0, reasonCodes.length - 1)]
        
        const daysAgo = this.random(0, 45)
        const openedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
        
        // Calculate evidence due date (typically 7-10 days from opening)
        const evidenceDueDays = this.random(7, 10)
        const evidenceDueAt = new Date(openedAt.getTime() + evidenceDueDays * 24 * 60 * 60 * 1000)
        
        // Decision date for resolved cases
        let decisionAt: Date | undefined
        if (['WON', 'LOST', 'CANCELLED'].includes(statusConfig.status)) {
          const resolutionDays = this.random(evidenceDueDays + 1, evidenceDueDays + 10)
          decisionAt = new Date(openedAt.getTime() + resolutionDays * 24 * 60 * 60 * 1000)
        }
        
        const chargebackId = `cb_${chargebackIndex.toString().padStart(6, '0')}`
        const caseRef = `${acquirer}_CB_2025_${chargebackIndex.toString().padStart(6, '0')}`
        const txnId = `TXN${Date.now()}${chargebackIndex.toString().padStart(4, '0')}`
        
        const chargeback: Chargeback = {
          id: chargebackId,
          merchantId: merchant.id,
          merchantName: merchant.name,
          acquirer,
          network,
          caseRef,
          txnId,
          rrn: this.rng() > 0.3 ? `RRN${this.random(100000000, 999999999)}` : undefined,
          utr: network === 'UPI' ? `UTR${this.random(100000000, 999999999)}` : undefined,
          reasonCode: reasonCode.code,
          reasonDesc: reasonCode.desc,
          category: reasonCode.category,
          disputedAmountPaise: BigInt(this.random(10000, 5000000)), // ₹100 to ₹50,000
          currency: 'INR',
          status: statusConfig.status,
          openedAt: openedAt.toISOString(),
          evidenceDueAt: evidenceDueAt.toISOString(),
          decisionAt: decisionAt?.toISOString(),
          ownerUserId: this.rng() > 0.5 ? `user_${this.random(1, 5)}` : undefined,
          ownerEmail: this.rng() > 0.5 ? `ops${this.random(1, 5)}@settlepaisa.com` : undefined,
          createdAt: openedAt.toISOString(),
          updatedAt: new Date().toISOString()
        }
        
        this.chargebacks.set(chargebackId, chargeback)
        
        // Generate timeline events
        const events: ChargebackEvent[] = []
        
        // Intake event
        events.push({
          id: uuidv4(),
          chargebackId,
          ts: openedAt.toISOString(),
          actorEmail: 'system@settlepaisa.com',
          action: 'INTAKE',
          payload: {
            source: this.rng() > 0.5 ? 'SFTP' : 'API',
            acquirer,
            caseRef
          }
        })
        
        // Status transition events
        if (statusConfig.status !== 'OPEN') {
          // Evidence required
          const evidenceReqDate = new Date(openedAt.getTime() + 1 * 24 * 60 * 60 * 1000)
          events.push({
            id: uuidv4(),
            chargebackId,
            ts: evidenceReqDate.toISOString(),
            actorEmail: chargeback.ownerEmail || 'ops@settlepaisa.com',
            action: 'STATUS_CHANGE',
            payload: {
              from: 'OPEN',
              to: 'EVIDENCE_REQUIRED',
              reason: 'Evidence needed for representment'
            }
          })
        }
        
        if (['REPRESENTMENT_SUBMITTED', 'PENDING_BANK', 'WON', 'LOST'].includes(statusConfig.status)) {
          // Representment submitted
          const repDate = new Date(openedAt.getTime() + 5 * 24 * 60 * 60 * 1000)
          events.push({
            id: uuidv4(),
            chargebackId,
            ts: repDate.toISOString(),
            actorEmail: chargeback.ownerEmail || 'ops@settlepaisa.com',
            action: 'REPRESENTMENT_SUBMITTED',
            payload: {
              evidenceCount: 3,
              notes: 'Strong evidence provided'
            }
          })
        }
        
        if (['WON', 'LOST'].includes(statusConfig.status)) {
          // Decision event
          events.push({
            id: uuidv4(),
            chargebackId,
            ts: decisionAt!.toISOString(),
            actorEmail: 'system@settlepaisa.com',
            action: 'DECISION_RECEIVED',
            payload: {
              outcome: statusConfig.status,
              reason: statusConfig.status === 'WON' 
                ? 'Compelling evidence accepted' 
                : 'Evidence insufficient'
            }
          })
        }
        
        this.events.set(chargebackId, events)
        
        // Generate evidence files for some cases
        if (['EVIDENCE_REQUIRED', 'REPRESENTMENT_SUBMITTED', 'PENDING_BANK', 'WON'].includes(statusConfig.status)) {
          const evidenceFiles: ChargebackEvidenceFile[] = []
          const evidenceCount = this.random(1, 4)
          
          for (let e = 0; e < evidenceCount; e++) {
            evidenceFiles.push({
              id: uuidv4(),
              chargebackId,
              fileName: `evidence_${e + 1}.pdf`,
              mimeType: 'application/pdf',
              sizeBytes: this.random(100000, 5000000), // 100KB to 5MB
              storageUrl: `s3://chargebacks/${chargebackId}/evidence_${e + 1}.pdf`,
              uploadedBy: chargeback.ownerEmail || 'ops@settlepaisa.com',
              uploadedAt: new Date(openedAt.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
            })
          }
          
          this.evidence.set(chargebackId, evidenceFiles)
        }
        
        // Generate allocations (ledger entries)
        const allocations: ChargebackAllocation[] = []
        
        // Reserve hold on intake
        allocations.push({
          id: uuidv4(),
          chargebackId,
          journalEntryId: `je_${uuidv4()}`,
          type: 'RESERVE_HOLD',
          amountPaise: chargeback.disputedAmountPaise,
          createdAt: openedAt.toISOString()
        })
        
        // Release or adjustment based on outcome
        if (statusConfig.status === 'WON') {
          allocations.push({
            id: uuidv4(),
            chargebackId,
            journalEntryId: `je_${uuidv4()}`,
            type: 'RESERVE_RELEASE',
            amountPaise: chargeback.disputedAmountPaise,
            createdAt: decisionAt!.toISOString()
          })
        } else if (statusConfig.status === 'LOST') {
          allocations.push({
            id: uuidv4(),
            chargebackId,
            journalEntryId: `je_${uuidv4()}`,
            type: 'LOSS_ADJUSTMENT',
            amountPaise: chargeback.disputedAmountPaise,
            createdAt: decisionAt!.toISOString()
          })
        }
        
        this.allocations.set(chargebackId, allocations)
        
        chargebackIndex++
      }
    }
  }
  
  // Get all chargebacks
  async getChargebacks(filters?: {
    status?: ChargebackStatus[]
    merchantId?: string
    acquirer?: string
  }): Promise<Chargeback[]> {
    let chargebacks = Array.from(this.chargebacks.values())
    
    if (filters?.status) {
      chargebacks = chargebacks.filter(cb => filters.status!.includes(cb.status))
    }
    
    if (filters?.merchantId) {
      chargebacks = chargebacks.filter(cb => cb.merchantId === filters.merchantId)
    }
    
    if (filters?.acquirer) {
      chargebacks = chargebacks.filter(cb => cb.acquirer === filters.acquirer)
    }
    
    return chargebacks.sort((a, b) => 
      new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
    )
  }
  
  // Get chargeback by ID
  async getChargebackById(id: string): Promise<ChargebackDetailResponse | null> {
    const chargeback = this.chargebacks.get(id)
    if (!chargeback) return null
    
    // Generate mock transaction details
    const transaction: ChargebackTransaction = {
      txnId: chargeback.txnId,
      originalAmountPaise: chargeback.disputedAmountPaise + BigInt(this.random(1000, 10000)),
      feePaise: BigInt(Math.floor(Number(chargeback.disputedAmountPaise) * 0.025)),
      taxPaise: BigInt(Math.floor(Number(chargeback.disputedAmountPaise) * 0.025 * 0.18)),
      netAmountPaise: chargeback.disputedAmountPaise,
      paymentMethod: chargeback.network === 'UPI' ? 'UPI' : 'CARD',
      paymentDate: new Date(new Date(chargeback.openedAt).getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      settlementDate: new Date(new Date(chargeback.openedAt).getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      customerEmail: `customer${this.random(1, 1000)}@example.com`,
      orderId: `ORD${this.random(100000, 999999)}`
    }
    
    // Calculate settlement impact
    const chargebackAllocations = this.allocations.get(id) || []
    const reserveHold = chargebackAllocations.find(a => a.type === 'RESERVE_HOLD')
    const adjustment = chargebackAllocations.find(a => a.type === 'LOSS_ADJUSTMENT')
    
    return {
      chargeback,
      transaction,
      timeline: this.events.get(id) || [],
      evidence: this.evidence.get(id) || [],
      allocations: chargebackAllocations,
      settlementImpact: {
        reserveHoldPaise: reserveHold?.amountPaise,
        adjustmentPaise: adjustment?.amountPaise,
        settlementBatchId: adjustment ? `batch_${this.random(1000, 9999)}` : undefined,
        impactDate: adjustment?.createdAt
      }
    }
  }
  
  // Get KPIs
  async getKPIs(): Promise<ChargebackKPIResponse> {
    const allChargebacks = Array.from(this.chargebacks.values())
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    
    const openCount = allChargebacks.filter(cb => cb.status === 'OPEN').length
    const evidenceRequiredCount = allChargebacks.filter(cb => cb.status === 'EVIDENCE_REQUIRED').length
    
    // Due today and overdue
    const dueTodayCount = allChargebacks.filter(cb => {
      if (!cb.evidenceDueAt || ['WON', 'LOST', 'CANCELLED'].includes(cb.status)) return false
      const dueDate = new Date(cb.evidenceDueAt)
      return dueDate.toDateString() === now.toDateString()
    }).length
    
    const overdueCount = allChargebacks.filter(cb => {
      if (!cb.evidenceDueAt || ['WON', 'LOST', 'CANCELLED'].includes(cb.status)) return false
      return new Date(cb.evidenceDueAt) < now
    }).length
    
    // Win/Loss stats
    const wonLast7Days = allChargebacks.filter(cb => 
      cb.status === 'WON' && cb.decisionAt && new Date(cb.decisionAt) >= sevenDaysAgo
    ).length
    
    const lostLast7Days = allChargebacks.filter(cb => 
      cb.status === 'LOST' && cb.decisionAt && new Date(cb.decisionAt) >= sevenDaysAgo
    ).length
    
    const wonLast30Days = allChargebacks.filter(cb => 
      cb.status === 'WON' && cb.decisionAt && new Date(cb.decisionAt) >= thirtyDaysAgo
    ).length
    
    const lostLast30Days = allChargebacks.filter(cb => 
      cb.status === 'LOST' && cb.decisionAt && new Date(cb.decisionAt) >= thirtyDaysAgo
    ).length
    
    // Total disputed amount
    const totalDisputedPaise = allChargebacks
      .filter(cb => !['WON', 'CANCELLED'].includes(cb.status))
      .reduce((sum, cb) => sum + cb.disputedAmountPaise, BigInt(0))
    
    // Win rates
    const winRate7Days = wonLast7Days + lostLast7Days > 0 
      ? (wonLast7Days / (wonLast7Days + lostLast7Days)) * 100 
      : 0
    
    const winRate30Days = wonLast30Days + lostLast30Days > 0 
      ? (wonLast30Days / (wonLast30Days + lostLast30Days)) * 100 
      : 0
    
    // Average resolution time
    const resolvedCases = allChargebacks.filter(cb => 
      ['WON', 'LOST'].includes(cb.status) && cb.decisionAt
    )
    
    const avgResolutionTimeDays = resolvedCases.length > 0
      ? resolvedCases.reduce((sum, cb) => {
          const openDate = new Date(cb.openedAt)
          const decisionDate = new Date(cb.decisionAt!)
          const days = Math.floor((decisionDate.getTime() - openDate.getTime()) / (24 * 60 * 60 * 1000))
          return sum + days
        }, 0) / resolvedCases.length
      : 0
    
    return {
      openCount,
      evidenceRequiredCount,
      dueTodayCount,
      overdueCount,
      wonLast7Days,
      lostLast7Days,
      wonLast30Days,
      lostLast30Days,
      totalDisputedPaise,
      winRate7Days: Math.round(winRate7Days * 100) / 100,
      winRate30Days: Math.round(winRate30Days * 100) / 100,
      avgResolutionTimeDays: Math.round(avgResolutionTimeDays * 10) / 10
    }
  }
  
  // Get dashboard stats
  async getDashboardStats(): Promise<ChargebackDashboardStats> {
    const kpis = await this.getKPIs()
    const allChargebacks = Array.from(this.chargebacks.values())
    const now = new Date()
    
    // Status distribution
    const statusDistribution = Object.values(['OPEN', 'EVIDENCE_REQUIRED', 'REPRESENTMENT_SUBMITTED', 'PENDING_BANK', 'WON', 'LOST', 'CANCELLED'] as ChargebackStatus[])
      .map(status => {
        const chargebacks = allChargebacks.filter(cb => cb.status === status)
        return {
          status,
          count: chargebacks.length,
          amountPaise: chargebacks.reduce((sum, cb) => sum + cb.disputedAmountPaise, BigInt(0))
        }
      })
      .filter(item => item.count > 0)
    
    // Category distribution
    const categoryGroups = allChargebacks.reduce((acc, cb) => {
      if (!acc[cb.category]) {
        acc[cb.category] = 0
      }
      acc[cb.category]++
      return acc
    }, {} as Record<ChargebackCategory, number>)
    
    const total = allChargebacks.length
    const categoryDistribution = Object.entries(categoryGroups).map(([category, count]) => ({
      category: category as ChargebackCategory,
      count,
      percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0
    }))
    
    // Acquirer distribution
    const acquirerGroups = allChargebacks.reduce((acc, cb) => {
      if (!acc[cb.acquirer]) {
        acc[cb.acquirer] = { total: 0, won: 0 }
      }
      acc[cb.acquirer].total++
      if (cb.status === 'WON') {
        acc[cb.acquirer].won++
      }
      return acc
    }, {} as Record<string, { total: number, won: number }>)
    
    const acquirerDistribution = Object.entries(acquirerGroups).map(([acquirer, stats]) => ({
      acquirer,
      count: stats.total,
      winRate: stats.total > 0 ? Math.round((stats.won / stats.total) * 10000) / 100 : 0
    }))
    
    // Aging buckets
    const openCases = allChargebacks.filter(cb => 
      !['WON', 'LOST', 'CANCELLED'].includes(cb.status) && cb.evidenceDueAt
    )
    
    const agingBuckets = {
      due0to3Days: 0,
      due4to7Days: 0,
      due8to14Days: 0,
      overdue: 0
    }
    
    openCases.forEach(cb => {
      const dueDate = new Date(cb.evidenceDueAt!)
      const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      
      if (daysUntilDue < 0) {
        agingBuckets.overdue++
      } else if (daysUntilDue <= 3) {
        agingBuckets.due0to3Days++
      } else if (daysUntilDue <= 7) {
        agingBuckets.due4to7Days++
      } else if (daysUntilDue <= 14) {
        agingBuckets.due8to14Days++
      }
    })
    
    return {
      kpis,
      statusDistribution,
      categoryDistribution,
      acquirerDistribution,
      agingBuckets
    }
  }
  
  // Update chargeback status
  async updateStatus(
    id: string, 
    newStatus: ChargebackStatus, 
    actorEmail: string,
    reason?: string
  ): Promise<boolean> {
    const chargeback = this.chargebacks.get(id)
    if (!chargeback) return false
    
    // Validate status transition
    const validTransitions = {
      'OPEN': ['EVIDENCE_REQUIRED', 'CANCELLED', 'WON', 'LOST'],
      'EVIDENCE_REQUIRED': ['REPRESENTMENT_SUBMITTED', 'CANCELLED', 'LOST'],
      'REPRESENTMENT_SUBMITTED': ['PENDING_BANK', 'WON', 'LOST'],
      'PENDING_BANK': ['WON', 'LOST'],
      'WON': [],
      'LOST': [],
      'CANCELLED': []
    }
    
    if (!validTransitions[chargeback.status].includes(newStatus)) {
      return false
    }
    
    // Update status
    const oldStatus = chargeback.status
    chargeback.status = newStatus
    chargeback.updatedAt = new Date().toISOString()
    
    if (['WON', 'LOST', 'CANCELLED'].includes(newStatus)) {
      chargeback.decisionAt = new Date().toISOString()
    }
    
    // Add event
    const events = this.events.get(id) || []
    events.push({
      id: uuidv4(),
      chargebackId: id,
      ts: new Date().toISOString(),
      actorEmail,
      action: 'STATUS_CHANGE',
      payload: {
        from: oldStatus,
        to: newStatus,
        reason
      }
    })
    this.events.set(id, events)
    
    // Handle ledger allocations
    const allocations = this.allocations.get(id) || []
    
    if (newStatus === 'WON') {
      // Release reserve
      allocations.push({
        id: uuidv4(),
        chargebackId: id,
        journalEntryId: `je_${uuidv4()}`,
        type: 'RESERVE_RELEASE',
        amountPaise: chargeback.disputedAmountPaise,
        createdAt: new Date().toISOString()
      })
    } else if (newStatus === 'LOST') {
      // Create loss adjustment
      allocations.push({
        id: uuidv4(),
        chargebackId: id,
        journalEntryId: `je_${uuidv4()}`,
        type: 'LOSS_ADJUSTMENT',
        amountPaise: chargeback.disputedAmountPaise,
        createdAt: new Date().toISOString()
      })
    }
    
    this.allocations.set(id, allocations)
    
    return true
  }
  
  // Assign owner
  async assignOwner(
    id: string,
    ownerUserId: string,
    ownerEmail: string,
    actorEmail: string
  ): Promise<boolean> {
    const chargeback = this.chargebacks.get(id)
    if (!chargeback) return false
    
    const oldOwner = chargeback.ownerEmail
    chargeback.ownerUserId = ownerUserId
    chargeback.ownerEmail = ownerEmail
    chargeback.updatedAt = new Date().toISOString()
    
    // Add event
    const events = this.events.get(id) || []
    events.push({
      id: uuidv4(),
      chargebackId: id,
      ts: new Date().toISOString(),
      actorEmail,
      action: 'OWNER_ASSIGNED',
      payload: {
        oldOwner,
        newOwner: ownerEmail,
        ownerUserId
      }
    })
    this.events.set(id, events)
    
    return true
  }
  
  // Add evidence
  async addEvidence(
    id: string,
    files: Array<{ fileName: string; mimeType: string; sizeBytes: number }>,
    uploadedBy: string
  ): Promise<boolean> {
    const chargeback = this.chargebacks.get(id)
    if (!chargeback) return false
    
    const evidenceFiles = this.evidence.get(id) || []
    
    for (const file of files) {
      evidenceFiles.push({
        id: uuidv4(),
        chargebackId: id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storageUrl: `s3://chargebacks/${id}/${file.fileName}`,
        uploadedBy,
        uploadedAt: new Date().toISOString()
      })
    }
    
    this.evidence.set(id, evidenceFiles)
    
    // Add event
    const events = this.events.get(id) || []
    events.push({
      id: uuidv4(),
      chargebackId: id,
      ts: new Date().toISOString(),
      actorEmail: uploadedBy,
      action: 'EVIDENCE_UPLOADED',
      payload: {
        fileCount: files.length,
        fileNames: files.map(f => f.fileName)
      }
    })
    this.events.set(id, events)
    
    return true
  }
  
  // Submit representment
  async submitRepresentment(
    id: string,
    submittedBy: string,
    notes?: string
  ): Promise<boolean> {
    const chargeback = this.chargebacks.get(id)
    if (!chargeback) return false
    
    if (chargeback.status !== 'EVIDENCE_REQUIRED') {
      return false
    }
    
    // Update status
    return this.updateStatus(id, 'REPRESENTMENT_SUBMITTED', submittedBy, notes)
  }
  
  // Get chargeback summaries
  async getChargebackSummaries(filters?: {
    status?: ChargebackStatus[]
    merchantId?: string
  }): Promise<ChargebackSummary[]> {
    const chargebacks = await this.getChargebacks(filters)
    const now = new Date()
    
    return chargebacks.map(cb => {
      let daysUntilDue: number | undefined
      let isOverdue = false
      
      if (cb.evidenceDueAt && !['WON', 'LOST', 'CANCELLED'].includes(cb.status)) {
        const dueDate = new Date(cb.evidenceDueAt)
        daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        isOverdue = daysUntilDue < 0
      }
      
      return {
        id: cb.id,
        caseRef: cb.caseRef,
        merchantName: cb.merchantName,
        txnId: cb.txnId,
        reasonCode: cb.reasonCode,
        disputedAmountPaise: cb.disputedAmountPaise,
        status: cb.status,
        evidenceDueAt: cb.evidenceDueAt,
        daysUntilDue,
        isOverdue,
        ownerEmail: cb.ownerEmail,
        lastUpdateAt: cb.updatedAt
      }
    })
  }
}

// Singleton instance
export const chargebackService = new ChargebackService()