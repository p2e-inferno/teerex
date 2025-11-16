/**
 * Retry helper utility for handling transient errors with exponential backoff
 */

export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Retries an async operation with exponential backoff
 * @param operation The async function to retry
 * @param options Retry configuration
 * @param context Optional context string for logging
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  context?: string
): Promise<T> {
  let lastError: any;
  let delay = options.initialDelay;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      console.log(`[Retry] Attempt ${attempt}/${options.maxAttempts}${context ? ` - ${context}` : ''}`);
      const result = await operation();

      if (attempt > 1) {
        console.log(`[Retry] Success on attempt ${attempt}${context ? ` - ${context}` : ''}`);
      }

      return result;
    } catch (error: any) {
      lastError = error;

      // Check if we should retry this error
      if (options.shouldRetry && !options.shouldRetry(error)) {
        console.error(`[Retry] Non-retryable error${context ? ` - ${context}` : ''}:`, error.message);
        throw error;
      }

      // If this was the last attempt, throw
      if (attempt === options.maxAttempts) {
        console.error(`[Retry] All ${options.maxAttempts} attempts failed${context ? ` - ${context}` : ''}`);
        throw error;
      }

      // Wait before retrying (exponential backoff with cap)
      console.warn(`[Retry] Attempt ${attempt} failed, retrying in ${delay}ms...`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Increase delay for next attempt
      delay = Math.min(delay * options.backoffMultiplier, options.maxDelay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Determines if a transaction error is retryable
 * @param error The error to check
 * @returns true if the error is retryable, false otherwise
 */
export function isRetryableTransactionError(error: any): boolean {
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';

  // Non-retryable errors - fail immediately
  const nonRetryablePatterns = [
    'insufficient funds',
    'execution reverted',
    'invalid address',
    'invalid parameter',
    'user rejected',
    'user denied',
  ];

  // Check if error is non-retryable first
  if (nonRetryablePatterns.some(pattern =>
    errorMessage.includes(pattern) || errorCode.includes(pattern)
  )) {
    return false;
  }

  // Retryable errors - transient network/nonce issues
  const retryablePatterns = [
    'nonce',
    'replacement fee too low',
    'timeout',
    'network',
    'connection',
    'econnreset',
    'enotfound',
    'etimedout',
    'already known',
    'transaction underpriced',
  ];

  // Check if error is retryable
  return retryablePatterns.some(pattern =>
    errorMessage.includes(pattern) || errorCode.includes(pattern)
  );
}
