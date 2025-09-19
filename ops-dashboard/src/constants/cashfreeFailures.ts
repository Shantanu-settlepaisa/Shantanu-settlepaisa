// Cashfree settlement failure taxonomy
export type FailureOwner = 'Bank' | 'Beneficiary' | 'Gateway' | 'Ops' | 'System' | 'Other';

export interface CashfreeFailure {
  code: string;
  label: string;
  owner: FailureOwner;
}

export const CASHFREE_FAILURES: CashfreeFailure[] = [
  // Bank related failures
  { code: 'BANK_GATEWAY_ERROR', label: 'Bank Gateway Error', owner: 'Bank' },
  { code: 'RETURNED_FROM_BENEFICIARY', label: 'Returned by Beneficiary', owner: 'Bank' },
  { code: 'IMPS_MODE_FAIL', label: 'IMPS Failed', owner: 'Bank' },
  { code: 'RTGS_MODE_FAIL', label: 'RTGS Failed', owner: 'Bank' },
  { code: 'REINITIALIZE_TRANSFER_LATER', label: 'Retry Later', owner: 'Bank' },
  { code: 'DEST_LIMIT_REACHED', label: 'Destination Limit Reached', owner: 'Bank' },
  { code: 'NPCI_UNAVAILABLE', label: 'NPCI Unavailable', owner: 'Bank' },
  { code: 'BENEFICIARY_BANK_OFFLINE', label: 'Beneficiary Bank Offline', owner: 'Bank' },
  { code: 'INVALID_MODE_FAIL', label: 'Invalid Mode', owner: 'Bank' },
  { code: 'ANY_OTHER_REASON', label: 'Other (Bank)', owner: 'Bank' },

  // Beneficiary / account related
  { code: 'INVALID_IFSC_FAIL', label: 'Invalid IFSC', owner: 'Beneficiary' },
  { code: 'INVALID_ACCOUNT_FAIL', label: 'Invalid Account', owner: 'Beneficiary' },
  { code: 'NRE_ACCOUNT_FAIL', label: 'NRE Account', owner: 'Beneficiary' },
  { code: 'ACCOUNT_BLOCKED', label: 'Account Blocked/Frozen', owner: 'Beneficiary' },
  { code: 'SUSPECTED_TRANSFER', label: 'Suspected Transfer', owner: 'Beneficiary' },
  { code: 'BENE_NAME_DIFFERS', label: 'Beneficiary Name Differs', owner: 'Beneficiary' },
  { code: 'INVALID_OR_NO_SUCH_ACCOUNT_TYPE', label: 'Invalid Account Type', owner: 'Beneficiary' },

  // Gateway/vendor/config related
  { code: 'INSUFFICIENT_BALANCE', label: 'Insufficient Balance', owner: 'Gateway' },
  { code: 'INVALID_AMOUNT_FAIL', label: 'Invalid Amount', owner: 'Gateway' },
  { code: 'DISABLED_MODE', label: 'Mode Disabled', owner: 'Gateway' },
  { code: 'AMAZON_AMOUNT_EXCEED', label: 'Amount Exceeds Limit', owner: 'Gateway' },
  { code: 'BENEFICIARY_BLACKLISTED', label: 'Beneficiary Blacklisted', owner: 'Gateway' },
  { code: 'PAYOUT_INACTIVE', label: 'Payout Inactive', owner: 'Gateway' },
  { code: 'INVALID_TRANSFER_AMOUNT', label: 'Invalid Transfer Amount', owner: 'Gateway' },
  { code: 'BENEFICIARY_NOT_EXIST', label: 'Beneficiary Not Found', owner: 'Gateway' },
  { code: 'BENEFICIARY_INVALID_MODE', label: 'Beneficiary Invalid Mode', owner: 'Gateway' },
  { code: 'INVALID_BENE_ACCOUNT_OR_IFSC', label: 'Invalid Account/IFSC', owner: 'Gateway' },

  // General/unknown
  { code: 'FAILED', label: 'Failed (No Reason)', owner: 'Other' },
];

// Color mapping by owner
export const OWNER_COLORS: Record<FailureOwner, string> = {
  Bank: '#0EA5A5',        // Teal
  Beneficiary: '#22C55E', // Green  
  Gateway: '#6366F1',     // Indigo
  Ops: '#F59E0B',        // Amber
  System: '#EF4444',     // Red
  Other: '#94A3B8',      // Slate
};

// Helper to get failure details by code
export function getFailureByCode(code: string): CashfreeFailure | undefined {
  return CASHFREE_FAILURES.find(f => f.code === code);
}

// Helper to get failures by owner
export function getFailuresByOwner(owner: FailureOwner): CashfreeFailure[] {
  return CASHFREE_FAILURES.filter(f => f.owner === owner);
}