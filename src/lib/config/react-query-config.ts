/**
 * Shared React Query configuration constants
 * Used across all query hooks for consistent retry behavior and caching
 */

// Retry configuration
export const MAX_RETRIES = 3;
export const INITIAL_RETRY_DELAY_MS = 1000;
export const RETRY_BACKOFF_MULTIPLIER = 2;
export const MAX_RETRY_DELAY_MS = 30000; // 30 seconds

/**
 * Calculates exponential backoff delay for React Query retries
 * @param attemptIndex - Zero-based retry attempt index
 * @returns Delay in milliseconds, capped at MAX_RETRY_DELAY_MS
 */
export const calculateRetryDelay = (attemptIndex: number): number => {
  return Math.min(
    INITIAL_RETRY_DELAY_MS * (RETRY_BACKOFF_MULTIPLIER ** attemptIndex),
    MAX_RETRY_DELAY_MS
  );
};

// Cache time configuration for different data types
export const CACHE_TIMES = {
  // User-specific data (changes less frequently)
  USER_TICKET_BALANCE: {
    STALE_TIME_MS: 15 * 60 * 1000, // 15 minutes
    GARBAGE_COLLECTION_TIME_MS: 20 * 60 * 1000, // 20 minutes
  },

  // Event aggregates (changes more frequently with sales)
  EVENT_TOTAL_KEYS: {
    STALE_TIME_MS: 5 * 60 * 1000, // 5 minutes
    GARBAGE_COLLECTION_TIME_MS: 10 * 60 * 1000, // 10 minutes
  },

  // Network configurations (rarely changes)
  NETWORK_CONFIG: {
    STALE_TIME_MS: 60 * 60 * 1000, // 1 hour
    GARBAGE_COLLECTION_TIME_MS: 24 * 60 * 60 * 1000, // 24 hours
  },

  // Token metadata from contracts (rarely changes)
  TOKEN_METADATA: {
    STALE_TIME_MS: 60 * 60 * 1000, // 1 hour
    GARBAGE_COLLECTION_TIME_MS: 24 * 60 * 60 * 1000, // 24 hours
  },
} as const;
