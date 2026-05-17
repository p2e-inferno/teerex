# Agents Guide for Teerex

This repo uses Supabase Edge Functions for Paystack → Unlock ticket issuance.
Follow these notes when updating or deploying.

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

### Pre-Migration Checklist

Before committing any migration file, verify:

- [ ] All `CREATE TABLE` statements with foreign keys have corresponding indexes
- [ ] All RLS policies wrap `current_setting()`/`auth.*()` with `(SELECT ...)`
- [ ] No `FOR ALL` policies overlap with specific action policies (SELECT/INSERT/UPDATE/DELETE)
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

### Common Pitfalls to Avoid

1. **Forgetting to index foreign keys** - Always add index immediately after table creation
2. **Using bare auth functions** - Always wrap with `(SELECT ...)`
3. **Using FOR ALL liberally** - Break into specific actions to avoid policy overlap
4. **Not testing RLS** - Verify policies work as expected before deploying
5. **Ignoring Performance Advisor** - Check dashboard after every migration

### References

- See `CLAUDE.md` → Database Performance Best Practices for detailed examples
- Supabase RLS docs: https://supabase.com/docs/guides/database/postgres/row-level-security
- Performance optimization: https://supabase.com/docs/guides/database/database-linter
