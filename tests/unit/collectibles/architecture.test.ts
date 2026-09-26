import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

describe('collectibles architecture guardrails', () => {
  it('keeps collectible browser data behind callEdgeFunction', () => {
    const api = readFileSync(resolve(process.cwd(), 'src/lib/collectibles/collectibleApi.ts'), 'utf8');
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
});
