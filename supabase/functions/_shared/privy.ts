/* deno-lint-ignore-file no-explicit-any */

/**
 * Fetches all wallet addresses linked to a Privy user.
 * Requires server-side secret: PRIVY_APP_SECRET
 */
export async function getUserWalletAddresses(privyUserId: string): Promise<string[]> {
  const PRIVY_APP_SECRET = Deno.env.get('PRIVY_APP_SECRET');
  const PRIVY_APP_ID = Deno.env.get('VITE_PRIVY_APP_ID') || Deno.env.get('PRIVY_APP_ID') || '';
  if (!PRIVY_APP_SECRET) {
    throw new Error('Privy app secret not configured on server');
  }

  const url = `https://auth.privy.io/api/v1/users/${encodeURIComponent(privyUserId)}`;

  // Try Bearer scheme first (some Privy deployments accept API key as Bearer)
  let resp = await fetch(url, {
    headers: { Authorization: `Bearer ${PRIVY_APP_SECRET}` },
  });

  // Fallback to Basic with appId:appSecret if Bearer fails
  if (!resp.ok) {
    try {
      const basic = typeof btoa === 'function' && PRIVY_APP_ID
        ? btoa(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`)
        : '';
      if (basic) {
        resp = await fetch(url, {
          headers: {
            Authorization: `Basic ${basic}`,
            ...(PRIVY_APP_ID ? { 'privy-app-id': PRIVY_APP_ID } : {}),
          },
        });
      }
    } catch (_) {
      // ignore and let the subsequent check throw a helpful error
    }
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Failed to fetch user wallets from Privy: ${resp.status}${body ? ` ${body}` : ''}`);
  }

  const data = await resp.json();
  const addrs: string[] = [];

  // Common shapes returned by Privy API
  if (Array.isArray((data as any)?.wallets)) {
    for (const w of (data as any).wallets) {
      const a = (w?.address || w?.wallet?.address || w?.publicAddress || '').toLowerCase();
      if (a && a.startsWith('0x') && a.length === 42) addrs.push(a);
    }
  }
  if (Array.isArray((data as any)?.linked_accounts)) {
    for (const la of (data as any).linked_accounts) {
      const a = (la?.address || la?.publicAddress || '').toLowerCase();
      if (a && a.startsWith('0x') && a.length === 42) addrs.push(a);
    }
  }

  // De-duplicate
  return Array.from(new Set(addrs));
}
