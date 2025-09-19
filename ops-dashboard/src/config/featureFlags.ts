/**
 * Feature flags configuration
 * All feature flags should be defined here with sensible defaults
 */

export interface FeatureFlags {
  FEATURE_SETTLEMENT_CYCLE: boolean;
  FEATURE_INSTANT_SETTLEMENT: boolean;
  FEATURE_DATA_CONSISTENCY_CHECK: boolean;
  FEATURE_BULK_OPERATIONS: boolean;
  FEATURE_ADVANCED_ANALYTICS: boolean;
}

// Default feature flag values
const defaultFlags: FeatureFlags = {
  FEATURE_SETTLEMENT_CYCLE: true, // ON by default as requested
  FEATURE_INSTANT_SETTLEMENT: true,
  FEATURE_DATA_CONSISTENCY_CHECK: true,
  FEATURE_BULK_OPERATIONS: false,
  FEATURE_ADVANCED_ANALYTICS: false,
};

/**
 * Get feature flag value from environment or use default
 */
function getFeatureFlag(key: keyof FeatureFlags): boolean {
  const envKey = `VITE_${key}`;
  const envValue = import.meta.env[envKey];
  
  if (envValue !== undefined) {
    return envValue === 'true' || envValue === '1';
  }
  
  return defaultFlags[key];
}

/**
 * Feature flags singleton
 */
export const featureFlags: FeatureFlags = {
  FEATURE_SETTLEMENT_CYCLE: getFeatureFlag('FEATURE_SETTLEMENT_CYCLE'),
  FEATURE_INSTANT_SETTLEMENT: getFeatureFlag('FEATURE_INSTANT_SETTLEMENT'),
  FEATURE_DATA_CONSISTENCY_CHECK: getFeatureFlag('FEATURE_DATA_CONSISTENCY_CHECK'),
  FEATURE_BULK_OPERATIONS: getFeatureFlag('FEATURE_BULK_OPERATIONS'),
  FEATURE_ADVANCED_ANALYTICS: getFeatureFlag('FEATURE_ADVANCED_ANALYTICS'),
};

/**
 * Hook to access feature flags
 */
export function useFeatureFlags() {
  return featureFlags;
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return featureFlags[feature];
}

/**
 * Development-only: Override feature flags for testing
 * This function should only be used in development/testing
 */
export function overrideFeatureFlag(feature: keyof FeatureFlags, value: boolean) {
  if (import.meta.env.DEV) {
    (featureFlags as any)[feature] = value;
    console.log(`Feature flag ${feature} overridden to ${value}`);
  } else {
    console.warn('Feature flag override attempted in production - ignored');
  }
}