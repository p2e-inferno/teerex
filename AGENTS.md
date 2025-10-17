# Agents Guide for Teerex

This repo uses Supabase Edge Functions for Paystack → Unlock ticket issuance.
Follow these notes when updating or deploying.

## Edge Functions

Functions used by the ticketing flow:
- `paystack-webhook`
  - Verifies Paystack payload, resolves `lock_address` / `chain_id`, and grants key via Unlock.
  - Writes back to `paystack_transactions` with `status: 'success'`, `gateway_response.key_granted = true`, and `key_grant_tx_hash` if available.
  - Handles “already has key” as success and still writes back the success status.
- `get-transaction-status`
  - Service-side status reader to avoid RLS issues from the browser.
  - Returns `{ found, status, gateway_response }` for a given `reference`.

Both are deployed to project `project_id` from `supabase/config.toml`.

## Deploying Functions

Prerequisites:
- Supabase CLI installed (≥ 2.51.0)
- Access token already configured (`supabase login`) or environment variable set.
- Project is linked once per machine.

Link (one time):
- `supabase link --project-ref nclavsvzjzegqvkjezyz`

Deploy (after any function change):
- `supabase functions deploy paystack-webhook`
- `supabase functions deploy get-transaction-status`

Notes:
- The CLI reads `project_id` from `supabase/config.toml`.
- Secrets are stored in the project, not in the repo.

## Required Secrets (set in Supabase)

Set these in the Supabase dashboard → Functions → Secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UNLOCK_SERVICE_PRIVATE_KEY`
- Optionally `RPC_URL` if not using `network_configs` or chain fallbacks
- Privy secrets if required by other functions

## RLS and Client Polling

The browser does not read `paystack_transactions` directly (Privy auth lacks Supabase JWT claims). Instead the UI calls `get-transaction-status` (Edge Function) which reads with the service role and returns a minimal, safe payload.

## Local Changes That Require Deploy

Any file under `supabase/functions/**` requires redeploy of the corresponding function. Redeploy both functions after changes to ensure the issuing flow works end-to-end.

