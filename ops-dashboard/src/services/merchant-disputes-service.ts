// UC-DISPUTES-0001: Merchant Disputes Service - Real API Integration
import type {
  MerchantDispute,
  DisputeListFilters,
  DisputeListResponse,
  DisputeDetailResponse,
  DisputeEvidence
} from '@/types/merchant-disputes'

const API_BASE = `${import.meta.env.VITE_MERCHANT_API_URL || 'http://localhost:8080'}/v1/merchant`
const MERCHANT_ID = 'MERCH001'

class MerchantDisputesService {
  async getDisputes(filters: DisputeListFilters = {}): Promise<DisputeListResponse> {
    const params = new URLSearchParams({
      merchant_id: MERCHANT_ID,
      limit: String(filters.limit || 25),
      offset: String(filters.offset || 0)
    })

    if (filters.status && Array.isArray(filters.status)) {
      filters.status.forEach(s => params.append('status', s))
    } else if (filters.status) {
      params.append('status', filters.status as string)
    }

    if (filters.searchQuery) {
      params.append('searchQuery', filters.searchQuery)
    }

    if (filters.fromDate) {
      params.append('fromDate', filters.fromDate)
    }

    if (filters.toDate) {
      params.append('toDate', filters.toDate)
    }

    const response = await fetch(`${API_BASE}/disputes?${params}`)
    
    if (!response.ok) {
      throw new Error('Failed to fetch disputes')
    }

    const data = await response.json()
    
    return {
      disputes: data.disputes.map((d: any) => ({
        ...d,
        disputedAmountPaise: BigInt(d.disputedAmountPaise)
      })),
      pagination: data.pagination,
      summary: data.summary
    }
  }

  async getDisputeById(disputeId: string): Promise<DisputeDetailResponse> {
    const response = await fetch(`${API_BASE}/disputes/${disputeId}?merchant_id=${MERCHANT_ID}`)
    
    if (!response.ok) {
      throw new Error('Failed to fetch dispute details')
    }

    const data = await response.json()
    
    return {
      dispute: {
        ...data,
        disputedAmountPaise: BigInt(data.disputedAmountPaise),
        resolutionAmountPaise: data.resolutionAmountPaise ? BigInt(data.resolutionAmountPaise) : undefined,
        transaction: data.transaction ? {
          ...data.transaction,
          amountPaise: BigInt(data.transaction.amountPaise)
        } : undefined
      },
      evidence: [],
      activities: [],
      settlementImpact: undefined
    }
  }

  async submitEvidence(disputeId: string, evidence: {
    response: string
    files: DisputeEvidence[]
  }): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/disputes/${disputeId}/evidence?merchant_id=${MERCHANT_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        response: evidence.response,
        evidence: evidence.files
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to submit evidence')
    }

    return await response.json()
  }

  async exportDisputes(filters: DisputeListFilters = {}): Promise<string> {
    const params = new URLSearchParams({
      merchant_id: MERCHANT_ID
    })

    if (filters.status && Array.isArray(filters.status)) {
      filters.status.forEach(s => params.append('status', s))
    } else if (filters.status) {
      params.append('status', filters.status as string)
    }

    if (filters.searchQuery) {
      params.append('searchQuery', filters.searchQuery)
    }

    if (filters.fromDate) {
      params.append('fromDate', filters.fromDate)
    }

    if (filters.toDate) {
      params.append('toDate', filters.toDate)
    }

    const response = await fetch(`${API_BASE}/disputes/export?${params}`)
    
    if (!response.ok) {
      throw new Error('Failed to export disputes')
    }

    return await response.text()
  }
}

export const merchantDisputesService = new MerchantDisputesService()
