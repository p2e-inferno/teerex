import { describe, expect, it } from 'vitest';
import { getCollectCta, getCollectiblePurchaseAllowance, isCollectibleQuantityAllowed } from '@/lib/collectibles/purchaseLimits';

describe('collectible purchase allowance', () => {
  it('uses the lower of global supply and the purchasing wallet allowance', () => {
    expect(getCollectiblePurchaseAllowance({
      maxSupply: 10,
      sold: 2,
      maxPerWallet: 5,
      ownedByPurchasingWallet: 2,
    })).toBe(3);
  });

  it('blocks purchases when the lock is sold out', () => {
    expect(getCollectiblePurchaseAllowance({
      maxSupply: 3,
      sold: 3,
      maxPerWallet: 5,
      ownedByPurchasingWallet: 0,
    })).toBe(0);
  });

  it('blocks additional purchases after this wallet reaches its limit', () => {
    expect(getCollectiblePurchaseAllowance({
      maxSupply: 100,
      sold: 10,
      maxPerWallet: 2,
      ownedByPurchasingWallet: 2,
    })).toBe(0);
  });

  it('validates whole-number quantities within the remaining allowance', () => {
    expect(isCollectibleQuantityAllowed(3, 3)).toBe(true);
    expect(isCollectibleQuantityAllowed(4, 3)).toBe(false);
    expect(isCollectibleQuantityAllowed(0, 3)).toBe(false);
    expect(isCollectibleQuantityAllowed(1.5, 3)).toBe(false);
  });
});

describe('collect call to action', () => {
  it('stays disabled until on-chain availability is known', () => {
    expect(getCollectCta({ ready: false, error: null, sold: 0, maxSupply: 10 })).toEqual({ label: 'Checking availability…', disabled: true });
    expect(getCollectCta({ ready: true, error: new Error('rpc'), sold: 0, maxSupply: 10 })).toEqual({ label: 'Availability unavailable', disabled: true });
  });

  it('disables collecting once supply is exhausted', () => {
    expect(getCollectCta({ ready: true, error: null, sold: 10, maxSupply: 10 })).toEqual({ label: 'Sold out', disabled: true });
  });

  it('enables collecting while supply remains', () => {
    expect(getCollectCta({ ready: true, error: null, sold: 9, maxSupply: 10 })).toEqual({ label: 'Collect', disabled: false });
  });
});
