import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { resolveENS, isValidENSName } from '@/utils/ensUtils';

/**
 * Cache configuration for ENS resolution
 * ENS names rarely change their resolution, so we can cache longer
 */
const ENS_STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes
const ENS_GC_TIME_MS = 60 * 60 * 1000; // 1 hour

/**
 * Debounce delay for ENS input
 * Prevents excessive lookups while user is typing
 */
const ENS_DEBOUNCE_MS = 500;

/**
 * Query keys for ENS resolution queries
 */
export const ensResolutionQueryKeys = {
  all: ['ens-resolution'] as const,
  byName: (name: string) => ['ens-resolution', name.toLowerCase()] as const,
};

/**
 * React Query hook: Resolve ENS names to Ethereum addresses with debouncing
 *
 * Features:
 * - Automatic validation of ENS name format
 * - 500ms debounce to avoid excessive RPC calls while typing
 * - Long cache time (5 minutes) since ENS rarely changes
 * - Returns both resolved address and validation state
 *
 * @param input - The ENS name to resolve (e.g., 'vitalik.eth')
 * @param options - React Query options
 *
 * @returns Query result with resolved address, validation state, and loading indicator
 *
 * @example
 * ```tsx
 * const [recipient, setRecipient] = useState('');
 * const { address, isResolving, isValidENS, error } = useENSResolution(recipient);
 *
 * return (
 *   <div>
 *     <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
 *     {isResolving && <Spinner />}
 *     {isValidENS && address && (
 *       <div>Resolves to: {address}</div>
 *     )}
 *     {isValidENS && !isResolving && !address && (
 *       <div>ENS name not found</div>
 *     )}
 *   </div>
 * );
 * ```
 */
export function useENSResolution(
  input: string | undefined,
  options?: { enabled?: boolean }
) {
  // Debounced input state
  const [debouncedInput, setDebouncedInput] = useState(input);

  // Debounce the input to avoid excessive lookups
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInput(input);
    }, ENS_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [input]);

  // Validate ENS format
  const isValidENS = debouncedInput ? isValidENSName(debouncedInput) : false;

  // Resolve ENS name to address
  const {
    data: address,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ensResolutionQueryKeys.byName(debouncedInput || ''),
    queryFn: () => resolveENS(debouncedInput!),
    staleTime: ENS_STALE_TIME_MS,
    gcTime: ENS_GC_TIME_MS,
    enabled:
      !!debouncedInput &&
      isValidENS &&
      (options?.enabled ?? true),
    retry: 2, // Retry failed resolutions
  });

  return {
    /**
     * The resolved Ethereum address (null if not found or invalid)
     */
    address,

    /**
     * True while ENS resolution is in progress (including debounce period)
     */
    isResolving: (input !== debouncedInput) || isLoading,

    /**
     * True if the input is a valid ENS name format (.eth suffix, valid characters)
     */
    isValidENS,

    /**
     * Error from ENS resolution (if any)
     */
    error,

    /**
     * Manual refetch function
     */
    refetch,
  };
}
