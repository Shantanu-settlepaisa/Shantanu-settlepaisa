// OP-0011: Chargeback Ledger Integration Service
// Handles ledger entries for reserve holds, releases, and adjustments

import type {
  Chargeback,
  ChargebackAllocation,
  AllocationType
} from '@/types/chargebacks'

interface LedgerEntry {
  id: string
  idempotencyKey: string
  type: 'RESERVE_HOLD' | 'RESERVE_RELEASE' | 'LOSS_ADJUSTMENT'
  chargebackId: string
  merchantId: string
  amountPaise: bigint
  currency: string
  debitAccount: string
  creditAccount: string
  description: string
  metadata: Record<string, any>
  createdAt: string
  reversedAt?: string
}

export class ChargebackLedgerService {
  private entries: Map<string, LedgerEntry> = new Map()
  private allocations: Map<string, ChargebackAllocation[]> = new Map()
  private entryId = 1

  constructor() {
    // Initialize with some mock ledger entries
    this.initializeMockEntries()
  }

  private initializeMockEntries() {
    // Create sample ledger entries for existing chargebacks
    const mockChargebacks = [
      { id: 'cb-1', merchantId: 'merchant-1', caseRef: 'HDFC-CB-2025-001', amount: 500000n },
      { id: 'cb-2', merchantId: 'merchant-1', caseRef: 'HDFC-CB-2025-002', amount: 750000n },
      { id: 'cb-3', merchantId: 'merchant-2', caseRef: 'ICICI-CB-2025-003', amount: 1200000n },
      { id: 'cb-won', merchantId: 'merchant-1', caseRef: 'HDFC-CB-2025-WON', amount: 300000n },
      { id: 'cb-lost', merchantId: 'merchant-2', caseRef: 'ICICI-CB-2025-LOST', amount: 450000n }
    ]

    mockChargebacks.forEach(cb => {
      // Create reserve hold entry
      const holdEntry = this.createMockEntry('RESERVE_HOLD', cb)
      this.entries.set(holdEntry.id, holdEntry)
      
      // Create allocation
      const allocation: ChargebackAllocation = {
        id: `alloc-${this.entryId++}`,
        chargebackId: cb.id,
        journalEntryId: holdEntry.id,
        type: 'RESERVE_HOLD',
        amountPaise: cb.amount,
        createdAt: new Date().toISOString()
      }
      
      if (!this.allocations.has(cb.id)) {
        this.allocations.set(cb.id, [])
      }
      this.allocations.get(cb.id)!.push(allocation)

      // Add release for won chargeback
      if (cb.id === 'cb-won') {
        const releaseEntry = this.createMockEntry('RESERVE_RELEASE', cb)
        this.entries.set(releaseEntry.id, releaseEntry)
        
        const releaseAllocation: ChargebackAllocation = {
          id: `alloc-${this.entryId++}`,
          chargebackId: cb.id,
          journalEntryId: releaseEntry.id,
          type: 'RESERVE_RELEASE',
          amountPaise: cb.amount,
          createdAt: new Date().toISOString()
        }
        this.allocations.get(cb.id)!.push(releaseAllocation)
      }

      // Add loss adjustment for lost chargeback
      if (cb.id === 'cb-lost') {
        const lossEntry = this.createMockEntry('LOSS_ADJUSTMENT', cb)
        this.entries.set(lossEntry.id, lossEntry)
        
        const lossAllocation: ChargebackAllocation = {
          id: `alloc-${this.entryId++}`,
          chargebackId: cb.id,
          journalEntryId: lossEntry.id,
          type: 'LOSS_ADJUSTMENT',
          amountPaise: cb.amount,
          createdAt: new Date().toISOString()
        }
        this.allocations.get(cb.id)!.push(lossAllocation)
      }
    })
  }

  private createMockEntry(
    type: LedgerEntry['type'],
    chargeback: { id: string; merchantId: string; caseRef: string; amount: bigint }
  ): LedgerEntry {
    const id = `journal-${this.entryId++}`
    const idempotencyKey = `cb-${chargeback.caseRef}-${type.toLowerCase()}`

    let debitAccount: string
    let creditAccount: string
    let description: string

    switch (type) {
      case 'RESERVE_HOLD':
        debitAccount = `merchant_receivable_${chargeback.merchantId}`
        creditAccount = `merchant_reserve_${chargeback.merchantId}`
        description = `Reserve hold for chargeback ${chargeback.caseRef}`
        break
      
      case 'RESERVE_RELEASE':
        debitAccount = `merchant_reserve_${chargeback.merchantId}`
        creditAccount = `merchant_receivable_${chargeback.merchantId}`
        description = `Reserve release for won chargeback ${chargeback.caseRef}`
        break
      
      case 'LOSS_ADJUSTMENT':
        debitAccount = `merchant_settlement_${chargeback.merchantId}`
        creditAccount = `chargeback_losses`
        description = `Loss adjustment for chargeback ${chargeback.caseRef}`
        break
    }

    return {
      id,
      idempotencyKey,
      type,
      chargebackId: chargeback.id,
      merchantId: chargeback.merchantId,
      amountPaise: chargeback.amount,
      currency: 'INR',
      debitAccount,
      creditAccount,
      description,
      metadata: {
        caseRef: chargeback.caseRef,
        timestamp: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    }
  }

  // Create reserve hold when chargeback is opened
  async createReserveHold(chargeback: Chargeback): Promise<ChargebackAllocation> {
    const idempotencyKey = `cb-${chargeback.caseRef}-reserve-hold`
    
    // Check if entry already exists
    const existingEntry = Array.from(this.entries.values()).find(
      e => e.idempotencyKey === idempotencyKey
    )
    
    if (existingEntry) {
      // Return existing allocation
      const allocations = this.allocations.get(chargeback.id) || []
      return allocations.find(a => a.journalEntryId === existingEntry.id)!
    }

    // Create new ledger entry
    const entry: LedgerEntry = {
      id: `journal-${this.entryId++}`,
      idempotencyKey,
      type: 'RESERVE_HOLD',
      chargebackId: chargeback.id,
      merchantId: chargeback.merchantId,
      amountPaise: chargeback.disputedAmountPaise,
      currency: chargeback.currency,
      debitAccount: `merchant_receivable_${chargeback.merchantId}`,
      creditAccount: `merchant_reserve_${chargeback.merchantId}`,
      description: `Reserve hold for chargeback ${chargeback.caseRef}`,
      metadata: {
        caseRef: chargeback.caseRef,
        reasonCode: chargeback.reasonCode,
        category: chargeback.category,
        openedAt: chargeback.openedAt
      },
      createdAt: new Date().toISOString()
    }

    this.entries.set(entry.id, entry)

    // Create allocation record
    const allocation: ChargebackAllocation = {
      id: `alloc-${this.entryId++}`,
      chargebackId: chargeback.id,
      journalEntryId: entry.id,
      type: 'RESERVE_HOLD',
      amountPaise: chargeback.disputedAmountPaise,
      createdAt: new Date().toISOString()
    }

    if (!this.allocations.has(chargeback.id)) {
      this.allocations.set(chargeback.id, [])
    }
    this.allocations.get(chargeback.id)!.push(allocation)

    return allocation
  }

  // Release reserve when chargeback is won
  async releaseReserve(chargeback: Chargeback): Promise<ChargebackAllocation> {
    const idempotencyKey = `cb-${chargeback.caseRef}-reserve-release`
    
    // Check if entry already exists
    const existingEntry = Array.from(this.entries.values()).find(
      e => e.idempotencyKey === idempotencyKey
    )
    
    if (existingEntry) {
      const allocations = this.allocations.get(chargeback.id) || []
      return allocations.find(a => a.journalEntryId === existingEntry.id)!
    }

    // Create reversal entry
    const entry: LedgerEntry = {
      id: `journal-${this.entryId++}`,
      idempotencyKey,
      type: 'RESERVE_RELEASE',
      chargebackId: chargeback.id,
      merchantId: chargeback.merchantId,
      amountPaise: chargeback.disputedAmountPaise,
      currency: chargeback.currency,
      debitAccount: `merchant_reserve_${chargeback.merchantId}`,
      creditAccount: `merchant_receivable_${chargeback.merchantId}`,
      description: `Reserve release for won chargeback ${chargeback.caseRef}`,
      metadata: {
        caseRef: chargeback.caseRef,
        outcome: 'WON',
        decisionAt: chargeback.decisionAt
      },
      createdAt: new Date().toISOString()
    }

    this.entries.set(entry.id, entry)

    // Create allocation record
    const allocation: ChargebackAllocation = {
      id: `alloc-${this.entryId++}`,
      chargebackId: chargeback.id,
      journalEntryId: entry.id,
      type: 'RESERVE_RELEASE',
      amountPaise: chargeback.disputedAmountPaise,
      createdAt: new Date().toISOString()
    }

    if (!this.allocations.has(chargeback.id)) {
      this.allocations.set(chargeback.id, [])
    }
    this.allocations.get(chargeback.id)!.push(allocation)

    return allocation
  }

  // Post loss adjustment when chargeback is lost
  async postLossAdjustment(chargeback: Chargeback): Promise<ChargebackAllocation> {
    const idempotencyKey = `cb-${chargeback.caseRef}-loss-adjustment`
    
    // Check if entry already exists
    const existingEntry = Array.from(this.entries.values()).find(
      e => e.idempotencyKey === idempotencyKey
    )
    
    if (existingEntry) {
      const allocations = this.allocations.get(chargeback.id) || []
      return allocations.find(a => a.journalEntryId === existingEntry.id)!
    }

    // Create loss adjustment entry
    const entry: LedgerEntry = {
      id: `journal-${this.entryId++}`,
      idempotencyKey,
      type: 'LOSS_ADJUSTMENT',
      chargebackId: chargeback.id,
      merchantId: chargeback.merchantId,
      amountPaise: chargeback.disputedAmountPaise,
      currency: chargeback.currency,
      debitAccount: `merchant_settlement_${chargeback.merchantId}`,
      creditAccount: `chargeback_losses`,
      description: `Loss adjustment for chargeback ${chargeback.caseRef}`,
      metadata: {
        caseRef: chargeback.caseRef,
        outcome: 'LOST',
        decisionAt: chargeback.decisionAt,
        nextSettlementBatch: this.getNextSettlementBatchId()
      },
      createdAt: new Date().toISOString()
    }

    this.entries.set(entry.id, entry)

    // Create allocation record
    const allocation: ChargebackAllocation = {
      id: `alloc-${this.entryId++}`,
      chargebackId: chargeback.id,
      journalEntryId: entry.id,
      type: 'LOSS_ADJUSTMENT',
      amountPaise: chargeback.disputedAmountPaise,
      createdAt: new Date().toISOString()
    }

    if (!this.allocations.has(chargeback.id)) {
      this.allocations.set(chargeback.id, [])
    }
    this.allocations.get(chargeback.id)!.push(allocation)

    return allocation
  }

  // Get allocations for a chargeback
  async getAllocationsByChargeback(chargebackId: string): Promise<ChargebackAllocation[]> {
    return this.allocations.get(chargebackId) || []
  }

  // Get ledger entries for a chargeback
  async getLedgerEntriesByChargeback(chargebackId: string): Promise<LedgerEntry[]> {
    return Array.from(this.entries.values()).filter(
      entry => entry.chargebackId === chargebackId
    )
  }

  // Calculate settlement impact
  async calculateSettlementImpact(chargebackId: string): Promise<{
    reserveHoldPaise: bigint
    reserveReleasePaise: bigint
    lossAdjustmentPaise: bigint
    netImpactPaise: bigint
    settlementBatchId?: string
    impactDate?: string
  }> {
    const allocations = await this.getAllocationsByChargeback(chargebackId)
    
    let reserveHoldPaise = 0n
    let reserveReleasePaise = 0n
    let lossAdjustmentPaise = 0n
    let settlementBatchId: string | undefined
    let impactDate: string | undefined

    for (const allocation of allocations) {
      switch (allocation.type) {
        case 'RESERVE_HOLD':
          reserveHoldPaise += allocation.amountPaise
          break
        case 'RESERVE_RELEASE':
          reserveReleasePaise += allocation.amountPaise
          break
        case 'LOSS_ADJUSTMENT':
          lossAdjustmentPaise += allocation.amountPaise
          const entry = this.entries.get(allocation.journalEntryId)
          if (entry?.metadata?.nextSettlementBatch) {
            settlementBatchId = entry.metadata.nextSettlementBatch
            impactDate = new Date().toISOString()
          }
          break
      }
    }

    const netImpactPaise = reserveHoldPaise - reserveReleasePaise - lossAdjustmentPaise

    return {
      reserveHoldPaise,
      reserveReleasePaise,
      lossAdjustmentPaise,
      netImpactPaise,
      settlementBatchId,
      impactDate
    }
  }

  // Get merchant reserve balance
  async getMerchantReserveBalance(merchantId: string): Promise<bigint> {
    let balance = 0n
    
    for (const entry of this.entries.values()) {
      if (entry.merchantId === merchantId && !entry.reversedAt) {
        if (entry.type === 'RESERVE_HOLD') {
          balance += entry.amountPaise
        } else if (entry.type === 'RESERVE_RELEASE') {
          balance -= entry.amountPaise
        }
      }
    }

    return balance
  }

  // Get chargeback loss statistics
  async getChargebackLossStats(merchantId?: string): Promise<{
    totalLossesPaise: bigint
    totalRecoveredPaise: bigint
    pendingReservePaise: bigint
    lossRate: number
  }> {
    let totalLossesPaise = 0n
    let totalRecoveredPaise = 0n
    let pendingReservePaise = 0n
    let totalDisputedPaise = 0n

    for (const entry of this.entries.values()) {
      if (merchantId && entry.merchantId !== merchantId) continue

      switch (entry.type) {
        case 'LOSS_ADJUSTMENT':
          totalLossesPaise += entry.amountPaise
          totalDisputedPaise += entry.amountPaise
          break
        case 'RESERVE_RELEASE':
          totalRecoveredPaise += entry.amountPaise
          totalDisputedPaise += entry.amountPaise
          break
        case 'RESERVE_HOLD':
          // Check if there's a corresponding release or loss
          const hasResolution = Array.from(this.entries.values()).some(
            e => e.chargebackId === entry.chargebackId && 
                 (e.type === 'RESERVE_RELEASE' || e.type === 'LOSS_ADJUSTMENT')
          )
          if (!hasResolution) {
            pendingReservePaise += entry.amountPaise
          }
          break
      }
    }

    const lossRate = totalDisputedPaise > 0n 
      ? Number(totalLossesPaise * 10000n / totalDisputedPaise) / 100 
      : 0

    return {
      totalLossesPaise,
      totalRecoveredPaise,
      pendingReservePaise,
      lossRate
    }
  }

  // Helper to get next settlement batch ID
  private getNextSettlementBatchId(): string {
    const date = new Date()
    date.setDate(date.getDate() + 1) // Next day settlement
    return `SETTLE-${date.toISOString().split('T')[0]}`
  }

  // Clear all entries (for testing)
  clearAll(): void {
    this.entries.clear()
    this.allocations.clear()
    this.entryId = 1
    this.initializeMockEntries()
  }
}

// Create singleton instance
export const chargebackLedgerService = new ChargebackLedgerService()