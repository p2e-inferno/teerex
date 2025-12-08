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
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key (safe for client)
- `VITE_PRIVY_APP_ID` - Privy app ID for authentication

Server-side only (Edge Functions):
- `SUPABASE_SERVICE_ROLE_KEY` - For edge functions (sensitive)
- `PAYSTACK_SECRET_KEY` - Payment processing (sensitive)
- `UNLOCK_SERVICE_PRIVATE_KEY` - Smart contract interactions (sensitive)
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

2. **Crypto**:
   - Free: Direct `purchase()` call with value=0
   - ETH: User approves + calls `purchase()` with ETH value
   - USDC: User approves ERC20 + calls `purchase()` with token transfer
   - Gasless (planned): Server sponsors gas via edge functions

### Database Schema (Supabase)
Key tables:
- `events`: Published events with lock_address, chain_id, creator_id
- `event_drafts`: Unpublished drafts
- `tickets`: Issued tickets (owner_wallet, token_id, tx_hash)
- `paystack_transactions`: Fiat payment records with reference and status
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

### Network Configuration
- **Chains**: Base Mainnet (8453) and Base Sepolia (84532)
- **RPC URLs**: Stored in `network_configs` table, accessed dynamically
- **USDC Addresses**: Chain-specific, retrieved from `getUsdcAddress()` in `src/lib/config/network-config.ts`
- **Explorer Links**: Generated via `getExplorerTxUrl(chainId, txHash)`

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
```typescript
import { supabase } from '@/integrations/supabase/client';
import { usePrivy } from '@privy-io/react-auth';

const { getAccessToken } = usePrivy();
const accessToken = await getAccessToken();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const { data, error } = await supabase.functions.invoke('function-name', {
  body: { /* request payload */ },
  headers: {
    Authorization: `Bearer ${anonKey}`,
    'X-Privy-Authorization': `Bearer ${accessToken}`,
  },
});
```

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
- Edge functions return `{ ok: boolean, error?: string, ... }` structure
- Client-side uses try/catch with toast notifications (sonner)
- Validation errors shown inline on forms
- Network errors prompt for retry

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
1. Create folder: `supabase/functions/new-function/`
2. Add `index.ts` with Deno serve handler
3. Use `_shared/cors.ts` for CORS headers
4. Implement Privy JWT verification pattern from existing functions
5. Return JSON responses with proper CORS headers
6. Test locally with Supabase CLI

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

### 4. Migration Checklist for Performance

Before finalizing any migration that creates or modifies tables with RLS:

- [ ] All foreign key columns have indexes
- [ ] All RLS policies wrap `current_setting()`/`auth.*()` with `(SELECT ...)`
- [ ] No overlapping `FOR ALL` policies with specific action policies
- [ ] Partial indexes used for nullable columns (`WHERE column IS NOT NULL`)
- [ ] Complex policies use `EXISTS` subqueries efficiently
- [ ] Indexes on columns frequently used in WHERE clauses or JOINs

### 5. Testing for Performance Issues

After applying migrations, check Supabase Performance Advisor:

1. Navigate to: Supabase Dashboard → Database → Performance
2. Look for warnings:
   - `auth_rls_initplan` - Fix by wrapping auth functions with SELECT
   - `multiple_permissive_policies` - Consolidate or separate by action
   - `unindexed_foreign_keys` - Add missing indexes
3. Address all WARN-level issues before deploying to production

### 6. Common RLS Patterns

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
