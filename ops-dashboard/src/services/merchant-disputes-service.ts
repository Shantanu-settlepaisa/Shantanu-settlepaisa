// UC-DISPUTES-0001: Merchant Disputes Service
import type {
  MerchantDispute,
  DisputeStatus,
  DisputeEvidence,
  DisputeSettlementImpact,
  DisputeActivity,
  DisputeListFilters,
  DisputeListResponse,
  DisputeDetailResponse,
  EvidenceType
} from '@/types/merchant-disputes'

class MerchantDisputesService {
  private disputes: Map<string, MerchantDispute> = new Map()
  private evidence: Map<string, DisputeEvidence[]> = new Map()
  private activities: Map<string, DisputeActivity[]> = new Map()
  private settlementImpacts: Map<string, DisputeSettlementImpact> = new Map()

  constructor() {
    this.initializeDemoData()
  }

  private initializeDemoData() {
    const now = new Date()
    const merchantId = 'merchant-1'
    
    // Demo disputes with varied statuses
    const demoDisputes: MerchantDispute[] = [
      {
        id: 'disp-1',
        caseRef: 'HDFC-CB-2025-101',
        merchantId,
        merchantName: 'Demo Merchant Pvt Ltd',
        txnId: 'TXN2025010101',
        rrn: 'RRN2025010101',
        reasonCode: '10.4',
        reasonDesc: 'Fraudulent Transaction - Card Not Present',
        disputedAmountPaise: 500000n, // ₹5,000
        currency: 'INR',
        status: 'EVIDENCE_REQUIRED',
        openedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        evidenceDueAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Due in 2 days
        lastUpdateAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        canUploadEvidence: true
      },
      {
        id: 'disp-2',
        caseRef: 'ICICI-CB-2025-102',
        merchantId,
        merchantName: 'Demo Merchant Pvt Ltd',
        txnId: 'TXN2025010102',
        utr: 'UTR2025010102',
        reasonCode: '13.1',
        reasonDesc: 'Goods/Services Not Received',
        disputedAmountPaise: 750000n, // ₹7,500
        currency: 'INR',
        status: 'OPEN',
        openedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        lastUpdateAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        canUploadEvidence: true
      },
      {
        id: 'disp-3',
        caseRef: 'AXIS-CB-2025-103',
        merchantId,
        merchantName: 'Demo Merchant Pvt Ltd',
        txnId: 'TXN2025010103',
        rrn: 'RRN2025010103',
        reasonCode: '12.1',
        reasonDesc: 'Processing Error - Duplicate Processing',
        disputedAmountPaise: 1200000n, // ₹12,000
        currency: 'INR',
        status: 'SUBMITTED',
        openedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        evidenceDueAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        evidenceSubmittedAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        lastUpdateAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        canUploadEvidence: false
      },
      {
        id: 'disp-4',
        caseRef: 'HDFC-CB-2025-104',
        merchantId,
        merchantName: 'Demo Merchant Pvt Ltd',
        txnId: 'TXN2025010104',
        reasonCode: '10.1',
        reasonDesc: 'Fraudulent Transaction - EMV Liability Shift',
        disputedAmountPaise: 300000n, // ₹3,000
        currency: 'INR',
        status: 'WON',
        openedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        evidenceDueAt: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString(),
        evidenceSubmittedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        decisionAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        outcome: 'WON',
        lastUpdateAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        canUploadEvidence: false
      },
      {
        id: 'disp-5',
        caseRef: 'ICICI-CB-2025-105',
        merchantId,
        merchantName: 'Demo Merchant Pvt Ltd',
        txnId: 'TXN2025010105',
        utr: 'UTR2025010105',
        reasonCode: '13.3',
        reasonDesc: 'Not As Described',
        disputedAmountPaise: 450000n, // ₹4,500
        currency: 'INR',
        status: 'LOST',
        openedAt: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString(),
        evidenceDueAt: new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000).toISOString(),
        evidenceSubmittedAt: new Date(now.getTime() - 19 * 24 * 60 * 60 * 1000).toISOString(),
        decisionAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        outcome: 'LOST',
        lastUpdateAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        canUploadEvidence: false
      },
      {
        id: 'disp-6',
        caseRef: 'AXIS-CB-2025-106',
        merchantId,
        merchantName: 'Demo Merchant Pvt Ltd',
        txnId: 'TXN2025010106',
        reasonCode: '11.1',
        reasonDesc: 'Authorization - Card Recovery',
        disputedAmountPaise: 850000n, // ₹8,500
        currency: 'INR',
        status: 'PENDING_BANK',
        openedAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        evidenceDueAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        evidenceSubmittedAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString(),
        lastUpdateAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString(),
        canUploadEvidence: false
      }
    ]

    // Store disputes
    demoDisputes.forEach(dispute => {
      this.disputes.set(dispute.id, dispute)
      
      // Create activities
      const activities: DisputeActivity[] = [
        {
          id: `act-${dispute.id}-1`,
          disputeId: dispute.id,
          timestamp: dispute.openedAt,
          action: 'DISPUTE_RAISED',
          description: `Dispute raised by ${dispute.reasonCode === '10.4' ? 'HDFC Bank' : dispute.reasonCode.startsWith('13') ? 'ICICI Bank' : 'AXIS Bank'}`,
          actor: 'System'
        }
      ]

      if (dispute.status !== 'OPEN') {
        activities.push({
          id: `act-${dispute.id}-2`,
          disputeId: dispute.id,
          timestamp: new Date(new Date(dispute.openedAt).getTime() + 60 * 60 * 1000).toISOString(),
          action: 'EVIDENCE_REQUESTED',
          description: 'Evidence requested from merchant',
          actor: 'Ops Team'
        })
      }

      if (dispute.evidenceSubmittedAt) {
        activities.push({
          id: `act-${dispute.id}-3`,
          disputeId: dispute.id,
          timestamp: dispute.evidenceSubmittedAt,
          action: 'EVIDENCE_SUBMITTED',
          description: 'Evidence submitted to bank',
          actor: 'Merchant'
        })
      }

      if (dispute.decisionAt) {
        activities.push({
          id: `act-${dispute.id}-4`,
          disputeId: dispute.id,
          timestamp: dispute.decisionAt,
          action: 'DECISION_RECEIVED',
          description: `Dispute ${dispute.outcome === 'WON' ? 'won' : 'lost'}`,
          actor: 'Bank',
          metadata: { outcome: dispute.outcome }
        })
      }

      this.activities.set(dispute.id, activities)

      // Create settlement impact
      const impact: DisputeSettlementImpact = {
        disputeId: dispute.id
      }

      if (dispute.status !== 'OPEN') {
        // All non-open disputes have a hold
        impact.holdAmountPaise = dispute.disputedAmountPaise
        impact.holdDate = new Date(new Date(dispute.openedAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
        impact.holdBatchRef = `SETTLE-${new Date(impact.holdDate).toISOString().split('T')[0]}`
      }

      if (dispute.outcome === 'WON') {
        impact.releasedAmountPaise = dispute.disputedAmountPaise
        impact.releaseDate = dispute.decisionAt
        impact.releaseBatchRef = `SETTLE-${new Date(dispute.decisionAt!).toISOString().split('T')[0]}`
      }

      if (dispute.outcome === 'LOST') {
        impact.debitAmountPaise = dispute.disputedAmountPaise
        impact.feeAmountPaise = 50000n // ₹500 fee
        impact.gstAmountPaise = 9000n // 18% GST on fee
        impact.debitDate = dispute.decisionAt
        impact.debitBatchRef = `SETTLE-${new Date(dispute.decisionAt!).toISOString().split('T')[0]}`
      }

      this.settlementImpacts.set(dispute.id, impact)

      // Create some demo evidence for submitted disputes
      if (dispute.evidenceSubmittedAt) {
        const evidenceList: DisputeEvidence[] = [
          {
            id: `ev-${dispute.id}-1`,
            disputeId: dispute.id,
            fileName: 'invoice_2025010101.pdf',
            fileSize: 245678,
            mimeType: 'application/pdf',
            evidenceType: 'INVOICE',
            uploadedAt: new Date(new Date(dispute.evidenceSubmittedAt).getTime() - 60 * 60 * 1000).toISOString(),
            uploadedBy: 'merchant@demo.com',
            status: 'submitted'
          },
          {
            id: `ev-${dispute.id}-2`,
            disputeId: dispute.id,
            fileName: 'delivery_proof.jpg',
            fileSize: 1567890,
            mimeType: 'image/jpeg',
            evidenceType: 'PROOF_OF_DELIVERY',
            uploadedAt: new Date(new Date(dispute.evidenceSubmittedAt).getTime() - 30 * 60 * 1000).toISOString(),
            uploadedBy: 'merchant@demo.com',
            status: 'submitted'
          }
        ]
        this.evidence.set(dispute.id, evidenceList)
      }
    })
  }

  // Get disputes list
  async getDisputes(filters: DisputeListFilters): Promise<DisputeListResponse> {
    let disputes = Array.from(this.disputes.values())

    // Apply filters
    if (filters.status && filters.status.length > 0) {
      disputes = disputes.filter(d => filters.status!.includes(d.status))
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom)
      disputes = disputes.filter(d => new Date(d.openedAt) >= fromDate)
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo)
      disputes = disputes.filter(d => new Date(d.openedAt) <= toDate)
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      disputes = disputes.filter(d => 
        d.caseRef.toLowerCase().includes(query) ||
        d.txnId.toLowerCase().includes(query) ||
        (d.rrn && d.rrn.toLowerCase().includes(query)) ||
        (d.utr && d.utr.toLowerCase().includes(query))
      )
    }

    // Sort by openedAt desc
    disputes.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())

    // Pagination
    const limit = filters.limit || 10
    const startIndex = filters.cursor ? parseInt(filters.cursor) : 0
    const paginatedDisputes = disputes.slice(startIndex, startIndex + limit)
    const hasMore = startIndex + limit < disputes.length

    return {
      disputes: paginatedDisputes,
      total: disputes.length,
      cursor: hasMore ? String(startIndex + limit) : undefined,
      hasMore
    }
  }

  // Get dispute detail
  async getDisputeDetail(disputeId: string): Promise<DisputeDetailResponse | null> {
    const dispute = this.disputes.get(disputeId)
    if (!dispute) return null

    return {
      dispute,
      evidence: this.evidence.get(disputeId) || [],
      settlementImpact: this.settlementImpacts.get(disputeId) || { disputeId },
      activities: this.activities.get(disputeId) || []
    }
  }

  // Upload evidence (stores locally until submit)
  async uploadEvidence(
    disputeId: string,
    files: File[],
    evidenceTypes: Record<string, EvidenceType>
  ): Promise<DisputeEvidence[]> {
    const dispute = this.disputes.get(disputeId)
    if (!dispute || !dispute.canUploadEvidence) {
      throw new Error('Cannot upload evidence for this dispute')
    }

    const existingEvidence = this.evidence.get(disputeId) || []
    const newEvidence: DisputeEvidence[] = []

    for (const file of files) {
      const id = `ev-${disputeId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const evidence: DisputeEvidence = {
        id,
        disputeId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        evidenceType: evidenceTypes[file.name] || 'OTHERS',
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'merchant@demo.com',
        status: 'pending',
        localFile: file
      }
      newEvidence.push(evidence)
    }

    this.evidence.set(disputeId, [...existingEvidence, ...newEvidence])
    return newEvidence
  }

  // Submit evidence
  async submitEvidence(disputeId: string, evidenceIds: string[]): Promise<void> {
    const dispute = this.disputes.get(disputeId)
    if (!dispute || !dispute.canUploadEvidence) {
      throw new Error('Cannot submit evidence for this dispute')
    }

    const evidenceList = this.evidence.get(disputeId) || []
    
    // Mark selected evidence as submitted
    evidenceList.forEach(ev => {
      if (evidenceIds.includes(ev.id)) {
        ev.status = 'submitted'
      }
    })

    // Update dispute status
    dispute.status = 'SUBMITTED'
    dispute.evidenceSubmittedAt = new Date().toISOString()
    dispute.lastUpdateAt = new Date().toISOString()
    dispute.canUploadEvidence = false

    // Add activity
    const activities = this.activities.get(disputeId) || []
    activities.push({
      id: `act-${disputeId}-submit-${Date.now()}`,
      disputeId,
      timestamp: new Date().toISOString(),
      action: 'EVIDENCE_SUBMITTED',
      description: `${evidenceIds.length} evidence files submitted`,
      actor: 'merchant@demo.com'
    })
    this.activities.set(disputeId, activities)
  }

  // Remove evidence (only if not submitted)
  async removeEvidence(disputeId: string, evidenceId: string): Promise<void> {
    const evidenceList = this.evidence.get(disputeId) || []
    const evidence = evidenceList.find(e => e.id === evidenceId)
    
    if (evidence && evidence.status === 'pending') {
      this.evidence.set(
        disputeId,
        evidenceList.filter(e => e.id !== evidenceId)
      )
    }
  }

  // Export disputes to CSV
  async exportDisputes(filters: DisputeListFilters): Promise<string> {
    const response = await this.getDisputes({ ...filters, limit: 10000 })
    
    const headers = ['Case Ref', 'Transaction ID', 'Reason', 'Amount (₹)', 'Status', 'Opened Date', 'Evidence Due', 'Last Update']
    const rows = response.disputes.map(d => [
      d.caseRef,
      d.txnId,
      d.reasonDesc,
      (Number(d.disputedAmountPaise) / 100).toFixed(2),
      d.status,
      new Date(d.openedAt).toLocaleDateString('en-IN'),
      d.evidenceDueAt ? new Date(d.evidenceDueAt).toLocaleDateString('en-IN') : '',
      new Date(d.lastUpdateAt).toLocaleDateString('en-IN')
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    return csv
  }
}

// Create singleton instance
export const merchantDisputesService = new MerchantDisputesService()