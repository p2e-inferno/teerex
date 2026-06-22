import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

function read(path: string) {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('DG redemption edge-call contracts', () => {
  it('uses callEdgeFunction from Profile redemption surfaces', () => {
    const files = [
      'src/components/profile/DgRedemptionCard.tsx',
      'src/components/profile/UserPayoutAccountCard.tsx',
      'src/pages/AdminDgRedemption.tsx',
      'src/hooks/useUserPayoutAccount.ts',
      'src/hooks/useBanks.ts',
      'src/hooks/useResolveAccount.ts',
    ];

    for (const file of files) {
      const source = read(file);
      expect(source).toContain('callEdgeFunction');
      expect(source).not.toContain('supabase.functions.invoke');
    }
  });

  it('keeps user-facing copy framed as Redeem DG', () => {
    const source = [
      read('src/components/profile/DgRedemptionCard.tsx'),
      read('src/pages/AdminDgRedemption.tsx'),
    ].join('\n');

    expect(source).toContain('Redeem DG');
    expect(source.toLowerCase()).not.toContain('sell dg');
    expect(source.toLowerCase()).not.toContain('dg sale');
  });

  it('calls GET-only payout account helper functions with GET', () => {
    expect(read('src/hooks/useBanks.ts')).toContain("method: 'GET'");
    expect(read('src/hooks/useResolveAccount.ts')).toContain("method: 'GET'");
  });

  it('keeps resumable user requests and stale expiry reachable from existing pages', () => {
    const profileSource = read('src/components/profile/DgRedemptionCard.tsx');
    const adminSource = read('src/pages/AdminDgRedemption.tsx');

    expect(profileSource).toContain('list-user-dg-redemptions');
    expect(profileSource).toContain('Resume');
    expect(adminSource).toContain('expire-dg-redemption-intents');
    expect(adminSource).toContain('setExpandedId');
  });
});
