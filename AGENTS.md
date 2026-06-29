# Agents Guide for Teerex

This repo uses Supabase Edge Functions for Paystack → Unlock ticket issuance.
Follow these notes when updating or deploying.

## Project Structure & Commands

This is a Vite + React + TypeScript app, not a Next.js app.

- Source: `src/components/` for UI, `src/pages/` for React Router pages, `src/hooks/` for hooks, `src/lib/` and `src/utils/` for shared logic, `src/types/` for app types, `src/integrations/supabase/` for generated Supabase client/types.
- Backend/DB: `supabase/functions/` for Deno Edge Functions, `supabase/functions/_shared/` for shared function utilities, and `supabase/migrations/` for SQL migrations.
- Tests: `tests/unit`, `tests/integration`, `tests/components`, `tests/hooks`, plus co-located `*.test.ts(x)` where already used.
- Config: `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `tailwind.config.ts`, `synpress.json`, `supabase/config.toml`.

Common commands:
- `npm run dev`: start the Vite dev server.
- `npm run build`: production build.
- `npm run lint`: ESLint.
- `npm run typecheck`: TypeScript checks for app and node configs.
- `npm run test`: Vitest test suite.
- `npm run test:unit` / `npm run test:integration`: targeted Vitest suites.
- `npm run test:coverage`: coverage run.
- `npm run test:edge`: Deno tests for shared edge-function code.
- `npm run test:e2e`: Cypress/Synpress E2E suite.
- `npm run types:supabase:local`: regenerate Supabase types into both edge-function and app type locations.
- `npm run functions:serve`: serve Supabase Edge Functions locally with `.env`.

Prefer focused verification for the files changed. If a broad command fails because of unrelated existing issues, report that clearly and include the narrower checks that passed.

## Coding Style & Naming

- TypeScript-first; prefer explicit interfaces/types over `any`.
- React components use PascalCase filenames in `src/components/` and `src/pages/`.
- Hooks use `useX.ts` or `useX.tsx` in `src/hooks/`.
- Utilities use camelCase names in `src/lib/` or `src/utils/`.
- Keep shadcn/Radix UI composition consistent with existing `src/components/ui/*` primitives.
- Use existing hooks, helpers, config readers, and type definitions before adding parallel abstractions.
- Generate explorer links through existing helpers such as `getExplorerTxUrl(chainId, txHash)`; do not hardcode Basescan URLs inline.

## Calling Edge Functions from the Frontend

**Always use `callEdgeFunction` from `src/lib/edgeFunctions.ts`. Never call `supabase.functions.invoke` directly from components or hooks.**

This is a hard rule. Raw `supabase.functions.invoke` calls caused fragmented error handling, inconsistent auth header construction, and silent failures across the codebase. The wrapper was introduced and all call sites were migrated to it — do not reintroduce raw invocations.

```typescript
import { callEdgeFunction } from '@/lib/edgeFunctions';

// Authenticated call
const data = await callEdgeFunction<MyType>('my-function', { param: value }, {
  privyToken: token,
});

// With anon key (some functions require both headers)
const data = await callEdgeFunction<MyType>('my-function', { param: value }, {
  privyToken: token,
  withAnonKey: true,
});

// REST-style GET (body is omitted)
const data = await callEdgeFunction<MyType>('my-function', {}, {
  privyToken: token,
  method: 'GET',
});

// Unauthenticated public endpoint
const data = await callEdgeFunction<MyType>('my-function', { param: value }, {});
```

The wrapper throws `EdgeFunctionError` for both HTTP errors and `{ ok: false }` application responses. Callers use try/catch; no `if (error || !data?.ok)` checks needed.

**The only acceptable exceptions** (document with a comment when used):
1. Fire-and-forget calls with no auth and no needed error handling.
2. Functions that return partial useful data on `ok: false` (e.g. `can_retry`, `payout_account`) — the wrapper discards that context.
3. Call sites that need to catch the raw error to trigger a client-side fallback (e.g. `useGasless.ts`).
4. Non-standard error shapes like `DUPLICATE_EVENT`.

---

## Edge Function Endpoint Design

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

---

## Client Data Access (No Direct Browser DB Calls)

New client-side application data access must go through an Edge Function invoked with `callEdgeFunction`. Client components, hooks, pages, and browser-reachable modules must not call Supabase tables (`.from(...)`) or RPCs (`.rpc(...)`) directly for application data.

- The Edge Function is the authorization boundary. Teerex identity comes from Privy, not Supabase Auth, so browser RLS cannot reliably enforce per-user or wallet-bound permissions.
- Edge Functions that use the service role must scope every query deliberately to the authenticated Privy subject, validated wallet, event creator, vendor, or admin context. `service_role` bypasses RLS; there is no database backstop for an unscoped query.
- Do not add `anon` or `authenticated` grants just so a browser component can query a table. Add an Edge Function or extend an existing one.
- Legacy direct browser table reads are not precedent for new code. Match the newer Edge Function pattern unless the exception is explicitly documented and justified.
- Browser Supabase usage is still acceptable for non-table concerns it owns, such as storage or realtime channels, when no application table/RPC access is involved.

---

## Edge Function Response Standard

Every edge function MUST follow this response contract so `callEdgeFunction` works correctly:

**Success → HTTP 200:**
```typescript
return new Response(JSON.stringify({ ok: true, ...payload }), {
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
```

**Failure → HTTP 4xx/5xx:**
```typescript
return new Response(JSON.stringify({ ok: false, error: "Human-readable message" }), {
  status: 400, // 400 | 401 | 403 | 404 | 500 as appropriate
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
```

**Rules:**
- `ok` field is required on every response — `true` for success, `false` for failure.
- `error` (string) is required when `ok: false` — this is the message shown to users.
- Never return `{ error }` without `ok`. Never return `{ ok: false }` without `error`.
- Prefer accurate HTTP status codes. Use `4xx` for client errors, `5xx` for server errors.
- If a failure response must carry actionable partial data (e.g. `can_retry: true`), document it explicitly. These calls cannot use `callEdgeFunction` on the client and require raw `supabase.functions.invoke` with manual `{ data, error }` handling.

**Standard function skeleton:**
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

---

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

## Frontend Interaction Principle (Optimistic + Localized UX)

When building or modifying client components/pages:
- Default to optimistic/localized updates: update local state first, then background-refetch to reconcile (no full component reloads for a single action).
- Keep loading states scoped to the element acted on (button/icon/row), not the whole card/page, unless the initial load is empty.
- Prefer background refreshes (refetch with existing data retained) after writes; avoid blocking spinners when data is already on screen.
- Preserve counts/flags locally (e.g., reactions, comment counts, pin status) and reconcile on refetch; never clear data on transient errors—show a toast instead.
- If realtime is absent, combine optimistic update + background refetch for eventual consistency; only revert UI on a confirmed failure.
- Use existing hooks as patterns (e.g., `useEventPosts`, `usePostReactions`, `CommentSection` local updates) before adding new ones; extend them rather than duplicating behaviors.

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
- `DIVVI_CONSUMER_ADDRESS` (Divvi identifier for referral tracking in Edge Functions)
- Optionally `RPC_URL` if not using `network_configs` or chain fallbacks
- Privy secrets if required by other functions

## Divvi Referral Tracking (Client + Edge)

Divvi attribution is implemented for:
- **Client (Privy + ethers)**: automatic via the EIP-1193 wrapper inside `getDivviBrowserProvider` (`src/lib/wallet/provider.ts`).
- **Edge Functions**: explicit tagging + best-effort submit via `supabase/functions/_shared/divvi.ts`.

### Wagmi/Viem (Optional)

The app currently uses the Privy + ethers path for client writes.

If wagmi/viem write paths are added later, use the explicit helper `sendDivviTransaction` (`src/lib/divvi/viem.ts`) and pass the already-known connected wallet address as `account`.

Do **not** combine wagmi provider-level wrapping (`wrapEip1193ProviderWithDivvi`) with `sendDivviTransaction` to avoid double-tagging and double-submit.

## RLS and Client Polling

The browser does not read `paystack_transactions` directly (Privy auth lacks Supabase JWT claims). Instead the UI calls `get-transaction-status` (Edge Function) which reads with the service role and returns a minimal, safe payload.

## Local Changes That Require Deploy

Any file under `supabase/functions/**` requires redeploy of the corresponding function. Redeploy both functions after changes to ensure the issuing flow works end-to-end.

## Database Migrations

### Supabase CLI and Database Operation Safety

- Use the Supabase CLI for database tasks unless the user explicitly asks for another tool. Run `supabase --help` or `supabase migration --help` when command syntax is uncertain.
- Creating a migration file is allowed when requested. Applying it is a separate action.
- Never apply migrations, push schema changes, or otherwise mutate local or remote databases unless the user explicitly asks for that action in the current task.
- Never run `supabase db reset` unless the user explicitly asks for a reset. It is destructive.
- If the user explicitly asks to apply local migrations, use `supabase migration up --local`.
- If a migration changes schema used by TypeScript, regenerate types with `npm run types:supabase:local` when appropriate.

### Migration Naming Convention
- Format: `YYYYMMDDHHMMSS_description.sql`
- Example: `20251117120000_fix_rls_performance_issues.sql`
- Use descriptive names that clearly indicate what the migration does

### Critical Migration Performance Rules

When creating database migrations, you MUST follow these performance best practices to avoid degraded query performance at scale:

#### 1. Always Wrap Auth Functions in RLS Policies

**WRONG** ❌
```sql
CREATE POLICY "policy_name" ON table_name
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
```

**CORRECT** ✅
```sql
CREATE POLICY "policy_name" ON table_name
  USING (user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub'));
```

**Why**: Without the `(SELECT ...)` wrapper, the function is re-evaluated for EVERY row, causing severe performance degradation.

**Apply to all:**
- `current_setting('request.jwt.claims', true)::json->>'sub'`
- `auth.uid()`
- `auth.jwt()`
- Any function call in RLS policy conditions

#### 2. Index ALL Foreign Keys

**WRONG** ❌
```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE
  -- Missing index!
);
```

**CORRECT** ✅
```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE
);

-- Immediately add index
CREATE INDEX idx_tickets_event_id ON tickets(event_id);

-- For nullable foreign keys, use partial index
CREATE INDEX idx_tickets_payment_id
  ON tickets(payment_id)
  WHERE payment_id IS NOT NULL;
```

**Why**: Unindexed foreign keys cause full table scans during:
- DELETE operations (CASCADE checks)
- JOIN queries
- Constraint validation

#### 3. Avoid Overlapping Policies

**WRONG** ❌ - Multiple policies for same role/action
```sql
CREATE POLICY "Public can view" ON table_name
  FOR SELECT USING (true);

CREATE POLICY "Creators can manage" ON table_name
  FOR ALL USING (creator_id = ...);  -- FOR ALL includes SELECT!
```

**CORRECT** ✅ - Option 1: Break down FOR ALL
```sql
CREATE POLICY "Public can view" ON table_name
  FOR SELECT USING (true);

CREATE POLICY "Creators can update" ON table_name
  FOR UPDATE USING (creator_id = (SELECT ...));

CREATE POLICY "Creators can delete" ON table_name
  FOR DELETE USING (creator_id = (SELECT ...));
```

**CORRECT** ✅ - Option 2: Consolidate into one policy
```sql
CREATE POLICY "View and manage" ON table_name
  FOR ALL USING (
    true OR creator_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
  );
```

**Why**: Multiple permissive policies for the same action force Postgres to evaluate ALL of them, even when one would suffice.

#### 4. Match `ON CONFLICT` Targets to Real Unique Constraints

Any Edge Function or SQL that uses `.upsert(..., { onConflict: "column_name" })` or `ON CONFLICT (column_name)` must have a matching non-partial unique index or unique constraint on exactly that conflict target.

**WRONG** ❌ - Supabase/Postgres cannot use this partial index for a plain `ON CONFLICT (payment_reference)` target:
```sql
CREATE UNIQUE INDEX idx_orders_payment_reference
  ON public.orders(payment_reference)
  WHERE payment_reference IS NOT NULL;
```

**CORRECT** ✅ - Plain conflict target has a matching non-partial unique index:
```sql
CREATE UNIQUE INDEX idx_orders_payment_reference_unique
  ON public.orders(payment_reference);
```

**Why**: `ON CONFLICT (column_name)` only matches unique/exclusion constraints that cover the same target. A partial unique index with `WHERE column_name IS NOT NULL` does not match the plain conflict target and causes runtime checkout/insert failures such as `there is no unique or exclusion constraint matching the ON CONFLICT specification`.

**Rules:**
- Before adding or changing any `upsert(..., { onConflict })`, verify the migration creates a matching non-partial unique index/constraint.
- Do not rely on a nullable-column partial unique index for Supabase `.upsert()` conflict targets. Postgres unique indexes already allow multiple `NULL` values.
- For composite upserts such as `{ onConflict: "event_id,wallet_address" }`, create a matching non-partial unique index on the same column list and order.
- If raw SQL intentionally uses a partial conflict target, the `ON CONFLICT` clause must include the same predicate. Supabase client `onConflict` strings cannot express that predicate, so use a non-partial unique index for app/edge-function upserts.

### Pre-Migration Checklist

Before committing any migration file, verify:

- [ ] All `CREATE TABLE` statements with foreign keys have corresponding indexes
- [ ] All RLS policies wrap `current_setting()`/`auth.*()` with `(SELECT ...)`
- [ ] No `FOR ALL` policies overlap with specific action policies (SELECT/INSERT/UPDATE/DELETE)
- [ ] Every `.upsert(..., { onConflict })` / `ON CONFLICT (...)` target has a matching non-partial unique index or constraint
- [ ] Nullable foreign key columns use partial indexes (`WHERE column IS NOT NULL`)
- [ ] Complex RLS policies use `EXISTS` subqueries efficiently
- [ ] Migration file follows naming convention: `YYYYMMDDHHMMSS_description.sql`

### Post-Migration Verification

After applying migrations to any environment:

1. **Check Performance Advisor**
   - Navigate to: Supabase Dashboard → Database → Performance
   - Address all WARN-level issues immediately

2. **Common warnings to fix:**
   - `auth_rls_initplan` → Wrap auth functions with SELECT
   - `multiple_permissive_policies` → Consolidate or separate by action
   - `unindexed_foreign_keys` → Add missing indexes

3. **Test queries**
   - Verify RLS policies work as expected
   - Check query performance with EXPLAIN ANALYZE
   - Test CASCADE DELETE operations

### Migration Templates

**Template 1: New table with foreign keys and RLS**
```sql
-- Create table
CREATE TABLE resource_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index ALL foreign keys
CREATE INDEX idx_resource_event_id ON resource_table(event_id);

-- Enable RLS
ALTER TABLE resource_table ENABLE ROW LEVEL SECURITY;

-- Create policies with SELECT-wrapped auth functions
CREATE POLICY "Public read" ON resource_table
  FOR SELECT USING (true);

CREATE POLICY "Users manage own" ON resource_table
  FOR ALL USING (
    user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
  );
```

**Template 2: Fixing existing RLS policies**
```sql
-- Drop old policy
DROP POLICY IF EXISTS "Old policy name" ON table_name;

-- Recreate with SELECT wrapper
CREATE POLICY "New optimized policy" ON table_name
  FOR UPDATE USING (
    user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')
  );
```

**Template 3: Adding missing foreign key indexes**
```sql
-- Add indexes for existing foreign keys
CREATE INDEX IF NOT EXISTS idx_table_foreign_key
  ON table_name(foreign_key_column)
  WHERE foreign_key_column IS NOT NULL; -- for nullable FKs

-- Add comment for documentation
COMMENT ON INDEX idx_table_foreign_key
  IS 'Performance index for foreign key. Improves CASCADE operations and JOINs.';
```

**Template 4: Adding a missing `ON CONFLICT` index**
```sql
-- Required for .upsert(..., { onConflict: "payment_reference" }).
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_reference_unique
  ON public.orders(payment_reference);
```

### Common Pitfalls to Avoid

1. **Forgetting to index foreign keys** - Always add index immediately after table creation
2. **Using bare auth functions** - Always wrap with `(SELECT ...)`
3. **Using FOR ALL liberally** - Break into specific actions to avoid policy overlap
4. **Using partial unique indexes for plain upserts** - Match every `ON CONFLICT` target with a non-partial unique index/constraint
5. **Not testing RLS** - Verify policies work as expected before deploying
6. **Ignoring Performance Advisor** - Check dashboard after every migration

### Database Security Rules

- Privy user identity columns store Privy DIDs/subjects as `text`. Do not add foreign keys from those columns to `auth.users`, and do not guard them with `auth.uid() = user_id`.
- For Privy-owned rows, use the Privy `sub` claim pattern and wrap it for RLS performance: `user_id = (SELECT current_setting('request.jwt.claims', true)::json->>'sub')`.
- New `public.*` tables are server-mediated by default. Grant `service_role` only unless the table is genuinely public, unauthenticated, and non-PII.
- Include explicit grants in the same migration that creates a table or RPC. For server-only tables, use `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.table_name TO service_role;`.
- For server-only RPCs, use `GRANT EXECUTE ON FUNCTION public.function_name(...) TO service_role;`.
- Every PL/pgSQL function, especially trigger functions and `SECURITY DEFINER` functions, must set `search_path = 'public'`.
- Use `SECURITY DEFINER` sparingly and only with a pinned search path. Avoid `SECURITY DEFINER` views; prefer RLS policies or server-mediated access.

### Database Operation Safety

- If multiple DB writes must succeed or fail together, implement them in one PL/pgSQL function/transaction instead of sequential Edge Function queries.
- Treat check-then-act flows across separate queries as race conditions. Put the guard and mutation in the same transaction/function.
- Treat delete-then-insert replacement flows as unsafe unless they are atomic.
- If the core user-facing operation succeeds but a secondary side effect fails, log the secondary failure and preserve the successful result where product behavior allows.
- Preserve error status fidelity: do not mask server failures as 400/403-class client errors.

### References

- See `CLAUDE.md` → Database Performance Best Practices for detailed examples
- Supabase RLS docs: https://supabase.com/docs/guides/database/postgres/row-level-security
- Performance optimization: https://supabase.com/docs/guides/database/database-linter

## Code Comments

Default to no comment. A clear name and a small function are preferred. Add a comment only when it explains a non-obvious why: a hidden constraint, race/atomicity reason, security invariant, upstream workaround, or behavior that would surprise a careful reviewer.

Allowed comments:
- One short line explaining a non-obvious why.
- A durable public reference such as an RFC, EIP, or upstream issue for a workaround.
- Field semantics when the field name cannot reasonably be clearer.
- Required license/SPDX headers.

Forbidden comments:
- Restating what the code already says.
- Banner comments, section dividers, multi-paragraph docstrings, or commented-out code.
- TODO/FIXME/HACK without an owner and tracked ticket URL.
- Author tags, dates, change logs, or references to the current task/PR/caller.
- Secrets, tokens, JWTs, signatures, private RPC URLs, internal hostnames, database connection strings, admin wallet addresses, or real user PII.
- Known weaknesses, bypasses, exploit notes, or unfixed security details in source comments.

Style:
- One short line, sentence case, ending with a period.
- Place it immediately above the line it explains.
- Match the file's comment syntax (`//`, `--`, or `#`).

## Testing Guidelines

- Use Vitest + Testing Library for unit/component coverage.
- Prefer tests next to the behavior they cover when the repo already follows that pattern; otherwise use the existing `tests/*` structure.
- Use `*.test.ts(x)` or `*.spec.ts(x)` filenames.
- Mock Privy, Supabase, network config, wallet providers, and browser APIs through existing test helpers before adding new mocks.
- For edge-function shared code, use `npm run test:edge`.
- For wallet/browser flows, use the existing Cypress/Synpress setup and `npm run test:e2e`.
- Cover authorization failures, wallet mismatch/conflict paths, idempotency, and retry behavior for payment, grant, and wallet-bound flows.
