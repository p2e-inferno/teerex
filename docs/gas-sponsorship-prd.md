# PRD: Gas Sponsorship (Phase 1 and 2)

Status: Draft for review
Owner: Teerex Platform
Scope: Phase 1 (Event creation) and Phase 2 (Ticket purchase: Free + USDC) only
Out of scope: Full AA/paymaster solution for ETH-priced events (Phase 3)

## Summary

Lower on-chain friction by sponsoring gas for creators publishing events and attendees claiming/purchasing tickets when feasible. The platform covers gas costs for:
- Event lock deployment (creators)
- Free-ticket issuance on-chain (attendees)
- USDC-priced ticket purchases on Base Mainnet and Base Sepolia (attendees)

Crypto purchases of ETH-priced tickets remain user-paid (non-gasless) for now. Users can opt out of gasless at interaction time. Admins can configure limits, chains, and feature toggles.

## Goals

- Remove gas hurdles for non-web3-native creators and attendees.
- Keep revenue on-chain by using Unlock `purchase` for paid (USDC) tickets.
- Make supported chains dynamic via existing configuration, starting with Base Mainnet and Base Sepolia.
- Collect and persist attendee email addresses for both fiat and crypto flows.
- Provide safe defaults and rate limits with clear fallback paths.

## Non-goals

- ETH-priced gas sponsorship (requires AA/paymasters) — deferred.
- Full-blown AA for external wallets — deferred.
- Replacing Paystack flow (it already issues tickets gaslessly via key grants).

## Users and Scenarios

- Creators: Publish events (deploy Unlock lock) without needing native gas.
- Attendees:
  - Free events: gasless issuance by the platform.
  - USDC-priced events on Base: user authorizes on-chain USDC transfer; platform sponsors gas to complete purchase.
  - ETH-priced events: user uses existing, non-gasless flow (pays gas).

## Supported Chains (dynamic)

- Source of truth: `network_configs` and/or `gasless_chains` tables in Supabase.
- Initial allowlist: Base Mainnet (8453), Base Sepolia (84532).
- Admin can enable/disable chains without code changes.

## Rate Limits and Defaults

- Event deployments: 15 per user per day (gasless by default, toggle to opt out).
- Ticket purchases (gas-sponsored): 20 per user per day.
- Over-limit fallback: users can proceed via the standard (non-gasless) path if they agree to pay gas.

## Consent and UX Defaults

- Gasless is default everywhere it applies.
- Creators: toggle “Sponsor gas for deployment” (default on).
- Attendees (free): gasless is default (no wallet prompts for gas).
- Attendees (USDC): gasless is default but users must explicitly approve/consent to server-initiated USDC transfer (off-chain signature) and may opt out to use the classic flow.

## Phase 1: Gasless Event Creation (Server-side deploy)

- What: New Edge Function deploys the Unlock lock using the platform service wallet; sets the creator as `_lockCreator` and adds the service wallet as a lock manager.
- Why: Removes native token requirement for creators while preserving normal lock ownership semantics.
- Chains: As configured (Base Mainnet and Base Sepolia at launch).
- Rate limit: 15/day per creator (identified via Privy user ID).

### API Contract (Edge Function: `deploy-lock`)

- Auth:
  - Require `X-Privy-Authorization: Bearer <access_token>` (verify Privy JWT → `sub`).
  - Supabase anon key required in `Authorization` if verify_jwt is enabled.
- Request (JSON):
  - `name: string`
  - `expirationDuration: number` (seconds)
  - `currency: 'FREE' | 'ETH' | 'USDC'` (other ERC20 can be supported later)
  - `price: number` (0 for FREE; units in asset, not wei)
  - `maxNumberOfKeys: number`
  - `chain_id: number` (must be allowlisted)
  - `maxKeysPerAddress?: number`
  - `transferable?: boolean`
  - `requiresApproval?: boolean`
  - `gasless_opt_out?: boolean` (if true, return a response instructing client to use local wallet path)
- Response (200 JSON):
  - `ok: boolean`
  - `lock_address?: string`
  - `tx_hash?: string`
  - `error?: string`
  - `limits?: { remaining_today: number }`
- Behavior:
  - If `gasless_opt_out` is true, do not deploy; respond with `ok: false, error: 'gasless_opt_out'` so UI can switch to client-side deploy.
  - Enforce chain allowlist and per-user daily limit.
  - Resolve RPC from `network_configs`.
  - Compute ERC20 price with decimals (if USDC) or native (if FREE, 0; if ETH, reject sponsorship with actionable error).
  - Call `createUpgradeableLockAtVersion` and wait for confirmation.
  - Add service wallet as lock manager if not already.
  - Log to `gas_transactions` and `gasless_activity_log`.

### UI Flow

- Create Event → “Publish to blockchain”
  - Default: gasless (server deploy). Show “Sponsored by TeeRex”.
  - Toggle to opt out → revert to existing client `deployLock` path (user pays gas).
  - On success: show tx hash and lock address; proceed to save event as today.
  - On limit exceeded: prompt to continue with classic (user-pays-gas) deployment.

## Phase 2: Gasless Ticket Purchase (Free + USDC)

- Free events (currency FREE): platform calls `purchase` with `value=0` or uses a free issuance path as supported by Unlock (no payment, platform pays gas). User signs nothing. Rate-limited 20/day.
- USDC-priced events: revenue must be on-chain via `purchase` (not `grantKeys`).
  - Flow uses an off-chain user signature (USDC authorization) to move USDC on-chain, then the platform calls `purchase` and pays gas.
  - Token support: USDC on Base supports EIP-3009 `transferWithAuthorization` (or EIP-2612/Permit2; choose best per chain/token). We will standardize on EIP-3009 for Base USDC; fallback to Permit2 if needed.

### API Contract (Edge Function: `gasless-purchase-usdc`)

- Auth:
  - Require `X-Privy-Authorization` (attendee identity).
- Request (JSON):
  - `event_id: string`
  - `lock_address: string`
  - `chain_id: number` (must be allowlisted and match event)
  - `recipient: string` (address that receives the key)
  - `ticket_price: string` (decimal as displayed; backend re-derives on-chain expected value)
  - `user_address: string` (EOA that holds USDC)
  - `authorization`: object containing the user’s off-chain signature authorization for USDC transfer:
    - For EIP-3009: `{ from, to, value, validAfter, validBefore, nonce, v, r, s }`
    - or Permit2 form (if used): `{ permitted: { token, amount }, spender, nonce, deadline, signature }`
  - `consent: boolean` (user consented to server-initiated USDC transfer)
- Response (200 JSON):
  - `ok: boolean`
  - `purchase_tx_hash?: string`
  - `transfer_tx_hash?: string` (USDC authorization transfer)
  - `error?: string`
  - `limits?: { remaining_today: number }`
- Behavior:
  - Validate event, currency (FREE or USDC), chain, lock address; confirm price on-chain via `keyPrice()` or price oracle if ERC20 decimals differ.
  - Enforce per-user daily purchase limit and chain allowlist.
  - If FREE: call `purchase` with `value=0` and sponsor gas.
  - If USDC:
    1) Submit USDC `transferWithAuthorization` (user → service wallet) using provided signature; wait for success.
    2) Approve lock or directly pay from the service wallet by calling `purchase` with ERC20 path (service wallet is `msg.sender` paying tokens acquired from user), minting to `recipient`.
  - Record `gas_transactions` for each tx and upsert attendee contact (email, if provided separately), and ticket issuance (`tickets`).
  - On failure at any step, surface helpful errors and leave idempotency markers to avoid double-pulls.

### Email Capture (Crypto + Fiat)

- Fiat: CONFIRMED persisted today. The client pre-creates a record via `init-paystack-transaction`, which inserts `user_email` into `paystack_transactions` before checkout (see supabase/functions/init-paystack-transaction/index.ts:45 and src/components/events/PaystackPaymentDialog.tsx:95–113). Webhook later updates the same row.
- Crypto: add a lightweight attendee contact capture prior to purchase:
  - UI shows an email field (prefilled from DB if we’ve seen this user before for the event) with edit option.
  - Persist email on first attempt (or success) in a dedicated table (see DDL below) so future purchases can prefill.

## Data Model Changes

- New: `attendee_contacts`
  - `id UUID PK`
  - `event_id UUID NOT NULL`
  - `wallet_address TEXT NOT NULL`
  - `email TEXT NOT NULL`
  - `source TEXT NOT NULL CHECK (source IN ('crypto','fiat'))`
  - `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`
  - Unique: `(event_id, wallet_address)`
  - Indexes: `event_id`, `wallet_address`
  - Purpose: allow attendee export, reminders, and invoices.

- New: `gasless_activity_log`
  - `id UUID PK`
  - `user_id TEXT NOT NULL` (Privy `sub`)
  - `activity TEXT NOT NULL CHECK (activity IN ('lock_deploy','ticket_purchase'))`
  - `event_id UUID NULL`
  - `chain_id BIGINT NOT NULL`
  - `metadata JSONB NULL`
  - `created_at TIMESTAMPTZ DEFAULT now()`
  - Indexes: `(user_id, created_at DESC)`, `(user_id, activity, created_at DESC)` for daily limit checks.

- Reuse existing:
  - `network_configs` for RPC and chain metadata; combine with `gasless_chains` for enable flags where present.
  - `gas_transactions` to record gas spend per sponsored tx.
  - `tickets` to record issued tickets (owner_wallet, event_id, grant/purchase tx hash, token_id if available).

## Admin Configuration

- Extend existing Admin Gasless view to manage:
  - Feature toggles: enable gasless for `lock_deploy`, `ticket_purchase_free`, `ticket_purchase_usdc`.
  - Daily limits per user: `events_per_day=15`, `tickets_per_day=20` (editable).
  - Chain allowlist: enable/disable by `chain_id` (Base Mainnet, Base Sepolia pre-enabled).
  - Budget/alerts: optional caps and notifications (leverage existing gasless tables where feasible).

### Concrete DDL (Migrations Plan)

File: `supabase/migrations/20251111090000_add_attendee_contacts_and_gasless_log.sql`

```sql
-- Attendee contacts for crypto + fiat (fiat can be mirrored later if desired)
CREATE TABLE IF NOT EXISTS public.attendee_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  email TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('crypto','fiat')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_attendee_contacts_event ON public.attendee_contacts(event_id);
CREATE INDEX IF NOT EXISTS idx_attendee_contacts_wallet ON public.attendee_contacts(wallet_address);

ALTER TABLE public.attendee_contacts ENABLE ROW LEVEL SECURITY;

-- Minimal policies (client reads through Edge Functions by default)
CREATE POLICY "System can insert attendee contacts"
  ON public.attendee_contacts FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update attendee contacts"
  ON public.attendee_contacts FOR UPDATE USING (true);
CREATE POLICY "System can select attendee contacts"
  ON public.attendee_contacts FOR SELECT USING (true);

CREATE TRIGGER update_attendee_contacts_updated_at
BEFORE UPDATE ON public.attendee_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Gasless activity log for rate limits (simple append-only)
CREATE TABLE IF NOT EXISTS public.gasless_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- Privy sub
  activity TEXT NOT NULL CHECK (activity IN ('lock_deploy','ticket_purchase')),
  event_id UUID NULL REFERENCES public.events(id) ON DELETE SET NULL,
  chain_id BIGINT NOT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gasless_activity_user ON public.gasless_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gasless_activity_kind ON public.gasless_activity_log(user_id, activity, created_at DESC);

ALTER TABLE public.gasless_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System can manage gasless activity log"
  ON public.gasless_activity_log FOR ALL USING (true);

-- Helper function for per-user/day checks
CREATE OR REPLACE FUNCTION public.check_gasless_limit(
  p_user_id TEXT,
  p_activity TEXT,
  p_daily_limit INT
) RETURNS TABLE(allowed BOOLEAN, remaining INT) LANGUAGE plpgsql AS $$
DECLARE
  used INT;
BEGIN
  SELECT COUNT(*) INTO used
  FROM public.gasless_activity_log
  WHERE user_id = p_user_id
    AND activity = p_activity
    AND created_at >= (now() AT TIME ZONE 'UTC')::date; -- since midnight UTC

  IF used < p_daily_limit THEN
    RETURN QUERY SELECT TRUE, (p_daily_limit - used);
  ELSE
    RETURN QUERY SELECT FALSE, 0;
  END IF;
END; $$;
```

## Security and Abuse Controls

- Auth: All endpoints require Privy access token. Service role key only from server contexts.
- Limits: Enforce per-user/day quotas server-side with clear fallback to classic flow.
- Chain guardrails: Only allow active chains from configuration; verify event.chain_id.
- Event validation: Ensure `lock_address` belongs to `event_id` and currency is FREE or USDC for sponsorship.
- USDC authorization (USDC on Base):
  - Prefer EIP-3009 `transferWithAuthorization` (domain = token contract, chain_id; short validity window, unique nonce stored to prevent replay).
  - Fallback: Permit2 if required; same replay and deadline protections.
  - Require explicit `consent: true` in request and show UI disclaimer.
- Idempotency: Include an idempotency key (e.g., `reference`/`statusToken`) per attempt to avoid double-execution.
- Observability: Log tx hashes, user IDs, costs; alert on spikes or budget overruns.

### Limit Checks (Edge Functions)

```ts
// snippet used in both deploy-lock and gasless-purchase-usdc
const DAILY_LIMITS = { deploy: 15, tickets: 20 };
const { data: limitRes } = await supabase
  .rpc('check_gasless_limit', { p_user_id: privyUserId, p_activity: kind, p_daily_limit: limit })
  .single();
if (!limitRes?.allowed) {
  return json({ ok: false, error: 'limit_exceeded', limits: { remaining_today: 0 } }, 200);
}
// record usage after successful tx
await supabase.from('gasless_activity_log').insert({ user_id: privyUserId, activity: kind, event_id, chain_id, metadata });
```

## UX Details

- Creators:
  - Default gasless deploy; toggle to opt out.
  - When over limit, offer “Deploy with my wallet (pay gas)”.
  - Surface chain (Base) context and tx explorer link after success.

- Attendees (Free):
  - Single click confirm; show progress and explorer link when minted.

- Attendees (USDC):
  - Show email field (prefilled if known) → consent checkbox → continue.
  - If limit reached or user opts out, show classic purchase flow (wallet pays gas and performs ERC20 approve + purchase from user’s wallet).

### Frontend Code Snippets and File Paths

- Event creation (creator toggle + server deploy)
  - File: `src/pages/CreateEvent.tsx`
  - Snippet (simplified):
  ```ts
  // New toggle state
  const [sponsorGas, setSponsorGas] = useState(true);

  // On publish
  if (sponsorGas) {
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const accessToken = await getAccessToken();
    const { data, error } = await supabase.functions.invoke('deploy-lock', {
      body: {
        name: formData.title,
        expirationDuration: formData.expirationDuration,
        currency: formData.currency,
        price: formData.price,
        maxNumberOfKeys: formData.capacity,
        chain_id: (formData as any).chainId,
      },
      headers: { Authorization: `Bearer ${anonKey}`, 'X-Privy-Authorization': `Bearer ${accessToken}` },
    });
    if (error || data?.error) { /* fallback to client deploy */ }
    else { /* use data.lock_address, data.tx_hash then savePublishedEvent(...) */ }
  } else {
    // existing client-side deployLock(...)
  }
  ```

- Crypto purchase (email capture + gasless USDC)
  - File: `src/components/events/EventPurchaseDialog.tsx`
  - Snippet: capture email and prefill from DB
  ```ts
  // Fetch prefill
  useEffect(() => {
    const loadEmail = async () => {
      if (!event || !wallet?.address) return;
      const { data } = await supabase
        .from('attendee_contacts')
        .select('email')
        .eq('event_id', event.id)
        .eq('wallet_address', wallet.address.toLowerCase())
        .maybeSingle();
      if (data?.email) setEmail(data.email);
    };
    loadEmail();
  }, [event?.id, wallet?.address]);
  ```
  - Snippet: build EIP-3009 typed data and sign
  ```ts
  // Resolve USDC address from network_configs
  const { data: net } = await supabase
    .from('network_configs')
    .select('usdc_token_address')
    .eq('chain_id', event.chain_id)
    .maybeSingle();
  const token = net?.usdc_token_address!;

  const domain = { name: 'USD Coin', version: '2', chainId: event.chain_id, verifyingContract: token } as const;
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  } as const;
  const now = Math.floor(Date.now() / 1000);
  const value = {
    from: wallet.address,
    to: serviceWalletAddress, // provided by an API or config
    value: amountWei, // computed using on-chain decimals
    validAfter: 0,
    validBefore: now + 5 * 60,
    nonce: crypto.randomUUID().replace(/-/g, '').padStart(64, '0') as `0x${string}`,
  } as const;
  const provider = await wallet.getEthereumProvider();
  const signer = await new ethers.BrowserProvider(provider).getSigner();
  const sig = await (signer as any).signTypedData(domain, types, value);
  ```
  - Snippet: invoke Edge Function
  ```ts
  const { data, error } = await supabase.functions.invoke('gasless-purchase-usdc', {
    body: {
      event_id: event.id,
      lock_address: event.lock_address,
      chain_id: event.chain_id,
      recipient: wallet.address,
      ticket_price: event.price,
      user_address: wallet.address,
      authorization: { ...value, ...ethers.Signature.from(sig) },
      consent: true,
      email, // send to store in attendee_contacts
    },
  });
  ```

## Acceptance Criteria

- Phase 1
  - A creator with 0 native tokens can deploy an event lock on Base (Mainnet/Sepolia) successfully.
  - Lock creator is set to user’s address; service wallet is added as lock manager.
  - Daily limit (15) enforced; fallback to classic deploy works.
  - Admin can disable/enable chain/feature and change limits.

- Phase 2
  - Free tickets: issued on-chain via sponsored `purchase` (no value) within daily limit (20).
  - USDC tickets: user consents and signs; platform pulls USDC on-chain and completes `purchase`; key minted to recipient; all on-chain.
  - If user declines or hits limit, they can complete purchase via classic (user-pays-gas) flow.
  - Crypto flow captures and persists attendee email; future purchases prefill from DB.

## Rollout Plan

- Feature flags per function (`deploy-lock`, `gasless-purchase-usdc`) and per chain.
- Start with Base Sepolia (internal/staging), then Base Mainnet.
- Monitor gas spend and success/error rates; adjust limits from Admin.

## Risks and Mitigations

- Token support variance: USDC may differ across chains; standardize on Base USDC EIP-3009 and add detection + fallback.
- Replay/sig misuse: Store nonces and enforce short deadlines; strict domain checks.
- Budget overrun: Enforce daily per-user limits; optionally add per-event and global caps.
- User confusion: Clear copy on consent and fallbacks; explicit “Sponsored by TeeRex” badges.

## Implementation Notes (for engineering reference)

- Chain config:
  - Reuse `network_configs` for RPC and USDC token address; use `is_active`/allowlist or `gasless_chains.enabled` to guard functions.
- Contracts:
  - PublicLock v14/v15 purchase behavior means `msg.sender` is payer; for USDC, platform first acquires user’s USDC via authorization transfer, then calls `purchase` as payer.
- Logging:
  - Reuse `gas_transactions` for cost tracking; new `gasless_activity_log` for rate limiting.
- Email storage:
  - `attendee_contacts` table; upsert on attempt or success keyed by (event_id, wallet_address).

---

Appendix A: Example EIP-3009 Payload (USDC on Base)

```
{
  from: <user_address>,
  to: <service_wallet_address>,
  value: <amount in smallest units>,
  validAfter: 0,
  validBefore: <unix_ts + 5 minutes>,
  nonce: <uuid v4>,
  v, r, s
}
```

Appendix B: Classic Fallback Paths

- Deploy: use existing client-side `deployLock` (wallet pays gas).
- Purchase: use existing ERC20 approve + `purchase` flow from user wallet.

---

## Modular Architecture & File Layout

This feature will be delivered as small, testable modules. Controllers (components and edge function index files) remain thin and delegate to helpers.

- Frontend modules
  - Components
    - `src/components/events/GaslessDeployToggle.tsx`
    - `src/components/events/GaslessPurchaseUSDC.tsx`
    - `src/components/events/EmailField.tsx`
  - Hooks
    - `src/hooks/gasless/useGaslessDeploy.ts`
    - `src/hooks/gasless/useGaslessPurchaseUSDC.ts`
    - `src/hooks/gasless/useEmailPrefill.ts`
    - `src/hooks/gasless/useLimits.ts`
  - Services
    - `src/services/functions/deployLock.ts`
    - `src/services/functions/purchaseUsdcGasless.ts`
    - `src/services/functions/getServiceWallet.ts`
  - Utilities
    - `src/utils/typedData/eip3009.ts` (domain/types/value + sign helper)
    - `src/utils/contracts/unlock.ts` (RO helpers)
    - `src/utils/network.ts` (resolve rpc/usdc)
    - `src/utils/amounts.ts` (parse/format)

- Edge Functions
  - Controllers
    - `supabase/functions/deploy-lock/index.ts`
    - `supabase/functions/gasless-purchase-usdc/index.ts`
  - Shared modules
    - `supabase/functions/_shared/auth.ts` → `verifyPrivyJwt`
    - `supabase/functions/_shared/networks.ts` → `getRpcAndUsdc(chainId)`
    - `supabase/functions/_shared/limits.ts` → `checkAndConsume(userId, activity, daily)`
    - `supabase/functions/_shared/unlock.ts` → `deployLock`, `getKeyPrice`
    - `supabase/functions/_shared/tokens.ts` → `transferWithAuthorization`, `ensureApprove`
    - `supabase/functions/_shared/contacts.ts` → `upsertAttendeeContact`
    - `supabase/functions/_shared/json.ts` → `json()` helper

- Admin
  - `src/pages/admin/gasless/AdminGaslessConfig.tsx` with `ChainsConfig.tsx`, `LimitsConfig.tsx`, `FeaturesToggles.tsx`, `ActivityLogTable.tsx`
  - `src/services/admin/gaslessConfig.ts`

Typed‑data helper (frontend): `src/utils/typedData/eip3009.ts`

```ts
export const buildEip3009Domain = (chainId: number, token: string) => ({
  name: 'USD Coin', version: '2', chainId, verifyingContract: token,
} as const);

export const TransferWithAuthorizationTypes = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export const buildTransferWithAuthValue = (p: { from: string; to: string; value: bigint; validBefore: number; nonce: `0x${string}` }) => ({
  from: p.from, to: p.to, value: p.value, validAfter: 0, validBefore: p.validBefore, nonce: p.nonce,
} as const);

export async function signTransferWithAuthorization(signer: any, domain: ReturnType<typeof buildEip3009Domain>, value: ReturnType<typeof buildTransferWithAuthValue>) {
  try { return await signer.signTypedData(domain, TransferWithAuthorizationTypes, value); }
  catch { return await signer._signTypedData(domain, TransferWithAuthorizationTypes, value); }
}
```

File tree (excerpt)

```
src/
├─ components/events/{GaslessDeployToggle,GaslessPurchaseUSDC,EmailField}.tsx
├─ hooks/gasless/{useGaslessDeploy,useGaslessPurchaseUSDC,useEmailPrefill,useLimits}.ts
├─ services/functions/{deployLock,purchaseUsdcGasless,getServiceWallet}.ts
├─ utils/typedData/eip3009.ts
└─ utils/{contracts/unlock,network,amounts}.ts

supabase/functions/
├─ deploy-lock/index.ts
├─ gasless-purchase-usdc/index.ts
└─ _shared/{auth,networks,limits,tokens,unlock,contacts,json}.ts
```

## Edge Function Code Sketches (follow existing patterns)

These are illustrative and match our Deno + ethers + supabase-js setup. They reuse Privy JWT verification like `paystack-grant-keys`/`eas-gasless-attestation`.

### File: `supabase/functions/deploy-lock/index.ts`

```ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { Contract, Wallet, JsonRpcProvider, ethers } from 'https://esm.sh/ethers@6.14.4';
import { createRemoteJWKSet, jwtVerify, importSPKI } from 'https://deno.land/x/jose@v4.14.4/index.ts';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PRIVY_APP_ID = Deno.env.get('VITE_PRIVY_APP_ID')!;
const PRIVY_VERIFICATION_KEY = Deno.env.get('PRIVY_VERIFICATION_KEY');
const SERVICE_PK = Deno.env.get('UNLOCK_SERVICE_PRIVATE_KEY')!;

const UnlockABI = [ /* createUpgradeableLockAtVersion(...) */ ];
const PublicLockABI = [ /* addLockManager, etc. */ ];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildPreflightHeaders(req) });
  try {
    // Auth (Privy)
    const privyAuth = req.headers.get('X-Privy-Authorization');
    if (!privyAuth?.startsWith('Bearer ')) return new Response(JSON.stringify({ ok:false, error:'unauthorized' }), { headers:{...corsHeaders,'Content-Type':'application/json'}, status:401 });
    const accessToken = privyAuth.split(' ')[1];
    let privyUserId: string | undefined;
    try {
      const JWKS = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`));
      const { payload } = await jwtVerify(accessToken, JWKS, { issuer:'privy.io', audience:PRIVY_APP_ID });
      privyUserId = (payload as any).sub;
    } catch (_) {
      if (!PRIVY_VERIFICATION_KEY) throw _;
      const key = await importSPKI(PRIVY_VERIFICATION_KEY, 'ES256');
      const { payload } = await jwtVerify(accessToken, key, { issuer:'privy.io', audience:PRIVY_APP_ID });
      privyUserId = (payload as any).sub;
    }

    const body = await req.json();
    const { name, expirationDuration, currency, price, maxNumberOfKeys, chain_id } = body;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // Chain allowlist and limits
    const { data: limit } = await supabase.rpc('check_gasless_limit', { p_user_id: privyUserId, p_activity: 'lock_deploy', p_daily_limit: 15 }).single();
    if (!limit?.allowed) return new Response(JSON.stringify({ ok:false, error:'limit_exceeded', limits:{ remaining_today: 0 }}), { headers:{...corsHeaders,'Content-Type':'application/json'}, status:200 });

    const { data: net } = await supabase.from('network_configs').select('rpc_url').eq('chain_id', chain_id).maybeSingle();
    if (!net?.rpc_url) throw new Error('RPC not configured');

    const provider = new JsonRpcProvider(net.rpc_url);
    const signer = new Wallet(SERVICE_PK, provider);

    // Build calldata and deploy (same as lockUtils.ts path but from server)
    // ... encode initialize(...)
    // const tx = await unlock.createUpgradeableLockAtVersion(calldata, 14);
    // const receipt = await tx.wait();
    // const lockAddress = parseFromReceipt(...);

    // Add service wallet as lock manager if needed
    // const lock = new Contract(lockAddress, PublicLockABI, signer);
    // await (await lock.addLockManager(await signer.getAddress())).wait();

    // Log usage
    await supabase.from('gasless_activity_log').insert({ user_id: privyUserId, activity: 'lock_deploy', event_id: null, chain_id, metadata: { name } });

    return new Response(JSON.stringify({ ok:true, lock_address: '0x...', tx_hash: '0x...' }), { headers:{...corsHeaders,'Content-Type':'application/json'}, status:200 });
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'Internal error' }), { headers:{...corsHeaders,'Content-Type':'application/json'}, status:200 });
  }
});
```

### File: `supabase/functions/gasless-purchase-usdc/index.ts`

```ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { Contract, Wallet, JsonRpcProvider, ethers } from 'https://esm.sh/ethers@6.14.4';
import { createRemoteJWKSet, jwtVerify, importSPKI } from 'https://deno.land/x/jose@v4.14.4/index.ts';
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PRIVY_APP_ID = Deno.env.get('VITE_PRIVY_APP_ID')!;
const PRIVY_VERIFICATION_KEY = Deno.env.get('PRIVY_VERIFICATION_KEY');
const SERVICE_PK = Deno.env.get('UNLOCK_SERVICE_PRIVATE_KEY')!;

const ERC20_ABI = [
  { inputs: [ { name:'from', type:'address' }, { name:'to', type:'address' }, { name:'value', type:'uint256' }, { name:'validAfter', type:'uint256' }, { name:'validBefore', type:'uint256' }, { name:'nonce', type:'bytes32' }, { name:'v', type:'uint8' }, { name:'r', type:'bytes32' }, { name:'s', type:'bytes32' } ], name: 'transferWithAuthorization', outputs: [ { name:'', type:'bool' } ], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [ { name:'spender', type:'address' }, { name:'value', type:'uint256' } ], name: 'approve', outputs: [ { name:'', type:'bool' } ], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [ { name:'', type:'uint8' } ], stateMutability: 'view', type: 'function' },
];
const PublicLockABI = [ /* purchase(...) */ ];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildPreflightHeaders(req) });
  try {
    const privyAuth = req.headers.get('X-Privy-Authorization');
    if (!privyAuth?.startsWith('Bearer ')) return new Response(JSON.stringify({ ok:false, error:'unauthorized' }), { headers:{...corsHeaders,'Content-Type':'application/json'}, status:401 });
    const accessToken = privyAuth.split(' ')[1];
    let privyUserId: string | undefined;
    try {
      const JWKS = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`));
      const { payload } = await jwtVerify(accessToken, JWKS, { issuer:'privy.io', audience:PRIVY_APP_ID });
      privyUserId = (payload as any).sub;
    } catch (_) {
      if (!PRIVY_VERIFICATION_KEY) throw _;
      const key = await importSPKI(PRIVY_VERIFICATION_KEY, 'ES256');
      const { payload } = await jwtVerify(accessToken, key, { issuer:'privy.io', audience:PRIVY_APP_ID });
      privyUserId = (payload as any).sub;
    }

    const body = await req.json();
    const { event_id, lock_address, chain_id, recipient, ticket_price, user_address, authorization, email } = body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Limits
    const { data: limit } = await supabase.rpc('check_gasless_limit', { p_user_id: privyUserId, p_activity: 'ticket_purchase', p_daily_limit: 20 }).single();
    if (!limit?.allowed) return new Response(JSON.stringify({ ok:false, error:'limit_exceeded', limits:{ remaining_today: 0 }}), { headers:{...corsHeaders,'Content-Type':'application/json'}, status:200 });

    // Chain + token config
    const { data: net } = await supabase.from('network_configs').select('rpc_url, usdc_token_address').eq('chain_id', chain_id).maybeSingle();
    if (!net?.rpc_url || !net?.usdc_token_address) throw new Error('Chain or USDC not configured');

    const provider = new JsonRpcProvider(net.rpc_url);
    const signer = new Wallet(SERVICE_PK, provider);
    const token = new Contract(net.usdc_token_address, ERC20_ABI, signer);
    const lock = new Contract(lock_address, PublicLockABI, signer);

    // If FREE: call purchase with value 0
    // else USDC: submit transferWithAuthorization (from user->service), approve lock, call purchase
    // On success: insert attendee_contacts upsert and gasless_activity_log, and tickets row if needed.

    return new Response(JSON.stringify({ ok:true, purchase_tx_hash: '0x...' }), { headers:{...corsHeaders,'Content-Type':'application/json'}, status:200 });
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || 'Internal error' }), { headers:{...corsHeaders,'Content-Type':'application/json'}, status:200 });
  }
});
```

Notes:
- Both functions mirror `paystack-grant-keys`/`eas-gasless-attestation` patterns for JWT verification, RPC lookups, and error responses.
- Exact ABI fragments and receipt parsing will follow `src/utils/lockUtils.ts` conventions.

---

## Phase 3 (Future Work) — Brief Overview

Objective: Sponsor gas for ETH-priced tickets and external wallets using industry-standard Account Abstraction (ERC-4337) and paymasters.

- Embedded wallets: integrate provider-supported smart wallets (e.g., Privy smart wallets or Biconomy/Alchemy) and sponsor user operations via a paymaster.
- External wallets: optional smart account (Safe/Kernel) owned by the EOA; mint tickets to the smart account address.
- Providers to evaluate: Biconomy (smart accounts + paymaster), Alchemy Gas Manager, Pimlico/Stackup bundlers.
- Gating: update ticket checks to consider smart account addresses.
- Rollout: behind per-chain feature flags; start on Base Sepolia → Base Mainnet.
