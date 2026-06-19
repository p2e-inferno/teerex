import { ethers } from 'ethers';
import type { TicketPass } from '@/types/ticketPass';

function trimZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/\.?0+$/, '');
}

/** Human-readable per-copy payout, e.g. "50 USDC + 0.01 ETH". */
export function formatPayoutSummary(pass: Pick<TicketPass, 'token_per_copy_wei' | 'eth_per_copy_wei' | 'token_decimals' | 'payout_token_symbol'>): string {
  const parts: string[] = [];
  if (pass.token_per_copy_wei && pass.token_per_copy_wei !== '0' && pass.token_decimals != null) {
    parts.push(`${trimZeros(ethers.formatUnits(pass.token_per_copy_wei, pass.token_decimals))} ${pass.payout_token_symbol || 'tokens'}`);
  }
  if (pass.eth_per_copy_wei && pass.eth_per_copy_wei !== '0') {
    parts.push(`${trimZeros(ethers.formatEther(pass.eth_per_copy_wei))} ETH`);
  }
  return parts.join(' + ') || '—';
}

export function formatFiatPrice(pass: Pick<TicketPass, 'price_fiat' | 'fiat_symbol'>): string {
  return `${pass.fiat_symbol || 'NGN'} ${Number(pass.price_fiat || 0).toLocaleString()}`;
}

export const TICKET_PASS_STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ACTIVE: { label: 'Active', variant: 'default' },
  SOLD_OUT: { label: 'Sold out', variant: 'secondary' },
  CLOSED: { label: 'Closed', variant: 'destructive' },
};
