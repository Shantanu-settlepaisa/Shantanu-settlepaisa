/**
 * Currency formatting utilities for SettlePaisa dashboard
 * All amounts are stored in paise (BigInt) and converted to rupees for display
 */

export function paiseToINR(paise: string | number | bigint): string {
  try {
    const paiseValue = BigInt(paise);
    const rupees = Number(paiseValue) / 100; // Convert to rupees at display edge only
    
    return rupees.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  } catch (error) {
    console.warn('Error formatting currency:', error, 'value:', paise);
    return '₹0';
  }
}

/**
 * Format large amounts with Indian suffixes (L = Lakh, Cr = Crore)
 */
export function paiseToCompactINR(paise: string | number | bigint): string {
  try {
    const paiseValue = BigInt(paise);
    const rupees = Number(paiseValue) / 100;
    
    if (rupees >= 10000000) {
      return `₹${(rupees / 10000000).toFixed(2)}Cr`;
    } else if (rupees >= 100000) {
      return `₹${(rupees / 100000).toFixed(2)}L`;
    } else if (rupees >= 1000) {
      return `₹${(rupees / 1000).toFixed(2)}K`;
    }
    
    return rupees.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  } catch (error) {
    console.warn('Error formatting compact currency:', error, 'value:', paise);
    return '₹0';
  }
}

/**
 * Safe number parsing for amounts that might be strings or BigInt
 */
export function parseAmount(amount: string | number | bigint | null | undefined): bigint {
  if (amount === null || amount === undefined) return 0n;
  
  try {
    return BigInt(amount);
  } catch (error) {
    console.warn('Error parsing amount:', error, 'value:', amount);
    return 0n;
  }
}

/**
 * Calculate percentage with safe division
 */
export function safePercentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * Format percentage with one decimal place
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format paise to INR with optional compact notation
 */
export function formatINR(paise: string | number | bigint, compact = false): string {
  try {
    const v = BigInt(paise ?? 0);
    const rupees = Number(v) / 100;
    
    if (compact) {
      return new Intl.NumberFormat('en-IN', { 
        notation: 'compact', 
        maximumFractionDigits: 1, 
        style: 'currency', 
        currency: 'INR' 
      }).format(rupees);
    }
    
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR' 
    }).format(rupees);
  } catch (error) {
    console.warn('Error formatting INR:', error, 'value:', paise);
    return '₹0';
  }
}