# TeeRex – Paystack Issuance Realtime + Cleanup TODO

This document captures two small, high‑impact improvements:

1) Add Supabase Realtime Broadcast for instant ticket‑issuance feedback (keep current polling as fallback).
2) Remove leftover/unused code from the Paystack UI that can confuse maintenance and UX.

Principles: security first, minimal changes, DRY, modular, avoid fragmentation.

---

## 1) Realtime Broadcast for Issuance Status

Goal: Push a single realtime event from the webhook when issuance completes (or user already has a key), so the client can resolve instantly without polling. Keep the existing service‑side polling as a safety net.

### Overview

- Client generates a high‑entropy `statusToken` per Paystack attempt and subscribes to a one‑time Realtime channel: `txn:{reference}:{statusToken}`.
- Paystack webhook (Edge Function) broadcasts `{ status: 'success', key_granted: true, txHash }` to that channel on success (including "already has key").
- Client resolves immediately on broadcast; if none arrives (network hiccup, etc.), fallback polling continues and eventually resolves.

Security: Use a long, random `statusToken` (e.g., `crypto.randomUUID()`) to prevent guessing. Do not put PII into the broadcast payload; only send status and minimal metadata.

### Files to Change/Create

- `src/components/events/PaystackPaymentDialog.tsx`
- `src/components/events/TicketProcessingDialog.tsx`
- `supabase/functions/paystack-webhook/index.ts`

No new dependencies. Uses existing `@supabase/supabase-js` client in both browser and Edge Functions.

### Client: Generate token + subscribe

In `PaystackPaymentDialog.tsx` before `initializePayment(...)`:

```ts
// 1) Generate a one‑time status token
const statusToken = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

// 2) Include it in Paystack metadata so the webhook can read it
const config = {
  // ...existing fields
  metadata: {
    // keep existing fields
    status_token: statusToken,
    custom_fields: [
      // ...existing custom fields
      { display_name: 'Status Token', variable_name: 'status_token', value: statusToken },
    ],
  },
};

// 3) Pass token to the issuing step
onSuccess({
  reference: reference.reference,
  email: userEmail,
  walletAddress: userWalletAddress,
  phone: userPhone,
  eventId: event.id,
  amount: event.ngn_price,
  statusToken, // NEW
});
```

In `TicketProcessingDialog.tsx` subscribe on open (and keep the polling fallback):

```ts
const channelName = `txn:${paymentData.reference}:${paymentData.statusToken}`;
const channel = supabase.channel(channelName, { config: { broadcast: { ack: true } } });

channel.on('broadcast', { event: 'status' }, (payload) => {
  const { status, key_granted, txHash } = payload;
  if (status === 'success' && key_granted) {
    setTransactionHash(txHash || null);
    setStatus('success');
    setIsLoading(false);
    channel.unsubscribe();
  }
});

await channel.subscribe(async (status) => {
  if (status !== 'SUBSCRIBED') return;
  // Keep existing service‑side polling as fallback
  startPollingFallback();
});
```

Tip: Stop polling when a valid broadcast is received to avoid double updates.

### Webhook: Broadcast on success

In `supabase/functions/paystack-webhook/index.ts` after determining success (either granted or already has key):

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

// after status is finalized
const statusToken = (md as any)?.status_token
  ?? ((Array.isArray((md as any)?.custom_fields)
    ? (md as any).custom_fields.find((f: any) => f?.variable_name === 'status_token')?.value
    : undefined));

if (statusToken) {
  const realtime = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const channelName = `txn:${reference}:${statusToken}`;
  const channel = realtime.channel(channelName);
  // Subscribe then send a single broadcast
  await new Promise<void>((resolve) => {
    channel.subscribe(async (st) => {
      if (st === 'SUBSCRIBED') {
        await channel.send({
          type: 'broadcast',
          event: 'status',
          payload: { status: 'success', key_granted: true, txHash: grantTxHash },
        });
        // Allow a tick for frames to flush, then unsubscribe
        setTimeout(async () => { await channel.unsubscribe(); resolve(); }, 250);
      }
    });
  });
}
```

Notes:
- Keep the DB update writes (status: `success`, `gateway_response.key_granted`), so the existing polling fallback remains reliable.
- The `statusToken` does not have to be stored in a new column; using Paystack metadata is sufficient.

### Advantages

- Instant UX (no waiting for polling) with minimal code.
- Avoids RLS complexity entirely (broadcast channels are not RLS‑guarded).
- Keeps the service‑side polling fallback for resilience.
- No schema migrations required.

---

## 2) Remove Unused / Confusing Code

Target: small removals to simplify and harden the Paystack flow.

### A) DOM z‑index hack in PaystackPaymentDialog

File: `src/components/events/PaystackPaymentDialog.tsx`

Remove the legacy dialog‑hiding hack which is no longer needed and can create strange states:

```ts
// DELETE this block
const dialogElement = document.querySelector('[role="none"]');
if (dialogElement) {
  (dialogElement as HTMLElement).style.display = 'none';
}
```

Rationale: we now cleanly close/hide the base dialog while the Paystack overlay is open.

### B) Garbled debug logs / currency glyphs

Files: `src/components/events/PaystackPaymentDialog.tsx`, `src/components/events/TicketProcessingDialog.tsx`

- Remove noisy debug logs with garbled prefixes like `dY"?` / `�?3` / `�?O`.
- Normalize currency display to `₦` consistently.

### C) Client writes to `paystack_transactions`

File: `src/components/events/PaystackPaymentDialog.tsx`

- We currently pre‑create a pending transaction via `ensureTransactionRecord()` to improve webhook reliability under RLS.
- Once the webhook upsert path is proven stable in production, consider removing `ensureTransactionRecord()` entirely and rely on the webhook to upsert. This reduces client–DB coupling.

### D) Legacy client insert in TicketProcessingDialog

File: `src/components/events/TicketProcessingDialog.tsx`

- Ensure there is no code path that inserts/upserts into `paystack_transactions` from the client.
- Current version relies on server (webhook) writes and the service‑side status function for polling.

---

## Rollout Plan

1) Implement Broadcast (client + webhook) and keep existing service‑side polling.
2) Test across: new wallet, repeat buyer (already has key), slow webhook, and network hiccups.
3) After a burn‑in period, optionally remove the client pre‑insert (`ensureTransactionRecord()`), keeping webhook upsert as the single writer.

This yields a clean, low‑latency, secure flow with minimal moving parts and a robust fallback.

