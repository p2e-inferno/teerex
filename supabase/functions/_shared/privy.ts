/* deno-lint-ignore-file no-explicit-any */

/**
 * Fetches all wallet addresses linked to a Privy user.
 * Requires server-side secret: PRIVY_APP_SECRET
 */
export async function getUserWalletAddresses(privyUserId: string): Promise<string[]> {
  const PRIVY_APP_SECRET = Deno.env.get('PRIVY_APP_SECRET');
  if (!PRIVY_APP_SECRET) {
    throw new Error('Privy app secret not configured on server');
  }

  const resp = await fetch(
    `https://auth.privy.io/api/v1/users/${encodeURIComponent(privyUserId)}`,
    { headers: { Authorization: `Bearer ${PRIVY_APP_SECRET}` } }
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch user wallets from Privy: ${resp.status}`);
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

