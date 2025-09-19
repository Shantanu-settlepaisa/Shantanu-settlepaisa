import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Money formatting
export function formatPaiseToINR(paise: number): string {
  const inr = Math.abs(paise) / 100
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(inr)
  return paise < 0 ? `-${formatted}` : formatted
}

// Alias for backward compatibility
export const formatCurrency = formatPaiseToINR
export const formatIndianCurrency = formatPaiseToINR

// File size formatting
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function formatCompactINR(paise: number): string {
  const inr = Math.abs(paise) / 100
  if (inr >= 10000000) return `₹${(inr / 10000000).toFixed(2)}Cr`
  if (inr >= 100000) return `₹${(inr / 100000).toFixed(2)}L`
  if (inr >= 1000) return `₹${(inr / 1000).toFixed(2)}K`
  return formatPaiseToINR(paise)
}

// Date formatting
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy')
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd MMM yyyy, hh:mm a')
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatDistanceToNow(d, { addSuffix: true })
}

// Status colors
export const statusColors = {
  success: 'bg-green-100 text-green-800',
  processing: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
  warning: 'bg-amber-100 text-amber-800',
  default: 'bg-gray-100 text-gray-800',
}

export function getStatusColor(status: string): string {
  const lowerStatus = status.toLowerCase()
  if (lowerStatus.includes('success') || lowerStatus.includes('complete') || lowerStatus.includes('matched')) {
    return statusColors.success
  }
  if (lowerStatus.includes('process') || lowerStatus.includes('matching')) {
    return statusColors.processing
  }
  if (lowerStatus.includes('fail') || lowerStatus.includes('error')) {
    return statusColors.failed
  }
  if (lowerStatus.includes('pending') || lowerStatus.includes('await')) {
    return statusColors.pending
  }
  if (lowerStatus.includes('exception') || lowerStatus.includes('mismatch')) {
    return statusColors.warning
  }
  return statusColors.default
}

// Percentage calculation
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}