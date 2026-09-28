export interface CollectiblePurchaseAllowanceInput {
  maxSupply: number;
  sold: number;
  maxPerWallet: number;
  ownedByPurchasingWallet: number;
}

export function getCollectiblePurchaseAllowance({
  maxSupply,
  sold,
  maxPerWallet,
  ownedByPurchasingWallet,
}: CollectiblePurchaseAllowanceInput): number {
  const globalRemaining = Math.max(0, Math.trunc(maxSupply) - Math.trunc(sold));
  const walletRemaining = Math.max(0, Math.trunc(maxPerWallet) - Math.trunc(ownedByPurchasingWallet));
  return Math.min(globalRemaining, walletRemaining);
}

export function isCollectibleQuantityAllowed(quantity: number, allowance: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= allowance;
}

export interface CollectCtaInput {
  ready: boolean;
  error: unknown;
  sold: number;
  maxSupply: number;
}

export function getCollectCta({ ready, error, sold, maxSupply }: CollectCtaInput): { label: string; disabled: boolean } {
  if (!ready) return { label: 'Checking availability…', disabled: true };
  if (error) return { label: 'Availability unavailable', disabled: true };
  if (sold >= maxSupply) return { label: 'Sold out', disabled: true };
  return { label: 'Collect', disabled: false };
}
