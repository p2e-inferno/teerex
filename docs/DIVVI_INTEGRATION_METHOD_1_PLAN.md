# Divvi Integration (Method 1) — Implementation Plan

## Goal
Integrate Divvi attribution into **all state-changing blockchain transactions** initiated by the **browser wallet** by:
1) appending a Divvi referral tag to calldata for each write tx (Divvi recommends appending to the end), and
2) calling `submitReferral({ txHash, chainId })` after confirmation.

This plan is optimized for this repo’s stack (Vite + React + Privy + ethers v6).

## Background / Constraints
- Client transactions are sent via a **Privy EIP-1193 provider** (from `wallet.getEthereumProvider()`), usually wrapped by `ethers.BrowserProvider`.
- Divvi requires:
  - `data = originalCalldata + referralTag`, and
  - a **post-confirmation** call to `submitReferral({ txHash, chainId })`.
- Supabase Edge Functions sign with a service wallet and broadcast transactions directly; **Method 1 (provider interception)** covers **browser wallet writes**. Server-side writes need explicit tagging.

## Scope (write paths to cover)

### Browser wallet writes (covered by provider interception)
These calls route through `wallet.getEthereumProvider()` today and will be covered once the provider is wrapped:
- Unlock: lock deploy, purchase, addLockManager, updateTransferFee, setMaxKeysPerAddress, setLockMetadata
- ERC20 approvals (USDC): `approve()`
- EAS SDK: attest, attestByDelegation, revoke
- TeeRex contract writes in `src/hooks/useBatchAttestation.ts`

### Supabase Edge Function writes (not covered by provider interception)
These do not use the browser wallet provider and must be handled explicitly:
- `supabase/functions/gasless-deploy-lock/*` (deploy lock, add manager, updateTransferFee, setLockMetadata, setOwner)
- `supabase/functions/gasless-purchase/*` (purchase)
- `supabase/functions/paystack-webhook/*`, `paystack-grant-keys/*`, `grant-keys-service/*` (grantKeys)
- `supabase/functions/attest-by-delegation/*`, `batch-attest-by-delegation/*`, `eas-gasless-attestation/*` (attestation txs)
- `supabase/functions/remove-service-manager/*` (renounceLockManager)

## Directory / File Plan

### New files (frontend)
- `src/lib/divvi/config.ts`
  - Reads `VITE_DIVVI_CONSUMER_ADDRESS` (your Divvi identifier)
  - Exports `DIVVI_CONSUMER_ADDRESS`

- `src/lib/divvi/receipt.ts`
  - Exports `waitForReceipt(provider, txHash, { timeoutMs, pollMs })`
  - Polls `eth_getTransactionReceipt` via EIP-1193

- `src/lib/divvi/eip1193.ts`
  - Exports `wrapEip1193ProviderWithDivvi(provider, opts)`
  - Intercepts `eth_sendTransaction`
  - Appends referral tag safely to calldata
  - Starts background submit flow after tx confirmation

- `src/lib/divvi/index.ts`
  - Barrel exports

- `src/lib/wallet/provider.ts`
  - `getDivviBrowserProvider(wallet): Promise<ethers.BrowserProvider>`
  - Wraps Privy provider once, returns an ethers BrowserProvider

### Modified files (frontend)
Update call sites to use `getDivviBrowserProvider(wallet)` instead of `wallet.getEthereumProvider()`:
- `src/utils/lockUtils.ts`
- `src/utils/attestationUtils.ts`
- `src/utils/schemaUtils.ts`
- `src/components/attestations/DirectEASAttestationButton.tsx`
- `src/hooks/useBatchAttestation.ts`
- Any other occurrences of `wallet.getEthereumProvider()`

### New files (Edge Functions shared)
- `supabase/functions/_shared/divvi.ts`
  - Appends referral tag safely to calldata before signing
  - Best-effort `submitReferral` after confirmation
  - Uses Deno npm imports (`npm:`) as primary; CDN fallback only if needed

### Modified files (Edge Functions)
- `supabase/functions/gasless-deploy-lock/index.ts`
- `supabase/functions/gasless-purchase/index.ts`
- `supabase/functions/paystack-webhook/index.ts`
- `supabase/functions/paystack-grant-keys/index.ts`
- `supabase/functions/grant-keys-service/index.ts`
- `supabase/functions/remove-service-manager/index.ts`
- `supabase/functions/attest-by-delegation/index.ts`
- `supabase/functions/batch-attest-by-delegation/index.ts`
- `supabase/functions/eas-gasless-attestation/index.ts`

## Configuration

### Frontend env
- Add `VITE_DIVVI_CONSUMER_ADDRESS=0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb`

### Supabase secrets
Set in Supabase dashboard → Functions → Secrets:
- `DIVVI_CONSUMER_ADDRESS=0x374355b89D26325c4C4Cd96f99753b82fd64b2Bb`

## Code-Level Design (Frontend)

### 1) Receipt polling
`src/lib/divvi/receipt.ts`

```ts
export async function waitForReceipt(
  provider: { request: (args: { method: string; params?: any[] }) => Promise<any> },
  txHash: string,
  { pollMs = 1500, timeoutMs = 180_000 }: { pollMs?: number; timeoutMs?: number } = {}
) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [txHash] })
    if (receipt) return receipt
    await new Promise((r) => setTimeout(r, pollMs))
  }
  throw new Error('Timed out waiting for tx receipt')
}
```

### 2) Provider wrapper API
`src/lib/divvi/eip1193.ts`

```ts
import { getReferralTag, submitReferral } from '@divvi/referral-sdk'
import { waitForReceipt } from './receipt'

type Eip1193Provider = {
  request: (args: { method: string; params?: any[] }) => Promise<any>
}

type DivviWrapOptions = {
  consumer: `0x${string}`
  getUserAddress: (tx: any) => `0x${string}` | null
  isWriteTx?: (tx: any) => boolean
  onError?: (e: unknown, ctx: { phase: string; txHash?: string }) => void
}

const WRAPPED_PROVIDERS = new WeakMap<Eip1193Provider, Eip1193Provider>()

const strip0x = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex)
const isHex = (hex: unknown) => typeof hex === 'string' && /^0x[0-9a-fA-F]*$/.test(hex)

export function wrapEip1193ProviderWithDivvi(provider: Eip1193Provider, opts: DivviWrapOptions): Eip1193Provider {
  const existing = WRAPPED_PROVIDERS.get(provider)
  if (existing) return existing

  const wrapped: Eip1193Provider = {
    request: async ({ method, params }) => {
      if (method !== 'eth_sendTransaction' || !params?.[0]) {
        return provider.request({ method, params })
      }

      const tx = { ...params[0] }

      // Capture chainId BEFORE sending so we don't misreport if the user switches networks immediately after.
      let chainId: number | null = null
      try {
        const chainIdHex: string = await provider.request({ method: 'eth_chainId' })
        chainId = Number.parseInt(chainIdHex, 16)
      } catch (e) {
        opts.onError?.(e, { phase: 'chainId-pre' })
      }

      const user = opts.getUserAddress(tx)
      const data =
        typeof tx.data === 'string'
          ? tx.data
          : typeof (tx as any).input === 'string'
          ? (tx as any).input
          : undefined

      // Default: tag any contract call with non-empty calldata.
      // Skip contract creation (no `to`) to avoid appending to deployment bytecode.
      const defaultIsWriteTx = (t: any) => Boolean(t?.to)
      const shouldTag = (opts.isWriteTx?.(tx) ?? defaultIsWriteTx(tx)) && !!tx.to && user && isHex(data) && data !== '0x'

      if (shouldTag) {
        const tag = getReferralTag({ user, consumer: opts.consumer })
        if (isHex(tag)) {
          const newData = (data as string) + strip0x(tag)
          ;(tx as any).data = newData
          // Some providers use `input` instead of `data`.
          if ((tx as any).input !== undefined) {
            ;(tx as any).input = newData
          }
        } else {
          opts.onError?.(new Error('Divvi referral tag was not hex'), { phase: 'tag' })
        }
      }

      const txHash: string = await provider.request({ method, params: [tx] })

      // Fire-and-forget submit after confirmation (best effort; do not block UX).
      void (async () => {
        try {
          let effectiveChainId = chainId
          if (!effectiveChainId || !Number.isFinite(effectiveChainId)) {
            try {
              const chainIdHex: string = await provider.request({ method: 'eth_chainId' })
              effectiveChainId = Number.parseInt(chainIdHex, 16)
            } catch (e) {
              opts.onError?.(e, { phase: 'chainId-post', txHash })
              return
            }
          }

          if (!effectiveChainId || !Number.isFinite(effectiveChainId)) return

          await waitForReceipt(provider, txHash)
          await submitReferral({ txHash, chainId: effectiveChainId })
        } catch (e) {
          opts.onError?.(e, { phase: 'submitReferral', txHash })
        }
      })()

      return txHash
    },
  }

  WRAPPED_PROVIDERS.set(provider, wrapped)
  return wrapped
}
```

Notes:
- We append `strip0x(tag)` to avoid `0x...0x...` invalid calldata.
- We read `data ?? input` to be robust across providers and write back to both when present.
- We skip contract creation transactions (no `to`) to avoid breaking deployment bytecode.
- We default to tagging any `eth_sendTransaction` with a `to` address and non-empty hex `data`; `isWriteTx` can further restrict if needed.
- We capture `eth_chainId` before sending, and fallback to another lookup at submit time if the first call fails.
- `WeakMap` ensures a given raw provider is wrapped only once and we never accidentally return an unwrapped provider.

### 3) One helper for the entire app
`src/lib/wallet/provider.ts`

```ts
import { ethers } from 'ethers'
import { wrapEip1193ProviderWithDivvi } from '@/lib/divvi'
import { DIVVI_CONSUMER_ADDRESS } from '@/lib/divvi/config'

export async function getDivviBrowserProvider(wallet: any) {
  const raw = await wallet.getEthereumProvider()
  const wrapped = wrapEip1193ProviderWithDivvi(raw, {
    consumer: DIVVI_CONSUMER_ADDRESS,
    getUserAddress: (tx) => (tx?.from ? String(tx.from).toLowerCase() : null),
    onError: (e, ctx) => console.warn('[divvi]', ctx.phase, ctx.txHash, e),
  })
  return new ethers.BrowserProvider(wrapped)
}
```

Then update call sites to use this helper.

## Attribution Rules
Divvi tag takes a single `user` address.

- **Browser wallet transactions**: use `tx.from` (the user address making the transaction).
- **Server-side (Supabase Edge Functions) transactions**: use the **service wallet address** (the actual transaction sender) as `user`.

## Wagmi/Viem (Optional)
- TeeRex currently uses the Privy + ethers path for client writes.
- If wagmi/viem writes are added in the future, use `sendDivviTransaction` (`src/lib/divvi/viem.ts`) and pass the already-known connected wallet address as `account`.
- Do **not** wrap the wagmi/viem EIP-1193 provider with `wrapEip1193ProviderWithDivvi` if using `sendDivviTransaction` (avoid double-tagging/double-submit).

  - This means gasless/fiat activity will attribute to the service wallet as the “user” in Divvi, but still credits your `consumer` identifier.

## Edge Functions (server-side tx tagging + submit)

### Import strategy (Deno / Supabase Edge)
Prefer Deno native npm imports:

```ts
import { getReferralTag, submitReferral } from 'npm:@divvi/referral-sdk@2.3.0'
```

If this fails in your Edge runtime, fallback (only if necessary):

```ts
import { getReferralTag, submitReferral } from 'https://esm.sh/@divvi/referral-sdk@2.3.0?target=deno'
```

### Approach
Because Edge Functions sign transactions locally, we must append the tag **before signing**:
- Use `populateTransaction` (or ethers v6 `contract.getFunction(name).populateTransaction(...)`) to produce calldata.
- Append Divvi tag to `txReq.data` using `strip0x`.
- Send via `signer.sendTransaction(txReq)`.
- After confirmation, call `submitReferral({ txHash, chainId })` best-effort.

### Attribution for Edge
- `user` passed to `getReferralTag` must be the **service wallet address** (e.g. `await signer.getAddress()`).

## Rollout Plan
1) Add frontend env var + config module.
2) Implement wrapper + receipt polling + wallet provider helper.
3) Update all `wallet.getEthereumProvider()` call sites to use the helper.
4) Smoke test browser flows:
   - Deploy event lock
   - Purchase (ETH)
   - Purchase (USDC approve + purchase)
   - Create/revoke attestation
5) Add Edge helper and wire into server-side tx senders.
6) Deploy changed Edge Functions:
   - `supabase functions deploy gasless-deploy-lock`
   - `supabase functions deploy gasless-purchase`
   - `supabase functions deploy paystack-webhook`
   - plus any other modified functions.

## Testing Plan
- Unit test the provider wrapper (Vitest):
  - `eth_sendTransaction` with `data` appends `strip0x(tag)`
  - no changes for `eth_call`, `personal_sign`, etc.
  - submit flow triggers after mocked receipt appears
- Optional e2e (Synpress): validate outgoing tx `data` includes the appended suffix.

## Open Questions / Decisions
- Decide whether to restrict tagging to a known allowlist of `to` addresses (safer) vs tagging all contract calls.
- Confirm any contracts in your flows that enforce exact calldata length (rare, but would break “append tag” approach).
