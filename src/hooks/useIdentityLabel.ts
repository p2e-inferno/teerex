import { useMemo } from 'react';
import { resolveIdentityLabel } from '@/lib/identity';
import type { IdentityLabelSource } from '@/lib/identity';
import { useReverseENSName } from '@/hooks/useReverseENSName';

export interface UseIdentityLabelInput {
  address?: string | null;
  displayName?: string | null;
  ensName?: string | null;
  fallback?: string;
  enabled?: boolean;
}

export function useIdentityLabel({
  address,
  displayName,
  ensName,
  fallback,
  enabled = true,
}: UseIdentityLabelInput) {
  const reverse = useReverseENSName(address, { enabled: enabled && !ensName });
  const resolvedEnsName = ensName ?? reverse.ensName;

  const identity = useMemo(
    () => resolveIdentityLabel({
      ensName: resolvedEnsName,
      displayName,
      address,
      fallback,
    }),
    [address, displayName, fallback, resolvedEnsName],
  );

  return {
    ...identity,
    ensName: resolvedEnsName,
    isResolvingEns: reverse.isResolving,
    normalizedAddress: reverse.normalizedAddress,
  } satisfies {
    label: string;
    source: IdentityLabelSource;
    ensName: string | null;
    isResolvingEns: boolean;
    normalizedAddress: string | null;
  };
}
