
# EAS Integration Guide

Version: 1.0.0
Date: 2025-10-19

This guide documents how the app integrates with the Ethereum Attestation Service (EAS), covering both direct (user-pays) and delegated (service-pays) flows, relevant contracts, edge functions, hooks, SSE streams, and environment configuration.

## Overview

The app supports two attestation modes:

- Direct (user pays gas)
  - User submits on-chain attestations directly to the EAS contract from their wallet.
  - Used today in user-facing flows (e.g., Event Attestations).

- Delegated (service wallet pays gas)
  - User signs EIP‑712 delegated data off-chain. The service wallet executes the on-chain attestation on their behalf using the BatchAttestation contract.
  - Available in Admin UI testers; ready for user-facing integration where gasless UX is desired.

Both paths write a record to Supabase `attestations` and are additive to existing polling models. SSE endpoints provide live status streams for testing and observability.

## Contracts

- EAS Contract Address (Base chains)
  - Base Sepolia and Base Mainnet: `0x4200000000000000000000000000000000000021`

- BatchAttestation.sol (in `contracts/`)
  - Provides delegated APIs for single and batch attestations.
  - Gating: creator lock via `onlyCreators()` for delegated methods:
    - `createAttestationByDelegation(...)`
    - `createBatchAttestationsByDelegation(...)`
  - Ensure the service wallet (or operator) holds a key to `creatorLock` via `setCreatorLock`.

## Data Encoding

- Schemas are stored in `attestation_schemas` and must match fields/types used by the app encoders.
- Direct flow uses `SchemaEncoder` with dynamic field mapping (see `src/utils/attestationUtils.ts`).
- For delegated flow, the client encodes data first, then signs EIP‑712 delegated typed data (see Hooks below).

## Flows

### Direct (User Pays)

- UI: Event Attestation components (e.g., `EventAttestationCard`, `AttestationButton`).
- Code path:
  - `src/utils/attestationUtils.ts#createAttestation`
    - Loads schema, encodes data with EAS SDK, sends transaction via EAS.
    - On success, inserts row into `attestations`.

### Delegated (Service Pays)

- Client (signing):
  - `src/hooks/useDelegatedAttestation.ts` → `signDelegatedAttestation({ schemaUid, recipient, data, deadlineSecondsFromNow, chainId })`
  - Builds EIP‑712 delegated typed data for the EAS domain and returns `{ signature, deadline, attester }`.

- Server (execution):
  - `POST /functions/v1/attest-by-delegation`
    - Verifies Privy JWT from `X-Privy-Authorization`.
    - Verifies EIP‑712 delegated signature via `ethers.verifyTypedData`.
    - Fetches all Privy-linked wallets (shared helper), requires signer ∈ user wallets AND signer == `recipient`.
    - Optional: if `eventId` is provided, verifies the user holds a valid ticket on the event lock (parallel checks across all wallets).
    - Calls `BatchAttestation.createAttestationByDelegation(...)` using the service wallet.
    - Parses `Attested` event logs to extract the UID; inserts attestation to DB; returns `{ ok, txHash, uid }`.

- SSE (optional, for testing):
  - `GET /functions/v1/sse-single-attestation?eventId=...&recipient=...&schemaUid=...`
  - Streams `status` → `found` → `end` when the attestation row appears.

## Edge Functions

- `attest-by-delegation` (single delegated attestation)
  - Path: `supabase/functions/attest-by-delegation/index.ts`
  - Inputs (body): `eventId?`, `chainId?`, `contractAddress?`, `schemaUid`, `recipient`, `data`, `deadline`, `signature`, optional `lockAddress`, `expirationTime`, `revocable`, `refUID`.
  - Auth: Privy JWT in `X-Privy-Authorization`.
  - Security: signer must belong to the authenticated Privy user, and equal `recipient`.

- `batch-attest-by-delegation` (batch delegated)
  - JSON and SSE modes; executes all pending delegations for an event.
  - Parses UIDs and writes to `attestations`.

- SSE endpoints (additive):
  - `sse-batch` → per-event batch status
  - `sse-transaction-status` → Paystack verification
  - `sse-single-attestation` → single attestation appearance

## Hooks

- `useAttestations` (existing)
  - Provides direct creation path and fetch helpers.

- `useDelegatedAttestation` (new)
  - Signs EAS delegated typed data in the browser for delegated flow.

- `useAttestationEncoding`
  - Encodes event attendance fields with SchemaEncoder-compatible order.

- `useSSE`
  - Wrapper for EventSource with auto-reconnect and Last-Event-ID.

## Admin UI Testers

- Page: `src/pages/AdminEvents.tsx` → "Batch Attestations (Test)"
  - Single Delegation: sign + send; start single-attestation SSE stream
  - Batch SSE: stream batch stats/executed; execute batch via SSE
  - Transaction SSE: monitor Paystack verification

## Shared Utilities

- `supabase/functions/_shared/privy.ts` → `getUserWalletAddresses(privyUserId)`
  - Returns all addresses linked to a Privy user (deduplicated, lowercased).

- `supabase/functions/_shared/unlock.ts` → `isAnyUserWalletHasValidKeyParallel(lock, addresses[], rpcUrl)`
  - Parallel checks `getHasValidKey` across addresses.

- `supabase/functions/_shared/cors.ts` → CORS and preflight headers.

## Environment Variables

- Client (Vite):
  - `VITE_SUPABASE_URL`
  - `VITE_TEEREX_ADDRESS_BASE_SEPOLIA` / `VITE_TEEREX_ADDRESS_BASE_MAINNET`

- Server (Supabase Functions):
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - `UNLOCK_SERVICE_PRIVATE_KEY` (service wallet)
  - `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, optional `PRIVY_VERIFICATION_KEY`
  - `PRIMARY_RPC_URL` (optional; used when `network_configs` has no RPC)
  - `TEEREX_ADDRESS_BASE_SEPOLIA` / `TEEREX_ADDRESS_BASE_MAINNET` (optional, used by edge functions)

## API Examples

- Single delegated attestation (JSON):

```bash
curl -X POST   -H "X-Privy-Authorization: Bearer <PRIVY_JWT>"   -H "Content-Type: application/json"   -d '{
    "eventId": "<uuid>",
    "chainId": 84532,
    "schemaUid": "0x...",
    "recipient": "0x...",
    "data": "0x...",
    "deadline": 1712345678,
    "signature": "0x..."
  }'   "<SUPABASE_URL>/functions/v1/attest-by-delegation"
```

- Single SSE stream:

```js
const url = `${SUPABASE_URL}/functions/v1/sse-single-attestation?eventId=${eventId}&recipient=${addr}&schemaUid=${uid}`;
const es = new EventSource(url);
es.addEventListener('found', (ev) => console.log('Attestation:', ev.data));
```

## Deployment

- Deploy (examples):

```bash
supabase functions deploy attest-by-delegation
supabase functions deploy batch-attest-by-delegation
supabase functions deploy sse-single-attestation
```

Ensure `PRIMARY_RPC_URL`, Privy secrets, and TEEREX address env vars are set in the project.

## Security Considerations

- Signature binding: signer must be a linked Privy wallet and equal the recipient.
- Ticket gating: checks across all user wallets in parallel.
- Creator lock gating: contract only allows creator-key holders to execute delegated APIs.
- Rate limiting (recommended): Consider adding limits to single/batch execution endpoints.

## Troubleshooting

- Missing RPC URL: set `PRIMARY_RPC_URL` or configure `network_configs`.
- Invalid UID in DB: fallback rows may use message hashes; ensure log parsing is correct for your EAS version.
- Unauthorized: ensure service wallet holds creator lock; ensure user holds event ticket; confirm Privy configuration.
