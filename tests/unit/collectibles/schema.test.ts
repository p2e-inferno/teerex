import { describe, expect, it } from 'vitest';
import { collectibleFormSchema } from '@/types/collectible.schema';

const valid = {
  name: 'Sunset Bag',
  description: '<p>Limited <strong>crochet</strong> edition</p>',
  imageUrl: 'https://example.com/bag.jpg',
  chainId: 8453,
  currency: 'USDC' as const,
  price: 5,
  maxSupply: 10,
  maxKeysPerAddress: 1,
  isClaimable: false,
  fulfillmentNote: '',
};

describe('collectible form validation', () => {
  it('accepts a finite priced crypto collectible with rich text', () => {
    expect(collectibleFormSchema.parse(valid)).toMatchObject(valid);
  });

  it('requires meaningful fulfillment terms for a physical item', () => {
    expect(collectibleFormSchema.safeParse({ ...valid, isClaimable: true }).success).toBe(false);
    expect(collectibleFormSchema.safeParse({ ...valid, isClaimable: true, fulfillmentNote: '<p><br></p>' }).success).toBe(false);
    expect(collectibleFormSchema.safeParse({ ...valid, isClaimable: true, fulfillmentNote: '<p>Delivery within Nigeria.</p>' }).success).toBe(true);
  });

  it('does not allow a per-person limit above total supply', () => {
    const result = collectibleFormSchema.safeParse({ ...valid, maxSupply: 2, maxKeysPerAddress: 3 });
    expect(result.success).toBe(false);
  });

  it('rejects free, zero-supply and zero-limit collectibles in V1', () => {
    expect(collectibleFormSchema.safeParse({ ...valid, price: 0 }).success).toBe(false);
    expect(collectibleFormSchema.safeParse({ ...valid, maxSupply: 0 }).success).toBe(false);
    expect(collectibleFormSchema.safeParse({ ...valid, maxKeysPerAddress: 0 }).success).toBe(false);
  });
});
