export { shortAddress } from '@/lib/identity';

// Initials for a generated avatar. Wallets fall back to their first hex pair,
// since no profile images are stored for users yet.
export function initialsFrom(label: string): string {
  const trimmed = (label || '').trim();
  if (!trimmed) return '?';
  if (/^0x[a-fA-F0-9]+$/.test(trimmed)) return trimmed.slice(2, 4).toUpperCase();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
