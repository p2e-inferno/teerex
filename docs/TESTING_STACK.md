# Testing Stack Recommendation (Teerex)

This document records the recommended, repo‑specific testing stack for Teerex. It is intentionally scoped to tools and patterns that fit the current Vite + React + Privy + Supabase Edge Functions (Deno) architecture, without introducing unnecessary complexity.

## Goals

- Add fast, reliable unit and integration tests for the Vite React SPA.
- Validate critical Web3/Privy flows via deterministic mocks.
- Test Supabase Edge Function shared logic in a native Deno environment.
- Add realistic end‑to‑end coverage for wallet + purchase flows via automated MetaMask.
- Ensure Supabase `functions.invoke` and fetch flows are mockable and tested to prevent production regressions.
- Keep setup DRY and scalable for CI/CD.

## Current Stack Constraints

- Frontend is a Vite React SPA using ESM (`"type": "module"`).
- Uses Privy (`@privy-io/react-auth`), wagmi, ethers v6, viem.
- Backend logic is in Supabase Edge Functions (Deno), with shared helpers in `supabase/functions/_shared/**`.
- No Node HTTP server (no Express/Nest/etc.) to test with SuperTest.

## Recommended Testing Stack

### 1) Frontend Unit/Integration Tests

**Core runner**
- `vitest` (native to Vite/ESM; reuses Vite aliases and transforms).
- `jsdom` test environment.

**React testing**
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`

**Mocking**
- Vitest built‑in mocking (`vi.mock`, `vi.fn`).
- Global mocks in `src/test/setup.ts` for:
  - `@privy-io/react-auth` (`usePrivy`, `useWallets`)
  - `@/integrations/supabase/client` (to avoid `import.meta.env` hard‑fail in tests)
- Per‑test overrides when specific scenarios are needed.

**HTTP / Supabase / Edge integration mocking**
- `msw` (Mock Service Worker) to mock:
  - `fetch` calls used by the app.
  - `supabase.functions.invoke()` by intercepting the underlying HTTP requests to `SUPABASE_URL/functions/v1/*`.
- Prefer MSW for integration tests that validate request payloads/headers and app behavior against realistic edge responses, without hitting real Supabase.

### 2) Supabase Edge Functions Tests (Deno)

- Use Deno’s built‑in test runner: `deno test`.
- Focus on pure/shared logic in `supabase/functions/_shared/**`.
  - Co‑locate tests as `*.test.ts` beside helpers.
- Avoid testing full Edge handlers in unit runs because they import remote `https://` deps; instead:
  - Extract pure helpers into `_shared/**` and test them with Deno.
  - Cover handler behavior from the frontend integration suite via MSW mocks (status codes, error shapes, auth headers, idempotency scenarios).

### 3) End‑to‑End Tests (Wallet + MetaMask)

- `synpress` (Cypress + MetaMask automation) for E2E wallet flows.
- Run against a local dev server (`vite preview` or `vite dev`) and a configured MetaMask test wallet.
- Use Synpress to validate:
  - Privy “Connect Wallet” → MetaMask approval → app state updates.
  - Ticket purchase / attest flows up to the point of initiating and confirming a MetaMask transaction.
  - UI behavior on transaction reject/revert (mock edge responses as needed).

Practical notes for Teerex:
- Privy may show a wallet‑selection modal; E2E specs should click “MetaMask” if the modal appears before `cy.acceptMetamaskAccess()`.
- Keep E2E focused on critical paths (connect wallet, buy ticket, view tickets) to limit flake.

### 4) Security / Dependency Checks

- Baseline: `npm audit --audit-level=high` in CI.
- Enable Dependabot (or equivalent) for automatic PRs on vulnerable deps.
- Add Snyk only if you want its dashboard/alerts; not required for correctness.

## Not Recommended Right Now

- **Jest + ts‑jest**: adds ESM/Babel friction in a Vite app; duplicates Vite transforms and aliasing.
- **Hardhat fork by default**: no Hardhat tooling in repo, requires RPC keys, slow/flaky for general CI. Add only if/when contract development or on‑chain regressions become a bottleneck.
- **SuperTest**: no Node server to target.

## Optional Future Add‑Ons

Add only when a concrete need appears:

- **On‑chain integration suite** (read‑only RPC tests):
  - Runs behind env guard, e.g., `RUN_RPC_TESTS=1`.
  - Uses existing ethers ABIs to sanity‑check contract reads on Base/Base Sepolia.
  - Still no Hardhat unless local chain simulation becomes necessary.

- **Additional E2E breadth**:
  - Add Playwright smoke tests for non‑wallet flows if you want faster/less flaky coverage alongside Synpress.

## Proposed Dependency List

Add to `devDependencies`:

- `vitest`
- `jsdom`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`
- `msw`
- `synpress`

Optional later:

- `playwright`

## Summary

This stack fits Teerex’s Vite/ESM frontend and Deno Edge backend, giving you quick feedback, low flake rates, and minimal config overhead. It sets a clean foundation for scaling coverage and CI without committing to heavyweight Web3 E2E or local chain simulation prematurely.
