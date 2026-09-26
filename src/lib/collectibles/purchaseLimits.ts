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
