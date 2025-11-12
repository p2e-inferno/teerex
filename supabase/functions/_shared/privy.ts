/* deno-lint-ignore-file no-explicit-any */
import { createRemoteJWKSet, jwtVerify, importSPKI } from 'https://deno.land/x/jose@v4.14.4/index.ts';

const PRIVY_APP_ID = Deno.env.get('VITE_PRIVY_APP_ID') || Deno.env.get('PRIVY_APP_ID') || '';
const PRIVY_VERIFICATION_KEY = Deno.env.get('PRIVY_VERIFICATION_KEY');

// Type for payload to improve safety
interface PrivyPayload { sub: string; [key: string]: unknown; }

/**
 * Verifies Privy JWT token from X-Privy-Authorization header
 * Returns the authenticated Privy user ID
 * Throws error if verification fails
 */
export async function verifyPrivyToken(authHeader: string | null): Promise<string> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const accessToken = authHeader.split(' ')[1];
  let privyUserId: string | undefined;

  // Try JWKS first
  try {
    const JWKS = createRemoteJWKSet(
      new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`)
    );
    const { payload } = await jwtVerify(accessToken, JWKS, {
      issuer: 'privy.io',
      audience: PRIVY_APP_ID,
    });
    const verifiedPayload = payload as PrivyPayload;
    privyUserId = verifiedPayload.sub;
  } catch (_) {
    // Fallback to verification key
    if (!PRIVY_VERIFICATION_KEY) throw _;
    const key = await importSPKI(PRIVY_VERIFICATION_KEY, 'ES256');
    const { payload } = await jwtVerify(accessToken, key, {
      issuer: 'privy.io',
      audience: PRIVY_APP_ID,
    });
    const verifiedPayload = payload as PrivyPayload;
    privyUserId = verifiedPayload.sub;
  }

  if (!privyUserId) {
    throw new Error('Token verification failed: no user ID');
  }

  return privyUserId;
}

/**
 * Validates that the provided wallet address belongs to the authenticated Privy user
 * Returns the normalized (lowercase) address if valid
 * Throws error if address is invalid or doesn't belong to user
 */
export async function validateUserWallet(
  privyUserId: string,
  address: string | undefined,
  errorMessage = 'Wallet address not authorized for this user'
): Promise<string> {
  const normalized = address ? address.toLowerCase().trim() : '';

  if (!normalized || !normalized.startsWith('0x') || normalized.length !== 42) {
    throw new Error('Invalid wallet address format');
  }

  const userWallets = await getUserWalletAddresses(privyUserId);

  if (!userWallets.length) {
    throw new Error('No wallets linked to authenticated user');
  }

  if (!userWallets.includes(normalized)) {
    throw new Error(errorMessage);
  }

  return normalized;
}

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
