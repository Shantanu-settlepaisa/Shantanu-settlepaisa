/**
 * Safe Math Utilities for SettlePaisa 2.0 Ops Dashboard
 *
 * Prevents NaN, Infinity, and division by zero errors in calculations.
 * All functions handle edge cases: null, undefined, 0, NaN, Infinity.
 *
 * @module mathUtils
 */

/**
 * Safely divide two numbers with protection against division by zero, NaN, and Infinity.
 *
 * @param numerator - The number to divide
 * @param denominator - The number to divide by
 * @param defaultValue - Value to return if division is invalid (default: 0)
 * @returns The result of division, or defaultValue if invalid
 *
 * @example
 * safeDivide(100, 50) // 2
 * safeDivide(100, 0) // 0 (default)
 * safeDivide(100, 0, -1) // -1 (custom default)
 * safeDivide(NaN, 10) // 0
 */
export function safeDivide(
  numerator: number,
  denominator: number,
  defaultValue: number = 0
): number {
  // Check if inputs are valid finite numbers
  if (!isFinite(numerator) || !isFinite(denominator)) {
    return defaultValue;
  }

  // Check for division by zero
  if (denominator === 0) {
    return defaultValue;
  }

  const result = numerator / denominator;

  // Final safety check - ensure result is finite
  return isFinite(result) ? result : defaultValue;
}

/**
 * Calculate percentage with safe division (returns whole number 0-100).
 *
 * @param numerator - The part value
 * @param denominator - The total value
 * @param defaultValue - Value to return if calculation is invalid (default: 0)
 * @returns Percentage as whole number (0-100), or defaultValue if invalid
 *
 * @example
 * safePercentage(50, 100) // 50
 * safePercentage(1, 3) // 33
 * safePercentage(10, 0) // 0
 */
export function safePercentage(
  numerator: number,
  denominator: number,
  defaultValue: number = 0
): number {
  const result = safeDivide(numerator, denominator, defaultValue / 100) * 100;
  return Math.round(result);
}

/**
 * Safely parse a value to integer with null/undefined handling.
 *
 * @param value - Value to parse (can be string, number, null, undefined)
 * @param defaultValue - Value to return if parsing fails (default: 0)
 * @returns Parsed integer, or defaultValue if invalid
 *
 * @example
 * safeParseInt("123") // 123
 * safeParseInt(null) // 0
 * safeParseInt(undefined) // 0
 * safeParseInt("") // 0
 * safeParseInt("abc", -1) // -1
 */
export function safeParseInt(value: any, defaultValue: number = 0): number {
  // Handle null, undefined, empty string
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = parseInt(String(value), 10);

  // Return default if parsing resulted in NaN
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Safely parse a value to float with null/undefined handling.
 *
 * @param value - Value to parse (can be string, number, null, undefined)
 * @param defaultValue - Value to return if parsing fails (default: 0)
 * @returns Parsed float, or defaultValue if invalid
 *
 * @example
 * safeParseFloat("123.45") // 123.45
 * safeParseFloat(null) // 0
 * safeParseFloat(undefined) // 0
 * safeParseFloat("") // 0
 * safeParseFloat("abc", -1) // -1
 */
export function safeParseFloat(value: any, defaultValue: number = 0): number {
  // Handle null, undefined, empty string
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = parseFloat(String(value));

  // Return default if parsing resulted in NaN
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Safely format a number to fixed decimal places.
 *
 * @param value - Value to format (can be string, number, null, undefined)
 * @param decimals - Number of decimal places (default: 2)
 * @param defaultValue - Value to use if input is invalid (default: 0)
 * @returns Formatted string with fixed decimals
 *
 * @example
 * safeToFixed(123.456, 2) // "123.46"
 * safeToFixed(null, 2) // "0.00"
 * safeToFixed(undefined, 2) // "0.00"
 * safeToFixed(NaN, 2) // "0.00"
 */
export function safeToFixed(
  value: any,
  decimals: number = 2,
  defaultValue: number = 0
): string {
  const num = safeParseFloat(value, defaultValue);
  return num.toFixed(decimals);
}

/**
 * Calculate average of an array with protection against empty arrays.
 *
 * @param values - Array of numbers to average
 * @param defaultValue - Value to return if array is empty or invalid (default: 0)
 * @returns Average value, or defaultValue if array is empty/invalid
 *
 * @example
 * safeAverage([10, 20, 30]) // 20
 * safeAverage([]) // 0
 * safeAverage([NaN, 10, 20]) // 15 (ignores NaN)
 */
export function safeAverage(values: number[], defaultValue: number = 0): number {
  if (!Array.isArray(values) || values.length === 0) {
    return defaultValue;
  }

  // Filter out non-finite values (NaN, Infinity)
  const validValues = values.filter(v => isFinite(v));

  if (validValues.length === 0) {
    return defaultValue;
  }

  const sum = validValues.reduce((acc, val) => acc + val, 0);
  return safeDivide(sum, validValues.length, defaultValue);
}

/**
 * Calculate sum of an array with protection against invalid values.
 *
 * @param values - Array of numbers to sum
 * @param defaultValue - Value to return if array is empty or invalid (default: 0)
 * @returns Sum of valid values, or defaultValue if array is empty/invalid
 *
 * @example
 * safeSum([10, 20, 30]) // 60
 * safeSum([]) // 0
 * safeSum([NaN, 10, 20]) // 30 (ignores NaN)
 */
export function safeSum(values: number[], defaultValue: number = 0): number {
  if (!Array.isArray(values) || values.length === 0) {
    return defaultValue;
  }

  // Filter out non-finite values (NaN, Infinity)
  const validValues = values.filter(v => isFinite(v));

  if (validValues.length === 0) {
    return defaultValue;
  }

  return validValues.reduce((acc, val) => acc + val, 0);
}

/**
 * Format number as Indian currency (₹).
 *
 * @param value - Value to format
 * @param decimals - Number of decimal places (default: 2)
 * @param defaultValue - Value to use if input is invalid (default: 0)
 * @returns Formatted currency string
 *
 * @example
 * formatCurrency(1234567.89) // "₹12,34,567.89"
 * formatCurrency(null) // "₹0.00"
 */
export function formatCurrency(
  value: any,
  decimals: number = 2,
  defaultValue: number = 0
): string {
  const num = safeParseFloat(value, defaultValue);

  // Format with Indian numbering system (lakhs, crores)
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

/**
 * Format number as compact notation (K, M, B).
 *
 * @param value - Value to format
 * @param decimals - Number of decimal places (default: 1)
 * @param defaultValue - Value to use if input is invalid (default: 0)
 * @returns Formatted compact string
 *
 * @example
 * formatCompact(1234) // "1.2K"
 * formatCompact(1234567) // "1.2M"
 * formatCompact(null) // "0"
 */
export function formatCompact(
  value: any,
  decimals: number = 1,
  defaultValue: number = 0
): string {
  const num = safeParseFloat(value, defaultValue);

  if (num >= 1e9) {
    return (num / 1e9).toFixed(decimals) + 'B';
  } else if (num >= 1e6) {
    return (num / 1e6).toFixed(decimals) + 'M';
  } else if (num >= 1e3) {
    return (num / 1e3).toFixed(decimals) + 'K';
  }

  return num.toFixed(0);
}
