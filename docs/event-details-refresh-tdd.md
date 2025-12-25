# Event Details “Post-Purchase Refresh” (TDD + Implementation Guide)

This document captures the context, decisions, and current repo state for the “EventDetails should update after purchase without manual refresh” workstream. It is intended to allow another agent (or future me) to continue from here, run tests, fix issues that arise, and complete the implementation in a DRY/scalable way.

## 1) Problem Statement

After a successful ticket purchase / claim, the UI on `EventDetails` did not update until the user manually refreshed the page. This is not ideal because multiple sections are gated on “user has key” (e.g., discussions, attestations, ticket card actions).

Repo UX principle from `AGENTS.md`: prefer optimistic/localized updates + background refetch; avoid full reloads.

## 2) Key Architectural Decision

Prefer a localized refresh mechanism over full page reload.

### Option A (chosen): Refresh Context “Signal”

Introduce a small `EventDetailsRefreshProvider` that exposes:
- `refreshToken: number` (monotonic counter)
- `triggerRefresh(): void` (increments refreshToken)

Child components that need to refresh can “listen” to `refreshToken` and rerun their internal `refetch` / `load*` functions.

Why this scales:
- Avoids prop drilling (provider can be used directly by new components).
- Any new gated component can hook into the signal in one `useEffect`.
- Avoids forcing everything into React Query immediately.

## 3) Existing Findings (Background)

Earlier regressions fixed (already implemented in repo):
- Gasless purchase edge error due to sending invalid JSON payload.
- Divvi SDK v2 tag formatting (tag returned without `0x`) causing invalid-hex.
- Privy/approve flow crash “Buffer is not defined” fixed via browser Buffer polyfill.
- Migration: “free is a payment method” (via `event.payment_methods`) not `event.currency === 'FREE'`.

These are not the focus of this doc, but they explain why ticket purchase/claim code paths were recently touched.

## 4) Current Code State (What’s Already Done)

### 4.1 `EventPurchaseDialog` now supports a purchase-success callback

File: `src/components/events/EventPurchaseDialog.tsx`
- Added optional prop `onPurchaseSuccess?: (opts?: { increment?: boolean }) => void`
- Called after:
  - Successful wallet purchase (increment: true)
  - Gasless success (increment: true)
  - Gasless “already claimed” (increment: false) to avoid double increment

### 4.2 `EventDetails` currently refreshes ticket balance only

File: `src/pages/EventDetails.tsx`
- Added `refetch: refetchTicketBalance` from `useTicketBalance(...)`
- Added `handlePurchaseSuccess(opts)`:
  - Optimistically updates `userTicketCount`
  - Calls `refetchTicketBalance()`
- Wired into:
  - `<EventPurchaseDialog ... onPurchaseSuccess={handlePurchaseSuccess} />`

**Important**: this does not yet refresh the other gated sections (discussions, attendees list, attestation stats). This is what Option A is meant to solve.

### 4.3 Minimal Refresh Context module exists (to allow tests to compile)

File: `src/pages/event-details/eventDetailsRefresh.tsx`
- Exports `EventDetailsRefreshProvider` + `useEventDetailsRefresh`
- Currently not used by `EventDetails` or children (intentionally left for TDD).

## 5) What Needs to Refresh on Purchase Success (EventDetails composition)

From `src/pages/EventDetails.tsx`:

### Gated by “has key / hasTicket”
- `EventInteractionsCard` (`src/components/interactions/core/EventInteractionsCard.tsx`)
  - Uses `useTicketVerification` (React Query) for `hasTicket`
  - Uses `useEventPosts` (manual fetch, local state) for discussions list

### Indirectly gated by ticket holder UI
- Ticket Card section (buttons and attendance toggles)
  - Uses `userTicketCount` (derived from `useTicketBalance`)

### Attestation-related
- `EventAttestationCard` (`src/components/attestations/EventAttestationCard.tsx`)
  - Uses internal `loadStats` function and local state
  - Receives `userHasTicket` prop; it flips with `userTicketCount > 0`
  - Still needs stats refresh after purchase

- `AttendeesList` (`src/components/attestations/AttendeesList.tsx`)
  - Uses internal `loadAttendees` function and local state
  - Should refresh after purchase if attendance schema is configured / relevant

### Ticket counts
- `useEventTicketRealtime` provides `refreshTicketCount` (on-chain count)

### Fiat issuance flow
- `TicketProcessingDialog` polls `get-transaction-status` and sets `status="success"`
  - Currently it does NOT notify `EventDetails` to refresh gated UI on success

## 6) Intended Implementation Plan (Option A, detailed)

### Step A — Wire the provider at the page boundary
File: `src/pages/EventDetails.tsx`
- Wrap the page JSX (or return root) with `<EventDetailsRefreshProvider>`.
- Use `useEventDetailsRefresh()` inside the page to get:
  - `refreshToken`
  - `triggerRefresh`

### Step B — Centralize “purchase succeeded” handler
File: `src/pages/EventDetails.tsx`
Extend `handlePurchaseSuccess` to:
- Optimistically adjust `userTicketCount` (already done)
- Background refetch `refetchTicketBalance()` (already done)
- Call `refreshTicketCount()` from `useEventTicketRealtime` (optional but recommended)
- Call `triggerRefresh()` to inform children

### Step C — Make gated children listen to `refreshToken`
Two design variants:

**Variant 1 (prop-based)**:
- Add optional `refreshToken?: number` prop to each of:
  - `EventInteractionsCard`
  - `EventAttestationCard`
  - `AttendeesList`
- In each component:
  - add `useEffect(() => { ...refresh... }, [refreshToken])`

**Variant 2 (context-based)**:
- Import `useEventDetailsRefresh` in those components and use `refreshToken` directly.
- This avoids prop drilling but introduces cross-module coupling (acceptable if scoped to EventDetails tree).

### Step D — TicketProcessingDialog should also trigger refresh on success
File: `src/components/events/TicketProcessingDialog.tsx`
- Add prop `onPurchaseSuccess?: () => void`
- When `isKeyGranted` is true and status becomes success:
  - call `onPurchaseSuccess?.()`
- Then in `EventDetails`, pass it down and route it to the same `handlePurchaseSuccess` (or to `triggerRefresh()` + ticket refetch).

## 7) TDD Test Suite (What’s Been Written)

Because this environment cannot run vitest (see Section 8), tests were written “TDD-first” to guide implementation.

### 7.1 Unit test: refresh context
File: `tests/unit/pages/eventDetailsRefresh.test.tsx`
Asserts:
- `triggerRefresh` increments `refreshToken`
- Hook throws outside provider with a clear error message

### 7.2 Unit test: EventInteractionsCard reacts to refreshToken
File: `tests/unit/components/EventInteractionsCard.refreshToken.test.tsx`
Asserts (expected red until implemented):
- When `refreshToken` changes, card calls:
  - `useTicketVerification().refetch()`
  - `useEventPosts().refetch()`

Important: depending on module resolution, mocks may need to match the exact import specifiers used by `EventInteractionsCard` (it imports hooks via relative paths). If this test fails by running real hooks, adjust mocks to target the actual module id.

### 7.3 Unit test: TicketProcessingDialog calls onPurchaseSuccess
File: `tests/unit/components/TicketProcessingDialog.onPurchaseSuccess.test.tsx`
Asserts (expected red until implemented):
- When `get-transaction-status` returns `key_granted: true`, the dialog:
  - updates UI to “Ticket Issued Successfully!”
  - calls `onPurchaseSuccess`

### 7.4 Integration-ish test: EventDetails wiring
File: `tests/integration/pages/EventDetails.refreshToken.test.tsx`
Mocks most heavy dependencies (event loader, lock utils, attestation hooks, etc).
Asserts:
- Clicking “Get Ticket” opens mocked purchase dialog.
- Clicking “simulate purchase success” triggers:
  - `useTicketBalance().refetch()` (already implemented, should pass)
  - And (TDD expectation) that `refreshToken` is passed to `EventInteractionsCard` (expected to fail until Option A is wired).

## 8) Known Constraint: Tests Cannot Run in This Agent Environment

In this Codex harness on Windows, anything that requires Vite/Vitest config bundling fails with:
- `Error: spawn EPERM`
This appears to be an environment restriction around `child_process.spawn` (esbuild service), not repo code.

Workaround:
- Run tests on a normal dev machine environment (or a different agent environment) where `npm run test:unit` works.

## 9) Guidance for the Next Agent Running Tests

### Expected test outcomes before implementation
- Context test should pass (module exists and is simple).
- EventDetails wiring test should:
  - pass for `ticketBalanceRefetch` (already implemented)
  - fail for refreshToken propagation (until implemented)
- EventInteractionsCard refresh test should fail until implemented.
- TicketProcessingDialog test should fail until `onPurchaseSuccess` prop is added and invoked on success.

### If EventInteractionsCard refresh test fails due to real hooks executing
Symptoms:
- “No QueryClient set” error (React Query) or unexpected network calls.
Fix:
- Ensure mocks match the component’s import specifiers. `EventInteractionsCard` imports hooks like:
  - `../hooks/useEventPosts`
  - `../hooks/useTicketVerification`
So the test may need to mock those relative specifiers, or mock the resolved module id.

### If TicketProcessingDialog test is flaky
Use:
- `vi.useFakeTimers()`
- `vi.advanceTimersByTime(3000)`
- `waitFor(...)` to allow state updates to flush

## 10) Next Implementation Steps (after tests are runnable)

1) Implement provider usage in `src/pages/EventDetails.tsx` and expose `refreshToken`/`triggerRefresh`.
2) Add `refreshToken` listener logic to:
   - `src/components/interactions/core/EventInteractionsCard.tsx`
   - `src/components/attestations/EventAttestationCard.tsx`
   - `src/components/attestations/AttendeesList.tsx`
3) Add `onPurchaseSuccess` prop to `src/components/events/TicketProcessingDialog.tsx` and call it on success.
4) Wire TicketProcessingDialog’s success callback in `src/pages/EventDetails.tsx`.
5) Run tests and iterate until green.

## 11) Repo State Notes

Running `npm run typecheck` succeeds in this environment.

To see modified files:
- `git status --porcelain=v1`

