/**
 * OPS-OVR-CHARTS-001: Deep linking helper for drill-through navigation
 */

export interface ExceptionLinkParams {
  from?: string;
  to?: string;
  reasonCode?: string;
  ageMinHours?: number;
  ageMaxHours?: number;
  createdDate?: string;
  resolvedDate?: string;
  openOnDate?: string;
  source?: 'manual' | 'connector';
  status?: string | string[];
}

export function buildExceptionsLink(params: ExceptionLinkParams): string {
  const searchParams = new URLSearchParams();
  
  // Time window
  if (params.from) searchParams.append('from', params.from);
  if (params.to) searchParams.append('to', params.to);
  
  // Reason filter
  if (params.reasonCode) searchParams.append('reason', params.reasonCode);
  
  // Age filters
  if (params.ageMinHours !== undefined) {
    searchParams.append('ageMin', params.ageMinHours.toString());
  }
  if (params.ageMaxHours !== undefined) {
    searchParams.append('ageMax', params.ageMaxHours.toString());
  }
  
  // Date filters
  if (params.createdDate) searchParams.append('created', params.createdDate);
  if (params.resolvedDate) searchParams.append('resolved', params.resolvedDate);
  if (params.openOnDate) searchParams.append('openOn', params.openOnDate);
  
  // Source filter
  if (params.source) searchParams.append('source', params.source);
  
  // Status filter (defaults to open statuses)
  if (params.status) {
    if (Array.isArray(params.status)) {
      params.status.forEach(s => searchParams.append('status', s));
    } else {
      searchParams.append('status', params.status);
    }
  } else {
    // Default to open statuses
    ['open', 'assigned', 'investigating', 'escalated'].forEach(s => 
      searchParams.append('status', s)
    );
  }
  
  const queryString = searchParams.toString();
  return `/ops/exceptions${queryString ? `?${queryString}` : ''}`;
}

export function buildReconItemsLink(params: {
  from?: string;
  to?: string;
  status?: 'matched' | 'unmatched' | 'credited';
  source?: 'manual' | 'connector';
  range?: string;
}): string {
  const searchParams = new URLSearchParams();
  
  if (params.from) searchParams.append('from', params.from);
  if (params.to) searchParams.append('to', params.to);
  if (params.status) searchParams.append('status', params.status);
  if (params.source) searchParams.append('source', params.source);
  if (params.range) searchParams.append('range', params.range);
  
  const queryString = searchParams.toString();
  return `/ops/recon/items${queryString ? `?${queryString}` : ''}`;
}

export function getAgeBucketHours(bucket: string): { min: number; max?: number } {
  switch (bucket) {
    case '0-24h':
      return { min: 0, max: 24 };
    case '24-48h':
      return { min: 24, max: 48 };
    case '2-7d':
      return { min: 48, max: 168 };
    case '>7d':
      return { min: 168 };
    default:
      return { min: 0 };
  }
}

export function formatDateForAPI(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getDateRangeFromWindow(window: string): { from: string; to: string } {
  const now = new Date();
  const to = formatDateForAPI(now);
  let from: string;
  
  switch (window) {
    case 'last_7d':
      const week = new Date(now);
      week.setDate(week.getDate() - 7);
      from = formatDateForAPI(week);
      break;
    case 'last_30d':
      const month = new Date(now);
      month.setDate(month.getDate() - 30);
      from = formatDateForAPI(month);
      break;
    default:
      // Default to last 7 days
      const defaultWeek = new Date(now);
      defaultWeek.setDate(defaultWeek.getDate() - 7);
      from = formatDateForAPI(defaultWeek);
  }
  
  return { from, to };
}