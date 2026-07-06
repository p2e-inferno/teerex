export type IdentityLabelSource = 'ens' | 'displayName' | 'address' | 'fallback';

export interface IdentityLabelInput {
  ensName?: string | null;
  displayName?: string | null;
  address?: string | null;
  fallback?: string;
}

export interface ResolvedIdentityLabel {
  label: string;
  source: IdentityLabelSource;
}

export function normalizeWalletAddress(address?: string | null): string | null {
  const value = typeof address === 'string' ? address.trim() : '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value.toLowerCase();
}

export function shortAddress(address?: string | null, startChars = 6, endChars = 4): string {
  const value = typeof address === 'string' ? address.trim() : '';
  if (!value) return '';
  if (value.length <= startChars + endChars) return value;
  return `${value.slice(0, startChars)}...${value.slice(-endChars)}`;
}

export function resolveIdentityLabel(input: IdentityLabelInput): ResolvedIdentityLabel {
  const ensName = input.ensName?.trim();
  if (ensName) return { label: ensName, source: 'ens' };

  const displayName = input.displayName?.trim();
  if (displayName) return { label: displayName, source: 'displayName' };

  const address = input.address?.trim();
  if (address) return { label: shortAddress(address), source: 'address' };

  return { label: input.fallback ?? 'Unknown', source: 'fallback' };
}
