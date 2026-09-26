import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('collectibles architecture guardrails', () => {
  it('keeps collectible browser data behind callEdgeFunction', () => {
    const api = read('src/lib/collectibles/collectibleApi.ts');
    expect(api).toContain('callEdgeFunction');
    expect(api).not.toMatch(/\.from\s*\(/);
    expect(api).not.toMatch(/\.rpc\s*\(/);
  });

  it('uses grouped domain functions rather than CRUD function slugs', () => {
    const functions = readdirSync(resolve(process.cwd(), 'supabase/functions'));
    expect(functions).toContain('collectibles');
    expect(functions).toContain('collectible-management');
    expect(functions.filter((name) => /^(create|update|get|list)-collectible/.test(name))).toEqual([]);
  });

  it('uses the shared rich text editor and display surfaces', () => {
    const create = read('src/pages/CreateCollectible.tsx');
    const manage = read('src/components/collectibles/CollectibleManagementDialog.tsx');
    const details = read('src/pages/CollectibleDetails.tsx');
    const purchase = read('src/components/collectibles/CollectiblePurchaseDialog.tsx');

    expect(create).toContain('RichTextEditor');
    expect(manage).toContain('RichTextEditor');
    expect(details).toContain('RichTextDisplay');
    expect(purchase).toContain('RichTextDisplay');
    expect(create).not.toContain('<Textarea');
    expect(manage).not.toContain('<Textarea');
  });

  it('persists post-deployment recovery so refresh cannot cause a duplicate lock', () => {
    const publisher = read('src/hooks/useCollectiblePublisher.ts');
    expect(publisher).toContain('localStorage');
    expect(publisher).toContain('pendingPersistence');
    expect(publisher).toContain('already waiting to finish publishing');
  });

  it('keeps the existing event host route on the existing HostProfile surface', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('import HostProfile from "./pages/HostProfile"');
    expect(app).toContain('<Route path="/host/:address" element={<HostProfile />} />');
    expect(app).toContain('<Route path="/u/:address" element={<PublicProfile />} />');
  });
});
