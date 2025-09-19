import type { MerchantSettlementStatus, InternalSettlementStatus } from '@/types/settlementProgress';

/**
 * Maps internal settlement statuses to merchant-facing statuses.
 * Merchants only see: Processing, Settled, or Failed
 * 
 * @param status - Internal settlement status
 * @returns Merchant-facing status
 */
export function merchantStatusFromInternal(status: InternalSettlementStatus | string): MerchantSettlementStatus {
  // Anything that's pre-credit is "Processing"
  if (['initiated', 'processing', 'processed', 'sent_to_bank'].includes(status)) {
    return 'Processing';
  }
  
  // Only show "Settled" when actually credited with UTR
  if (['credited'].includes(status)) {
    return 'Settled';
  }
  
  // Failed states
  if (['failed', 'rejected', 'cancelled'].includes(status)) {
    return 'Failed';
  }
  
  // Default to Processing for unknown states
  return 'Processing';
}

/**
 * Get the appropriate status color/style for merchant view
 */
export function getMerchantStatusStyle(status: MerchantSettlementStatus) {
  switch (status) {
    case 'Settled':
      return {
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: '✓',
        dotColor: 'bg-emerald-500'
      };
    case 'Processing':
      return {
        className: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: '⟳',
        dotColor: 'bg-blue-500'
      };
    case 'Failed':
      return {
        className: 'bg-red-50 text-red-700 border-red-200',
        icon: '✕',
        dotColor: 'bg-red-500'
      };
    default:
      return {
        className: 'bg-gray-50 text-gray-700 border-gray-200',
        icon: '?',
        dotColor: 'bg-gray-500'
      };
  }
}

/**
 * Get the internal status label for OPS view
 * OPS sees the full detail
 */
export function getOpsStatusLabel(status: InternalSettlementStatus | string): string {
  const statusLabels: Record<string, string> = {
    'initiated': 'Initiated',
    'processing': 'Processing',
    'processed': 'Processed',
    'sent_to_bank': 'Sent to Bank',
    'credited': 'Credited (UTR)',
    'failed': 'Failed',
    'rejected': 'Rejected',
    'cancelled': 'Cancelled'
  };
  
  return statusLabels[status] || status;
}

/**
 * Timeline steps for settlement detail view
 * Merchant can see the steps but primary status chip only shows Processing/Settled/Failed
 */
export function getSettlementTimelineSteps(status: InternalSettlementStatus | string, utr?: string | null) {
  const steps = [
    {
      label: 'Settlement Initiated',
      completed: true,
      timestamp: null,
      description: 'Settlement batch created'
    },
    {
      label: 'Processing',
      completed: ['processing', 'processed', 'sent_to_bank', 'credited'].includes(status),
      timestamp: null,
      description: 'Validating and preparing batch'
    },
    {
      label: 'Sent to Bank',
      completed: ['sent_to_bank', 'credited'].includes(status),
      timestamp: null,
      description: 'Payout file sent to bank. Awaiting confirmation.',
      tooltip: 'We have sent the payout file to the bank. Awaiting credit confirmation.'
    },
    {
      label: 'Credited',
      completed: status === 'credited' && !!utr,
      timestamp: null,
      description: utr ? `UTR: ${utr}` : 'Awaiting UTR from bank',
      tooltip: utr ? 'The bank confirmed credit. UTR available.' : undefined
    }
  ];
  
  // Add failed step if applicable
  if (['failed', 'rejected', 'cancelled'].includes(status)) {
    steps.push({
      label: 'Failed',
      completed: true,
      timestamp: null,
      description: 'Settlement could not be processed',
      tooltip: undefined
    });
  }
  
  return steps;
}