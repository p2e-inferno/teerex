# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TeeRex is a Web3 event management platform built with Vite, React, TypeScript, and shadcn-ui. It allows users to create events with on-chain ticketing using Unlock Protocol smart contracts, purchase tickets with crypto (ETH/USDC) or fiat (Paystack), and issue verifiable attestations using Ethereum Attestation Service (EAS).

**Core Technologies:**
- Frontend: Vite + React + TypeScript + Tailwind CSS + shadcn-ui
- Authentication: Privy (email, SMS, wallet login with embedded wallets)
- Blockchain: Base (Mainnet 8453 & Sepolia 84532) via ethers.js v6 and wagmi
- Smart Contracts: Unlock Protocol (PublicLock v14/v15), EAS, custom TeeRex proxy contracts
- Backend: Supabase (PostgreSQL + Edge Functions in Deno)
- Payments: Paystack for NGN fiat payments

## Common Development Commands

```bash
# Development
npm run dev              # Start dev server at http://localhost:8080

# Building
npm run build            # Production build
npm run build:dev        # Development mode build

# Code Quality
npm run lint             # Run ESLint

# Preview
npm run preview          # Preview production build
```

## Environment Configuration

Required environment variables (see `DEVELOPMENT_SETUP.md`):
- `VITE_DIVVI_CONSUMER_ADDRESS` - Divvi consumer identifier (client)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key (safe for client)
- `VITE_PRIVY_APP_ID` - Privy app ID for authentication

Server-side only (Edge Functions):
- `DIVVI_CONSUMER_ADDRESS` - Divvi consumer identifier (edge functions)
- `SUPABASE_SERVICE_ROLE_KEY` - For edge functions (sensitive)
- `PAYSTACK_SECRET_KEY` - Payment processing (sensitive)
- `UNLOCK_SERVICE_PRIVATE_KEY` - Smart contract interactions (sensitive)
- `DG_REDEMPTION_PAYOUT_PRIVATE_KEY` - Dedicated wallet for USDC DG-redemption payouts; fund with USDC + gas ETH per supported chain (sensitive)
- `PRIVY_APP_SECRET` or `PRIVY_VERIFICATION_KEY` - Token verification (sensitive)

## Architecture Overview

### Authentication Flow
- Privy handles all authentication (email, SMS, wallet, embedded wallets)
- Frontend obtains Privy JWT via `usePrivy()` hook and `getAccessToken()`
- Edge Functions verify Privy JWT using JWKS (with fallback to verification key)
- User identity is tracked via Privy `sub` (user ID)
- Embedded wallets are automatically created for users without wallets

### Event Lifecycle
1. **Draft Creation**: User creates draft in Supabase `event_drafts` table
2. **Deployment**: Client-side deploys Unlock Protocol lock contract using `src/utils/lockUtils.ts`
3. **Publishing**: Lock address + tx hash saved to `events` table
4. **Ticketing**: Tickets issued via:
   - Crypto: Direct on-chain purchase or gasless server-issued keys
   - Fiat: Paystack payment → webhook → server grants keys via `grantKeys()`

### Smart Contract Integration

### Divvi Referral Tracking
- Client writes (Privy + ethers): automatic via `getDivviBrowserProvider` / EIP-1193 wrapper.
- Wagmi/viem (optional): use `sendDivviTransaction` (`src/lib/divvi/viem.ts`) and pass the connected wallet address as `account`. Do not combine with provider-level wrapping.
- Edge Function writes: explicit tagging via `supabase/functions/_shared/divvi.ts`.

- **Unlock Protocol**: NFT-based ticketing (locks = events, keys = tickets)
- **EAS (Ethereum Attestation Service)**: On-chain attestations for:
  - Event attendance (after event ends)
  - Event "going" (RSVP before event)
  - Likes/reactions
- **TeeRex Proxy Contracts**: Gasless batch attestations via EIP-712 signatures
  - Contract addresses configured in `src/lib/config/contract-config.ts`
  - Uses custom `useTeeRexDelegatedAttestation` hook for signing

### Payment Flows
1. **Fiat (Paystack)**:
   - Flow: `PaystackPaymentDialog` → `init-paystack-transaction` edge function → Paystack checkout
   - Webhook: `paystack-webhook` verifies payment → `paystack-grant-keys` issues ticket
   - Email captured in `paystack_transactions.user_email`
   - **Subaccount routing**: If vendor has verified payout account, payments are split (vendor receives 95%, platform 5%)

2. **Crypto**:
   - Free: Direct `purchase()` call with value=0
   - ETH: User approves + calls `purchase()` with ETH value
   - USDC: User approves ERC20 + calls `purchase()` with token transfer
   - Gasless (planned): Server sponsors gas via edge functions

### Vendor Payout Accounts (Paystack Subaccounts)
- **Purpose**: Enable event creators to receive fiat payments directly to their bank accounts
- **Database**: `vendor_payout_accounts` table (provider-agnostic design for future Stripe/M-Pesa)
- **Workflow**: Vendor submits banking details → Auto-verified via Paystack API → Subaccount created
- **Verification**: Pluggable strategy pattern (`_shared/verification.ts`) - can swap for BVN, KYC, etc.
- **Edge Functions**:
  - `submit-payout-account` - Vendor submits banking details, auto-verification
  - `retry-payout-verification` - Retry verification after failure
  - `get-vendor-payout-account` - Vendor checks their account status
  - `admin-list-payout-accounts` - Admin oversight
  - `admin-suspend-payout-account` - Admin can suspend/unsuspend accounts
  - `list-nigerian-banks` - Bank codes for dropdown (public, cached)
- **Payment Flow**: Verified vendors receive: `amount - (amount × 5% commission)`
- **Routes**:
  - `/vendor/payout-account` - Vendor self-service page
  - `/admin/payout-accounts` - Admin oversight dashboard

### Database Schema (Supabase)
Key tables:
- `events`: Published events with lock_address, chain_id, creator_id
- `event_drafts`: Unpublished drafts
- `tickets`: Issued tickets (owner_wallet, token_id, tx_hash)
- `paystack_transactions`: Fiat payment records with reference, status, and payout_account_id
- `vendor_payout_accounts`: Vendor bank accounts for receiving fiat payments (Paystack subaccounts)
- `platform_config`: Platform-wide configuration (e.g., default commission rate)
- `network_configs`: Chain configurations (RPC URLs, USDC addresses)
- `attestations`: On-chain attestation records
- `event_interactions`: Posts, comments, reactions
- `gas_transactions`: Gas cost tracking for sponsored transactions

### Edge Functions Architecture
- **Location**: `supabase/functions/`
- **Runtime**: Deno with ES modules
- **Shared utilities**: `supabase/functions/_shared/`
  - `cors.ts`: CORS headers
  - `privy.ts`: JWT verification helpers
  - `abi/`: Smart contract ABIs
- **Auth Pattern**: All functions require `X-Privy-Authorization: Bearer <token>` header
- **Common imports**:
  ```typescript
  import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
  import { ethers } from "https://esm.sh/ethers@6.14.4";
  import { createRemoteJWKSet, jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";
  ```

### Edge Function Endpoint Design

Design Edge Functions around product capabilities and authorization boundaries, not individual UI actions. Several existing functions are split by verb (`create-*`, `update-*`, `get-*`, `list-*`) even when they operate on the same resource with the same caller, auth model, and shared utilities. Treat that as an endpoint-granularity issue to improve over time, not as permission to ignore the established implementation patterns inside those functions.

The default rule is: **one Edge Function per cohesive domain boundary; multiple handlers/routes inside it when operations share the same security model.**

Preserve these existing conventions when grouping or adding endpoints:
- Use `callEdgeFunction` from the frontend and keep the standard `{ ok: true, ...payload }` / `{ ok: false, error }` response contract.
- Keep Privy as the user identity boundary; verify `X-Privy-Authorization` with existing helpers such as `verifyPrivyToken`.
- Resolve and validate wallet context deliberately with existing Privy and wallet helpers; never infer authorization from an arbitrary first wallet when the operation is wallet-bound.
- Use existing authorization helpers such as `getEventAuthorization`, `requireEventAuthorization`, admin checks, service-manager helpers, network validation, and Unlock/key-holder checks instead of rewriting parallel logic.
- Scope every service-role database query to the authenticated Privy subject, validated wallet, event creator, vendor, manager, or admin context.
- Reuse `_shared` modules for CORS, error handling, network config, Paystack, Unlock, Divvi, pricing, payout, notification, and ticket/reward helpers.
- Keep atomic database invariants in RPCs or transactions where required; do not split coupled mutations across handlers just because they are in the same function.

Create a new Edge Function when there is a real boundary:
- Different trust model: public metadata, provider webhook, scheduled job, admin-only operation, or authenticated user operation.
- Different external signature or validation scheme, such as Paystack webhooks versus normal client calls.
- Different runtime profile or operational semantics, such as long-running sync, cron expiry, or background reconciliation.
- Different secret set or integration ownership.
- Different product domain where combining would make authorization harder to audit.

Prefer adding a route/handler to an existing domain function when operations share:
- Resource ownership and database tables.
- Caller type and auth requirements.
- Authorization helpers and wallet checks.
- Error/response semantics.
- Frontend workflow and deployment cadence.

Use a small router in `index.ts` and keep business logic in typed handler functions. HTTP methods are preferred for resource operations when practical; a typed `action` field is acceptable for command-style operations within one domain. Do not create a global catch-all `api` function.

Example target shape for discussions:
```text
event-discussions
  GET    posts for an event
  POST   create a post
  PATCH  update, pin, hide, or close comments on a post
  GET    comments for a post
  POST   create a comment
  PATCH  edit or soft-delete a comment
  POST   toggle a post reaction
```

Examples of consolidation candidates to migrate gradually:
- `event-discussions`: `get-event-discussions`, `get-post-comments`, `create-post`, `update-post`, `create-comment`, `update-comment`, `create-reaction`.
- `ticket-passes`: `create-ticket-pass`, `update-ticket-pass`, `get-ticket-pass`, `list-ticket-passes`, `search-linkable-events`, `init-ticket-pass-transaction`, `confirm-ticket-pass-paystack`, `get-ticket-pass-order-status`, `list-my-ticket-pass-orders`, `retry-ticket-pass-issuance`, `sync-ticket-pass-status`.
- `dg-redemptions`: `get-dg-redemption-status`, `list-user-dg-redemptions`, `quote-dg-redemption`, `cancel-dg-redemption`, `notify-dg-redemption-admin`, `submit-dg-redemption-transfer`.
- `admin-dg-redemptions`: `get-dg-redemption-config`, `update-dg-redemption-config`, `get-dg-redemption-admin-dashboard`, `admin-resolve-dg-redemption`, `retry-dg-redemption-payout`, `manage-dg-redemption-transfer-otp`, `expire-dg-redemption-intents`.
- `service-account`: `service-account-balances`, `service-account-gas-stats`, `service-account-key-health`.

Migration guidance:
- Do not break existing callers for cleanup. Introduce grouped endpoints, migrate callers deliberately, then retire old function slugs after verification.
- Do not combine public, webhook, admin, and user-authenticated behavior into one endpoint just to reduce count.
- Do not weaken authorization, wallet validation, idempotency, or error semantics during consolidation.
- Add new single-action functions only when the boundary criteria above are met.

### Network Configuration
- **Chains**: Base Mainnet (8453) and Base Sepolia (84532)
- **RPC URLs**: Stored in `network_configs` table, accessed dynamically
- **USDC Addresses**: Chain-specific, retrieved from `getUsdcAddress()` in `src/lib/config/network-config.ts`
- **Explorer Links**: Always generate via `getExplorerTxUrl(chainId, txHash)` — never hardcode `basescan.org` / `sepolia.basescan.org` or build `/tx/${hash}` strings inline

### Admin Features
- Admin access controlled via `is_admin` edge function (checks Privy user ID against allowlist)
- Protected routes use `AdminRoute` component wrapper
- Admin pages:
  - `/admin` - Dashboard
  - `/admin/schemas` - EAS schema management
  - `/admin/events` - Event management
  - `/admin/gasless` - Gasless configuration (gas sponsorship settings)

## Key Code Patterns

### 1. Calling Edge Functions

**Always use `callEdgeFunction` from `src/lib/edgeFunctions.ts`. Never call `supabase.functions.invoke` directly from components or hooks.**

The wrapper handles both HTTP-level errors (`FunctionsHttpError`) and application-level `{ ok: false }` responses, throwing a single `EdgeFunctionError` with a user-readable message in both cases. This eliminates scattered `if (error || !data?.ok)` checks and keeps error handling consistent across the codebase.

```typescript
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { usePrivy } from '@privy-io/react-auth';

const { getAccessToken } = usePrivy();
const token = await getAccessToken();

// Standard authenticated call
const data = await callEdgeFunction<ResponseType>('function-name', {
  key: value,
}, { privyToken: token });

// With anon key (required by some functions)
const data = await callEdgeFunction<ResponseType>('function-name', {
  key: value,
}, { privyToken: token, withAnonKey: true });

// REST-style: GET (body omitted automatically)
const data = await callEdgeFunction<ResponseType>('function-name', {}, {
  privyToken: token,
  method: 'GET',
});

// Unauthenticated (public endpoint)
const data = await callEdgeFunction<ResponseType>('function-name', { key: value }, {});
```

**Acceptable exceptions** — keep raw `supabase.functions.invoke` only when:
1. The call is intentional fire-and-forget (no auth, no error handling) — e.g. `send-ticket-email`
2. The function returns partial useful data even on `ok: false` (e.g. `can_retry` + `payout_account` fields) — the wrapper would swallow that context
3. The call site needs to catch errors to trigger a client-side fallback path — e.g. `useGasless.ts`
4. The function uses a non-standard `DUPLICATE_EVENT` error shape — e.g. `edgeFunctionStorage.ts`

Document the reason with a comment when keeping a raw invoke.

**`CallOptions` reference:**
```typescript
interface CallOptions {
  privyToken?: string | null;   // Privy JWT → sets X-Privy-Authorization header
  withAnonKey?: boolean;        // Also sets Authorization: Bearer <anon-key>
  extraHeaders?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; // default: POST
}
```

#### Client Data Access (No Direct Browser DB Calls)

**All client-side data access — reads AND writes — MUST go through an edge function** (invoked via `callEdgeFunction`), not the browser Supabase client. Client components, hooks, and pages MUST NOT call `supabase.from(...)` or `supabase.rpc(...)` against application tables.

- **The edge function is the authorization boundary, not the DB role.** This app's identity is the Privy DID (`did:privy:...`) in the JWT `sub` — a Privy DID can never satisfy `auth.uid()` RLS, and the browser anon client carries no Privy `sub` at all, so RLS cannot enforce per-user authz on direct browser reads. The edge function authenticates the Privy user (`verifyPrivyToken`), applies any admin/wallet guards, and **scopes every query to the caller** (e.g. `.eq('creator_id', user.sub)`). It then connects with `SUPABASE_SERVICE_ROLE_KEY` — because the role can't be the permission model, not because permission stopped mattering. service_role bypasses RLS, so each query MUST be scoped to the authenticated subject deliberately; there is no DB backstop.
- **Why**: anon/authenticated table and RPC grants are an external attack surface and leak schema via PostgREST. When every read/write is server-mediated, locking a table down is a one-line migration (`REVOKE ... FROM anon, authenticated`) with zero client refactor.
- **Anti-patterns**: importing `supabase` from `@/integrations/supabase/client` to call `.from(...)` / `.rpc(...)` in a component, hook, or page; adding an `anon`/`authenticated` grant so a client component can query a table directly; adding RLS policies as a substitute for an edge-function guard on a per-user or wallet-bound table.
- **Legacy exceptions are not precedent**: the remaining direct browser `.from(...)` reads (older event/attestation/ticket flows) are legacy and being migrated. Recent code routes through edge functions — match the new code, not the legacy. The browser client may still be used for non-table concerns it owns (auth session, storage, realtime channels) where no `.from(...)`/`.rpc(...)` table access is involved.

### 2. Signing EIP-712 Messages
```typescript
import { useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';

const { wallets } = useWallets();
const wallet = wallets?.[0];
const provider = await wallet.getEthereumProvider();
const signer = await new ethers.BrowserProvider(provider).getSigner();

const signature = await signer.signTypedData(domain, types, value);
```

### 3. Contract Interactions
```typescript
import { ethers } from 'ethers';
import { getRpcUrl } from '@/lib/config/network-config';

const rpcUrl = getRpcUrl(chainId);
const provider = new ethers.JsonRpcProvider(rpcUrl);
const contract = new ethers.Contract(address, abi, providerOrSigner);
const result = await contract.someMethod();
```

### 4. Database Migrations
- **Location**: `supabase/migrations/`
- **Naming**: `YYYYMMDDHHMMSS_description.sql`
- **Important**: Never reset the database - always use migration up (per user's global instructions)
- Apply migrations: Handled via Supabase CLI or platform

### 5. Type Safety
- Component props use TypeScript interfaces
- Database types auto-generated in `src/integrations/supabase/types.ts`
- Event types defined in `src/types/event.ts`
- Schema validation using Zod (see `src/types/event.schema.ts`)

## Important Conventions

### Chain ID Handling
- Always validate chain_id against `network_configs` table
- Default to Base Sepolia (84532) for development
- Production uses Base Mainnet (8453)

### Price Formatting
- Display prices use human-readable decimals (e.g., "10.50 USDC")
- On-chain values use wei/smallest unit (e.g., BigInt with 6 decimals for USDC)
- Convert using `parseUnits()` and `formatUnits()` from ethers.js

### Transaction Handling
- Always wait for transaction confirmation before updating UI
- Store transaction hashes in database for verification
- Show transaction links using block explorer URLs
- Handle transaction failures gracefully with retry options

### Error Handling
- **Edge function response shape** — all edge functions MUST return `{ ok: true, ...data }` on success and `{ ok: false, error: string }` on failure (see Edge Function Response Standard below). The `callEdgeFunction` wrapper enforces this contract automatically.
- Client-side catches `EdgeFunctionError` (thrown by `callEdgeFunction`) via try/catch; display the message in a toast notification.
- Validation errors shown inline on forms.
- Network errors prompt for retry.
- Do not add `if (error || !data?.ok)` checks after `callEdgeFunction` — it already throws for both cases.

### Edge Function Response Standard

Every new edge function MUST follow this response shape:

**Success:**
```typescript
return new Response(JSON.stringify({ ok: true, ...payload }), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
```

**Failure (4xx/5xx):**
```typescript
return new Response(JSON.stringify({ ok: false, error: 'Human-readable message' }), {
  status: 400, // or 401, 403, 404, 500 as appropriate
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
```

**Rules:**
- Always include `ok: true | false` at the top level.
- Always include a string `error` field on failure — this is what `callEdgeFunction` surfaces to the user.
- Never return bare `{ error }` without `ok`, and never return `{ ok: false }` without `error`.
- For functions where `ok: false` needs to carry actionable partial data back to the client (e.g. `can_retry`, `payout_account`), document this explicitly — the `callEdgeFunction` wrapper cannot be used on the client side for such calls (they require raw `supabase.functions.invoke`).
- Use `status: 200` for application-level failures only when the response body provides sufficient context and the HTTP status is not semantically important. Prefer accurate HTTP status codes (400, 401, 403, 500) so the wrapper can surface them in `EdgeFunctionError.status`.

**Deno edge function skeleton:**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await verifyPrivyToken(req);
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    // ... business logic ...

    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[function-name]", err);
    return new Response(JSON.stringify({ ok: false, error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

### Client Interaction UX (Optimistic + Localized)
- Default to optimistic/local updates with background refetch: keep existing UI visible, update local state first, then reconcile via background refetch (no full-component spinners after a single action).
- Scope loading to the interacted element (button/icon/row), not the whole card/page unless it’s the initial empty load.
- Preserve counters/flags locally (reactions, comment counts, pin status) and refetch in the background; show toasts for errors instead of clearing UI.
- If realtime is absent, pair optimistic update + background refetch for eventual consistency; only revert UI on confirmed failure.
- Reuse established patterns/hooks before adding new ones: `useEventPosts` (posts/reactions/comments optimistic helpers), `CommentSection` (local comment create/edit/delete), `usePostReactions` (returns action type for optimistic handling). Extend these instead of duplicating behavior.

### Gas Sponsorship (Planned)
- See `docs/gas-sponsorship-prd.md` for detailed specification
- Modular architecture with separate hooks, services, and utilities
- Rate limiting enforced server-side (15 deploys/day, 20 tickets/day per user)
- Admin configurable via gasless config page

## Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn-ui components
│   ├── layout/          # Layout components (Header, Layout)
│   ├── events/          # Event-related components
│   ├── attestations/    # Attestation components (EAS integration)
│   ├── interactions/    # Posts, comments, reactions
│   ├── create-event/    # Event creation wizard
│   └── routes/          # Route guards (AdminRoute)
├── hooks/               # Custom React hooks
│   ├── use-toast.ts
│   ├── use-mobile.tsx
│   ├── useAttestations.ts
│   └── useTeeRexDelegatedAttestation.ts
├── integrations/
│   └── supabase/        # Supabase client and types
├── lib/
│   ├── abi/             # Smart contract ABIs
│   ├── config/          # Contract and network configs
│   ├── explore/         # Explore page utilities
│   ├── helpers/         # Helper functions
│   ├── home/            # Home page utilities
│   └── utils.ts         # General utilities (cn, etc.)
├── pages/               # Route pages
│   ├── Index.tsx
│   ├── Explore.tsx
│   ├── CreateEvent.tsx
│   ├── EventDetails.tsx
│   ├── MyEvents.tsx
│   ├── MyTickets.tsx
│   ├── Attestations.tsx
│   ├── AdminDashboard.tsx
│   └── NotFound.tsx
├── types/               # TypeScript type definitions
├── utils/               # Utility functions
│   ├── lockUtils.ts     # Unlock Protocol helpers
│   └── wagmiConfig.ts   # Wagmi configuration
├── App.tsx              # Root component with routes
└── main.tsx             # Entry point

supabase/
├── functions/           # Edge functions (Deno)
│   ├── _shared/         # Shared utilities
│   ├── init-paystack-transaction/
│   ├── paystack-webhook/
│   ├── paystack-grant-keys/
│   ├── eas-gasless-attestation/
│   ├── is-admin/
│   └── [others]/
└── migrations/          # Database migrations
```

## Common Tasks

### Adding a New Edge Function
1. Make the boundary decision first: extend an existing domain function unless the new behavior has a distinct trust model, integration boundary, runtime profile, secret set, or product domain.
2. If extending a domain function, add a typed route/handler and reuse the domain's existing auth, wallet, validation, and response helpers.
3. If creating `supabase/functions/new-function/`, document the boundary in the PR description or handoff summary; do not create a new function only because the UI has a new button.
4. Keep `index.ts` as a thin request router when the function owns multiple operations; put business logic in typed handlers or `_shared` modules.
5. Use `_shared/cors.ts`, existing Privy verification, event/admin/service-manager authorization helpers, network validation, and service-role query scoping.
6. Return JSON responses with proper CORS headers and the standard `{ ok, error }` contract.
7. Test locally with Supabase CLI and use focused tests for auth failures, wallet mismatch/conflict paths, idempotency, and retry behavior where relevant.

### Adding a New Page/Route
1. Create component in `src/pages/`
2. Add route in `src/App.tsx`
3. If admin-only, wrap with `<AdminRoute>` component
4. Update navigation in `src/components/layout/Header.tsx` if needed

### Working with Smart Contracts
1. Add ABI to `src/lib/abi/` or `supabase/functions/_shared/abi/`
2. Configure addresses in `src/lib/config/contract-config.ts`
3. Create helper functions in `src/utils/` or custom hooks in `src/hooks/`
4. Use ethers.js v6 syntax for all contract interactions

### Database Changes
1. Create migration file: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. Write SQL for schema changes
3. Include RLS policies if adding new tables
4. **Follow database performance best practices** (see section below)
5. Test migration locally before deploying
6. Never reset the database (per user's global instructions)

## Database Performance Best Practices

When creating or modifying database migrations, follow these critical performance guidelines to avoid common pitfalls identified by Supabase Performance Advisor:

### 1. RLS Policy Performance (auth_rls_initplan)

**Problem**: Using `current_setting()` or `auth.uid()` directly in RLS policies causes them to be re-evaluated for EVERY row, leading to severe performance degradation at scale.

**❌ BAD - Re-evaluates for each row:**
```sql
CREATE POLICY "Users can update own records"
  ON table_name FOR UPDATE
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
```

**✅ GOOD - Evaluates once per query:**
```sql
CREATE POLICY "Users can update own records"
  ON table_name FOR UPDATE
  USING (user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));
```

**Key Rule**: Always wrap `current_setting()`, `auth.uid()`, and `auth.jwt()` with `(SELECT ...)` in RLS policies.

**Common patterns to fix:**
- `current_setting('request.jwt.claims', true)::json->>'sub'` → `(SELECT current_setting('request.jwt.claims', true)::json->>'sub')`
- `auth.uid()::text` → `(SELECT auth.uid()::text)`
- `auth.jwt()->>'role'` → `(SELECT auth.jwt()->>'role')`

### 2. Multiple Permissive Policies (multiple_permissive_policies)

**Problem**: Having multiple permissive policies for the same role and action causes Postgres to evaluate ALL policies, even when one would suffice.

**❌ BAD - Multiple overlapping policies:**
```sql
-- Policy 1: Public can view
CREATE POLICY "Anyone can view" ON table_name
  FOR SELECT USING (true);

-- Policy 2: Creators can manage (includes SELECT)
CREATE POLICY "Creators can manage" ON table_name
  FOR ALL USING (creator_id = ...);
```

**✅ GOOD - Consolidate or use specific actions:**
```sql
-- Option 1: Single policy with OR condition
CREATE POLICY "Public view or creator manage" ON table_name
  FOR SELECT USING (true OR creator_id = ...);

-- Option 2: Separate policies by specific action (not FOR ALL)
CREATE POLICY "Public can view" ON table_name
  FOR SELECT USING (true);

CREATE POLICY "Creators can update" ON table_name
  FOR UPDATE USING (creator_id = ...);

CREATE POLICY "Creators can delete" ON table_name
  FOR DELETE USING (creator_id = ...);
```

**Key Rule**: Avoid using `FOR ALL` when you have other policies for the same role. Break it into specific actions (INSERT, UPDATE, DELETE) to prevent overlap.

### 3. Foreign Key Indexing (unindexed_foreign_keys)

**Problem**: Foreign keys without indexes cause full table scans during:
- DELETE operations on parent tables (CASCADE checks)
- JOIN queries
- Foreign key constraint validation

**❌ BAD - Foreign key without index:**
```sql
CREATE TABLE child_table (
  id UUID PRIMARY KEY,
  parent_id UUID REFERENCES parent_table(id) ON DELETE CASCADE
  -- No index on parent_id!
);
```

**✅ GOOD - Always index foreign keys:**
```sql
CREATE TABLE child_table (
  id UUID PRIMARY KEY,
  parent_id UUID REFERENCES parent_table(id) ON DELETE CASCADE
);

-- Add index immediately after table creation
CREATE INDEX idx_child_table_parent_id ON child_table(parent_id);

-- For nullable foreign keys, use partial index
CREATE INDEX idx_child_table_parent_id
  ON child_table(parent_id)
  WHERE parent_id IS NOT NULL;
```

**Key Rule**: EVERY foreign key column MUST have an index. Use partial indexes (`WHERE column IS NOT NULL`) for nullable foreign keys to save space.

### 4. `ON CONFLICT` / Upsert Constraint Matching

**Problem**: Postgres requires `ON CONFLICT (column_name)` to match a real unique or exclusion constraint/index for that exact target. A partial unique index such as `WHERE column_name IS NOT NULL` does not satisfy a plain Supabase `.upsert(..., { onConflict: "column_name" })`, so the failure appears only at runtime when the insert path executes.

**❌ BAD - Partial unique index does not match plain upsert target:**
```sql
CREATE UNIQUE INDEX idx_orders_payment_reference
  ON public.orders(payment_reference)
  WHERE payment_reference IS NOT NULL;
```

```ts
await supabase
  .from("orders")
  .upsert(order, { onConflict: "payment_reference" });
```

**✅ GOOD - Non-partial unique index matches the upsert target:**
```sql
CREATE UNIQUE INDEX idx_orders_payment_reference_unique
  ON public.orders(payment_reference);
```

**Key Rule**: Every Supabase `.upsert(..., { onConflict })` and every SQL `ON CONFLICT (...)` must be backed by a matching non-partial unique index or unique constraint on the same columns, in the same order. Postgres unique indexes allow multiple `NULL` values, so do not use a nullable-column partial unique index as the conflict target for app/edge-function upserts.

For composite upserts such as `{ onConflict: "event_id,wallet_address" }`, create a matching non-partial unique index on `(event_id, wallet_address)`. If raw SQL intentionally uses a partial conflict target, the `ON CONFLICT` clause must include the same predicate; Supabase client `onConflict` strings cannot express that predicate.

### 5. Migration Checklist for Performance

Before finalizing any migration that creates or modifies tables with RLS:

- [ ] All foreign key columns have indexes
- [ ] All RLS policies wrap `current_setting()`/`auth.*()` with `(SELECT ...)`
- [ ] No overlapping `FOR ALL` policies with specific action policies
- [ ] Every `.upsert(..., { onConflict })` / `ON CONFLICT (...)` target has a matching non-partial unique index or constraint
- [ ] Partial indexes used for nullable columns (`WHERE column IS NOT NULL`)
- [ ] Complex policies use `EXISTS` subqueries efficiently
- [ ] Indexes on columns frequently used in WHERE clauses or JOINs

### 6. Testing for Performance Issues

After applying migrations, check Supabase Performance Advisor:

1. Navigate to: Supabase Dashboard → Database → Performance
2. Look for warnings:
   - `auth_rls_initplan` - Fix by wrapping auth functions with SELECT
   - `multiple_permissive_policies` - Consolidate or separate by action
   - `unindexed_foreign_keys` - Add missing indexes
3. Address all WARN-level issues before deploying to production

### 7. Common RLS Patterns

**Pattern 1: User owns record**
```sql
CREATE POLICY "Users manage own records" ON table_name
  FOR ALL USING (
    user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
  );
```

**Pattern 2: Related record ownership (with EXISTS)**
```sql
CREATE POLICY "Event creators manage resources" ON resource_table
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = resource_table.event_id
      AND events.creator_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );
```

**Pattern 3: Service role access**
```sql
CREATE POLICY "Service role full access" ON table_name
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
```

**Pattern 4: Public read, authenticated write**
```sql
-- Separate policies, no overlap
CREATE POLICY "Public read" ON table_name
  FOR SELECT USING (true);

CREATE POLICY "Authenticated insert" ON table_name
  FOR INSERT TO authenticated
  WITH CHECK (true);
```

## Database Security Best Practices

These complement the performance guidance above and reflect conventions already used across this repo's migrations.

### 1. Privy DID identity columns (no `auth.users` FK, no `auth.uid()` RLS)

User identity in this app is the Privy DID (`did:privy:...`), carried in the JWT `sub` claim — **not** a Supabase `auth.users` UUID.

- Columns that store the caller's identity MUST be typed `text` with **no foreign key to `auth.users`**.
- Never guard such columns with `auth.uid() = user_id` — a Privy DID can never equal a Supabase auth UUID, so the policy would always deny.
- Use the established `sub`-claim pattern (and wrap it in `(SELECT ...)` per the performance rules above):
  ```sql
  USING (user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'))
  ```

### 2. Explicit Data API grants — new tables are server-only by default

From Oct 30, 2026, Supabase stops auto-exposing `public` tables to the Data API (supabase-js / PostgREST), so every migration that creates a `public.*` table MUST include explicit grants in the same migration. Because all client access is server-mediated through edge functions (see Client Data Access above), **new tables grant `service_role` only** — omit `anon`/`authenticated`:

```sql
alter table public.your_table enable row level security;

-- Server-mediated default (edge functions only):
grant select, insert, update, delete on table public.your_table to service_role;
```

For server-only RPCs: `grant execute on function public.your_fn(...) to service_role;`.

Add an `anon`/`authenticated` SELECT grant **only** for genuinely public, unauthenticated, non-PII data consumed through a thin read path you have explicitly justified — not so a client component can query a table directly (route that through an edge function instead). Add RLS policies for every role granted SELECT/INSERT/UPDATE/DELETE. The remaining anon-readable tables are legacy exceptions, not a template for new work.

### 3. Function security (`SET search_path = 'public'`)

Every PL/pgSQL function — especially trigger functions and any `SECURITY DEFINER` function — MUST pin `SET search_path = 'public'` to prevent search_path injection and silent failures under the service_role context. This is already the convention (see `supabase/migrations/20251030000001_fix_function_search_path.sql`).

```sql
CREATE OR REPLACE FUNCTION public.my_fn()
RETURNS TRIGGER
SET search_path = 'public'  -- required
AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
```

Use `SECURITY DEFINER` sparingly and only with `SET search_path`. Avoid `SECURITY DEFINER` on views — use RLS policies for access control instead.

## Database Operation Safety

These rules apply to edge functions and any multi-step DB work; they reinforce the post-success side-effect guidance in Error Handling.

- **Atomicity**: If multiple DB writes must succeed or fail together, use a single PL/pgSQL function — not sequential client-side or edge-function queries. Test: "If step 2 fails, is step 1's result broken?" If yes, wrap it in one function.
- **TOCTOU**: Check-then-act across separate queries is a race. Guards and the mutation they protect must live in the same transaction/function.
- **Delete-then-insert is a red flag**: Removing rows before inserting replacements must be atomic — a failure in between is data loss.
- **Post-success side effects**: Once the core operation succeeds (key grant, payment captured), a failure in a secondary step (attestation, email, analytics) should be logged and swallowed — not thrown. The user already got what they paid for; don't mask that with an error.
- **Error status fidelity**: Never coerce a server error (500) into a client error (400/403). If the server broke, surface it. This pairs with the Edge Function Response Standard — use accurate HTTP status codes so `EdgeFunctionError.status` is meaningful.

## Server-Side Key Grants & Wallet Targeting

Server-issued tickets call Unlock Protocol's `grantKeys(recipients, expirations, keyManagers)` (see `paystack-grant-keys`, `grant-keys-service`, `claim-gaming-bundle`, and `_shared/unlock.ts`).

- **Never pass an empty `keyManagers` array** — PublicLock reverts with an array-index error. The repo convention is `[recipient]` (the buyer manages their own key); pass an explicit admin manager only when the credential is intentionally non-transferable.
- **Grant to the intended recipient wallet explicitly.** Authentication (a valid Privy token) proves *who* the caller is, not *which* wallet a request acts on. Resolve the recipient deliberately — never default to "the first linked wallet" or an inferred primary wallet for a wallet-bound grant. A result that should change when the user switches wallets must be bound to the wallet that was actually validated/intended.
- Wait for transaction confirmation and persist the tx hash before reporting success, per Transaction Handling.

## Code Comments (Mandatory Standard)

Comments ship to production, get reviewed, and are read by attackers. Hold them to the same bar as code. Applies to every file type: TS/TSX, SQL migrations, edge functions, config.

**Default: write no comment.** A well-named identifier and a small function are the comment. Only write one when the WHY is non-obvious to a senior reviewer — a hidden constraint, a subtle invariant, a security/atomicity rationale, a workaround for a specific upstream bug, or behavior that would surprise a careful reader. If deleting the comment wouldn't confuse such a reader, don't write it.

**Allowed (when justified):** one short line explaining a non-obvious WHY; a reference to a durable public source (RFC, EIP, upstream issue URL) for a workaround; a field-semantics note where the name is genuinely ambiguous; license/SPDX headers.

**Forbidden:**
- Restating what the code says (`// loop over items`, `// set state`).
- Multi-paragraph docstrings, banner comments, section-label dividers (`// --- Helpers ---`, `{/* Header */}`).
- TODO/FIXME/HACK without an owner and a tracked ticket URL — prefer fixing it or filing the ticket and omitting the comment.
- Author tags, dates, change logs, references to the current task/PR/caller (`// fix for the renew bug`) — git history is authoritative; these rot.
- Commented-out code — delete it; git remembers.
- Emojis, ASCII art, jokes, "obvious" security claims (`// safe`, `// validated`).

**Security hygiene (non-negotiable):** never put secrets, API keys, tokens, JWTs, signatures, private RPC URLs, internal hostnames, DB connection strings, or admin wallet addresses in comments — even as "examples". Never include real user PII (emails, phone numbers, Privy DIDs, wallet addresses tied to a user). Never describe a known weakness or bypass in source (`// this check can be skipped if…`) — file a private ticket and fix it. SQL migrations: no business secrets, no real customer IDs, no `-- TODO drop this later`; a one-line note citing a security/atomicity invariant (e.g. why `SET search_path` is set) is acceptable.

**Style:** one short line, sentence case, ending in a period, placed immediately above the line it explains. Match the file's comment syntax (`//` vs `--`).

**Review gate:** before adding any comment, ask "would a senior engineer reading this diff in a year find it load-bearing, or noise?" If noise, delete it.

## Testing Considerations

### Local Development
- Use Base Sepolia (84532) for testing
- Requires testnet ETH for transactions
- Paystack test mode for fiat payments
- Use separate Privy app ID for development

### Key Test Scenarios
- Event creation and deployment with different currencies (FREE/ETH/USDC)
- Ticket purchase flows (crypto + fiat)
- Attestation creation (gasless via TeeRex proxy)
- Admin access control
- Chain switching between Base Mainnet and Sepolia
- Transaction error handling and retries

## Important Files to Reference

- `DEVELOPMENT_SETUP.md` - Comprehensive setup guide with environment variables
- `docs/gas-sponsorship-prd.md` - Detailed PRD for gasless feature implementation
- `src/utils/lockUtils.ts` - Unlock Protocol deployment and interaction helpers
- `src/hooks/useTeeRexDelegatedAttestation.ts` - EIP-712 signing for gasless attestations
- `src/components/PrivyProvider.tsx` - Authentication setup and chain configuration
- `supabase/functions/_shared/cors.ts` - CORS handling pattern for edge functions
- `src/lib/config/network-config.ts` - Chain and token address helpers

## Related Documentation

- [Unlock Protocol Docs](https://docs.unlock-protocol.com/)
- [Ethereum Attestation Service](https://docs.attest.org/)
- [Privy Docs](https://docs.privy.io/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Base Network](https://docs.base.org/)
