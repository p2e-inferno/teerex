# Spec: TeeRex Rewards Controller V1

Status: Draft for review
Owner: Teerex Platform
Scope: On-chain prize escrow for tournaments/events — `TeeRexRewardsControllerV1` contract, Supabase mirror, edge functions, frontend surface.
Out of scope (deferred to v2+): per-position Unlock locks, on-chain winner credentials (EAS), bonded/slashing disputes, decentralized arbitration, team-member auto-splitting, top-ups, multi-asset pools.

---

## 1. Summary

Enable an event/tournament organizer to **prefund a prize pool on-chain** and have it **pull-claimed by declared winners** after the event, with terms that are immutable once funded and publicly readable so participants can verify the promised prize exists and how it will be distributed.

The contract is a **pure escrow**. It holds ETH or one allowlisted ERC20 per pool, stores an immutable fixed payout schedule (absolute amounts per placement), lets the creator and delegated managers assign winners, and lets winners pull their share during a time-boxed claim window. The creator is fully locked out of the funds during the claim window and can never drain the contract. A mandatory pre-claim challenge window plus a ticket-holder dispute path with arbitrator intervention provides bounded recourse.

The contract deliberately copies the proven patterns of `TeeRexTicketPassControllerV1`: non-upgradeable, `Ownable` + `ReentrancyGuard` + `SafeERC20`, owner-managed asset allowlist, immutable per-entry terms, and an explicit **no owner drain** invariant.

---

## 2. Goals / Non-goals

### Goals
- Prefund a prize pool whose **funded amount and distribution are immutable and on-chain-readable**.
- **Pull-based** claims by declared winners; no push, no batch payout gas borne by the organizer.
- **Creator cannot reclaim** during the claim window; **no owner/arbitrator drain** path ever.
- Bounded, accessible recourse: a **30h+ challenge window**, a free ticket-holder dispute that can hold the contested payout, and an arbitrator that can freeze/correct without moving funds to itself.
- Loose, **version-pinned, read-only** integration with the attendance controller for an optional early-exit on cancelled protected events.
- Supabase mirror of on-chain-verified state for fast listing and rich UI, following the repo's server-mediated data-access rules.

### Non-goals
- Determining who won. The organizer declares winners; the contract guarantees funds + terms, not placements (see §4).
- Replacing the attendance controller's lifecycle/refund logic. Rewards escrow and ticket-price escrow are **independent**.
- Issuing tickets or managing event locks. The controller never deploys or manages an event lock.

---

## 3. Trust model & guarantees

**What the contract guarantees to participants:**
1. The prize is fully funded at creation; `sum(positionAmounts) == totalFunded` is enforced.
2. Terms (asset, amounts, placements, claim window) are immutable after creation.
3. During `[claimStart, claimEnd]` the creator cannot withdraw; assigned winners can pull their exact share.
4. The contract has no owner/arbitrator path that sends escrow to the owner/arbitrator or any arbitrary address.
5. A claimed position is final and irreversible.

**What it does NOT and cannot guarantee:**
- The organizer's choice of winners. Assignment authority (creator + delegated managers) decides placements; that authority can, by design, direct a prize to a chosen address. This is the irreducible trust boundary — the contract secures the **money** and the **terms**, not the **judgment**.

**Documentation registers** (do not conflate):
- **UI (users):** marketing-clean, truthful line — "Prize locked on-chain · pays out to the organizer's declared winners. Ticket holders who believe results are wrong can raise a dispute." Never publish the vector.
- **Code comments:** positive invariants only (e.g. "entitlement is snapshotted at assignment; claims do not re-check key validity"). Per the repo comment standard, never describe a bypass in source.
- **Threat model:** the blunt residual lives in this doc (§14) and an internal security doc — not in shipped UI, not in source comments.

---

## 4. Architecture overview

```
Creator wallet ──createRewardPool()──▶ TeeRexRewardsControllerV1 (escrow, immutable terms)
                                          │   reads (view-only):
   Event lock (PublicLock V14/V15) ◀──────┤  balanceOf, totalSupply
   Attendance controller (optional) ◀─────┘  eventConfigByLock (cancel/refund flags)

Managers ──assignWinners()──▶ controller (snapshot eligibility)
Winners  ──claim()──────────▶ controller (pull share after window)
Arbitrator ─freeze/void/reassign/extend─▶ controller (no drain)

Edge functions (service_role) ──verify on-chain, then mirror──▶ Supabase tables
Frontend (Privy) ──callEdgeFunction──▶ edge functions ; ──wallet tx──▶ controller
```

- **Pure escrow.** The reward funds live in the controller, never in the event lock. The creator's lock-manager rights over the event lock give zero power over the escrow.
- **Independence from the event lock.** Eligibility is **snapshotted at assignment** (§8). Once a winner is assigned, the creator's ongoing event-lock powers (expire/revoke/grant keys) cannot touch that winner's claim, because the claim path does not re-read the lock.
- **Attendance controller = read-only oracle** for one optional early-exit path (§11), version-pinned per pool and allowlist-bound to prevent spoofing.
- **Supabase = indexed mirror.** Every DB row is written by an edge function only after the field is verified against on-chain state.

---

## 5. Verified Unlock integration facts

These were confirmed against the local Unlock source and drive several design choices:

- `balanceOf(account)` returns **valid keys only**, not historical ownership (`PublicLockV15.sol`). → eligibility must be snapshotted, not re-checked late.
- Non-transferable = `transferFeeBasisPoints >= 10_000`; it blocks `transferFrom` and `shareKey` for non-managers, but **lock managers bypass it**, and **`lendKey` skips the check entirely** in both V14 and V15. → the `balanceOf` assignment gate is a guardrail, not a guarantee.
- **No on-chain manager enumeration** exists (only `isLockManager(address)`, `addLockManager`, `renounceLockManager`). → "creator is sole manager" is unverifiable; do not build designs that depend on it.
- The attendance controller **releases lock-manager back to the creator** before the reward window (`releaseManagerToCreator`) and sets `transferFeeBasisPoints = 0` on success (`POST_RELEASE_TRANSFER_FEE_BPS = 0`). → protected events are transferable during the reward window; a hard non-transferable gate at assignment would revert on them, so it is dropped.
- The event lock has **no event-end timestamp** (only `expirationDuration` and per-key `expirationTimestamp`). → `claimStart > eventEnd` cannot be enforced on-chain; the contract enforces `claimStart > block.timestamp` and the edge function/UI enforces `claimStart >= event_end`.

---

## 6. Smart contract: `TeeRexRewardsControllerV1`

Solidity `^0.8.21`, OpenZeppelin v5.6.1 (`ReentrancyGuard`, `Ownable`, `IERC20`, `SafeERC20`). Non-upgradeable; versioned by redeploy (the `V1` suffix). Mirrors `TeeRexTicketPassControllerV1` structure.

### 6.1 Roles
- `owner` (cold, rare) — protocol config: `setAllowedPayoutToken`, `setAllowedAttendanceController`, `setArbitrator`. Inherited from `Ownable`.
- `arbitrator` (hot, per-dispute; should be a multisig distinct from `owner`) — `freeze`/`unfreeze`, `voidAssignment`, `reassign`, `extendClaimEnd`, `resolveDispute`. **No config power, no fund movement to itself.**

Separation rationale: least privilege/blast radius (the dispute key signs often), operational delegation, and forward-compat — decentralizing arbitration in v2 is a single `setArbitrator(courtContract)` call, no migration.

### 6.2 Constants
```solidity
uint16  constant BASIS_POINTS_DEN     = 10_000;
uint64  constant MIN_CHALLENGE_WINDOW = 30 hours;   // contract floor
uint64  constant MAX_DISPUTE_HOLD     = 5 days;      // free per-position hold cap
uint64  constant MIN_CLAIM_DURATION   = 7 days;      // claimEnd - claimStart floor
uint64  constant MAX_FREEZE_BACKSTOP  = 30 days;     // past claimEnd; bounds arbitrator hold
uint16  constant MAX_POSITIONS        = 200;
uint16  constant MAX_ASSIGN_BATCH     = 50;
```

### 6.3 Data model
```solidity
struct Pool {
    address  creator;            // only address that can close/reclaim
    address  eventLock;          // PublicLock V14/V15 of the associated event
    address  attendanceController; // address(0) = non-protected; else allowlisted + exists-bound
    address  payoutToken;        // address(0) = native ETH, else allowlisted ERC20
    uint256  totalFunded;        // == sum(positionAmounts), immutable
    uint64   claimStart;
    uint64   claimEnd;           // base end; effective end = claimEnd + frozenAccrued
    uint64   challengeWindow;    // >= MIN_CHALLENGE_WINDOW
    uint16   positionCount;
    uint16   assignedCount;
    bool     frozen;
    bool     closed;
    uint64   frozenAt;           // 0 when not frozen
    uint64   frozenAccrued;      // total frozen duration, added to effective claimEnd
    bytes32  rulesHash;          // anchors off-chain qualifying rules shown in UI
}

struct Position {
    uint256 amount;       // immutable share for this placement
    address winner;       // address(0) until assigned
    uint64  assignedAt;
    uint64  holdUntil;    // free dispute hold expiry (0 = none)
    bool    freeHoldUsed; // a free dispute hold may be applied once per position
    bool    claimed;
    bool    reclaimed;    // creator reclaimed this share; mutually exclusive with claimed
    uint64  claimedAt;
}

uint256 public nextPoolId;
mapping(uint256 => Pool) internal pools;   // read via getPool(poolId) returns (Pool); a 17-field
                                           // public auto-getter exceeds the legacy stack limit
function getPool(uint256 poolId) external view returns (Pool memory);
mapping(uint256 => mapping(uint16 => Position)) public positions;   // poolId => placement(1-based) => Position
mapping(uint256 => mapping(address => bool))    public managers;    // assign-only, per pool
mapping(uint256 => mapping(address => bool))    public isAssigned;  // one placement per address
mapping(address => bool) public allowedPayoutToken;
mapping(address => bool) public allowedAttendanceController;
address public arbitrator;
```

Multiple pools per `eventLock` are allowed (keyed by `poolId`): an event can carry an ETH main pool + a token side-prize, etc.

### 6.4 Creation
```solidity
struct CreateRewardPoolParams {
    address eventLock;
    address attendanceController;  // zero for non-protected
    address payoutToken;           // zero for ETH
    uint256[] positionAmounts;     // absolute amounts, 1-based placements; each > 0
    uint64 claimStart;
    uint64 claimEnd;
    uint64 challengeWindow;
    bytes32 rulesHash;
    address[] initialManagers;
}

function createRewardPool(CreateRewardPoolParams calldata p)
    external payable nonReentrant returns (uint256 poolId);
```
Validation (revert on any failure):
- `IPublicLock(p.eventLock).isLockManager(msg.sender)` — **creator auth anchor** (gasless deploy adds creator as lock manager; client deploys make creator the manager). Paired with edge-function `validateUserWallet`.
- `p.eventLock` is a contract exposing `isLockManager`/`balanceOf`/`totalSupply` (probe).
- `p.attendanceController == address(0)` **or** (`allowedAttendanceController[p.attendanceController]` **and** `IAttendance(p.attendanceController).eventConfigByLock(p.eventLock).exists == true`). Binds the oracle to a trusted, real protection contract for this lock (prevents a spoofed early-exit oracle).
- `p.payoutToken == address(0)` **or** `allowedPayoutToken[p.payoutToken]` (allowlist excludes fee-on-transfer/rebasing tokens).
- `1 <= positionAmounts.length <= MAX_POSITIONS`; every `amount > 0`.
- `p.claimStart > block.timestamp`; `p.claimEnd >= p.claimStart + MIN_CLAIM_DURATION`; `p.challengeWindow >= MIN_CHALLENGE_WINDOW`.
- Funding match: ETH → `msg.value == sum(positionAmounts)`; ERC20 → `safeTransferFrom(msg.sender, this, sum)` and assert `balanceAfter - balanceBefore == sum` (belt-and-suspenders against unexpected transfer behavior).
- Register `initialManagers` (dedup, non-zero).

`rulesHash` is the keccak256 of the off-chain reward-rules document the UI renders; it makes the qualifying rules tamper-evident (amounts are already on-chain).

### 6.5 Manager management
```solidity
function addManager(uint256 poolId, address m) external;       // creator only
function removeManager(uint256 poolId, address m) external;    // creator only
function renounceManager(uint256 poolId) external;             // manager removes self
```
Managers can **only** assign winners. They cannot fund, close, reclaim, change terms, freeze, or resolve disputes. Removing a manager does not undo assignments they already made.

### 6.6 Winner assignment (snapshot eligibility)
```solidity
struct WinnerAssignment { address account; uint16 placement; } // placement 1-based

function assignWinners(uint256 poolId, WinnerAssignment[] calldata a) external; // creator or manager
```
Atomic batch (one bad row reverts all). `a.length <= MAX_ASSIGN_BATCH`. Per row:
- caller is creator or `managers[poolId][caller]`;
- pool not `frozen`/`closed`;
- `1 <= placement <= positionCount`;
- `account != address(0)`;
- `IPublicLock(pool.eventLock).balanceOf(account) > 0` — **ticket-holder gate, evaluated once here and snapshotted**;
- `positions[poolId][placement].winner == address(0)` (empty) — replacement only via `block.timestamp < claimStart` path below;
- `!positions[poolId][placement].reclaimed` — a placement whose escrow was already reclaimed is **settled/terminal** and reverts `AlreadyClaimed`; the arbitrator's `extendClaimEnd` reopens the assignment cutoff but never resurrects a reclaimed placement;
- **initial assignment cutoff**: an empty placement may only be assigned while `block.timestamp <= pool.claimEnd + pool.frozenAccrued`; past that it reverts `AssignmentWindowClosed`. This bounds a placement's per-position end (§6.7) and forces a genuinely-late result through the arbitrator's `extendClaimEnd` before any winner is recorded — so a late assignment can never create a prize that opens after it could ever be claimed;
- `!isAssigned[poolId][account]` (one placement per address);
- writes `winner`, `assignedAt = block.timestamp`, sets `isAssigned`, increments `assignedCount`.

**Replacement** is allowed only before `claimStart` and only on an **unclaimed** placement (clears old `isAssigned`, sets new). After `claimStart` an assigned placement is locked; correcting it requires the arbitrator (dispute path). Claimed placements are never replaceable. The cutoff above applies only to *initial* assignment of an empty placement, not to replacement (which the earlier `claimStart` gate already bounds).

No transfer-fee check at assignment (released protected events run at fee 0). No `balanceOf` re-check at claim. The gate is a soft guardrail against honest mistakes and a lone rogue manager (a manager who is not a lock manager cannot grant or lend keys, so routing a prize to a non-participant requires a colluding ticket holder).

### 6.7 Challenge window + claim
Effective timing is **per-placement at both ends**:
```
poolEnd                  = pool.claimEnd + pool.frozenAccrued
effectiveClaimStart(pos) = max(pool.claimStart, pos.assignedAt + pool.challengeWindow, pos.holdUntil)
normalClaimEnd(pos)      = max(poolEnd, effectiveClaimStart(pos) + MIN_CLAIM_DURATION)
effectiveClaimEnd(pos)   = normalClaimEnd(pos), plus a bounded post-backstop grace if an active freeze interrupted it
```
```solidity
function claim(uint256 poolId, uint16 placement) external nonReentrant;
function positionClaimEnd(uint256 poolId, uint16 placement) external view returns (uint256); // per-placement end
```
Requires: `pos.winner == msg.sender`; `!pos.claimed`; `!pos.reclaimed`; freeze no longer blocks (`block.timestamp > poolEnd + MAX_FREEZE_BACKSTOP`) or pool not frozen; `!pool.closed`; `block.timestamp >= effectiveClaimStart(pos)`; `block.timestamp <= effectiveClaimEnd(pos)`. Effects-before-interaction: set `pos.claimed = true`, `pos.claimedAt`, then pay via `safeTransfer` (ERC20) or `call{value:}` (ETH) and revert on failure. Winners may be contracts (team multisig); a recipient that reverts on receive simply stays unclaimed and returns to the creator after `effectiveClaimEnd(pos)`.

**Per-position guarantee.** Because the end is `max(pool end, start + MIN_CLAIM_DURATION)`, every validly-assigned winner is guaranteed at least `MIN_CLAIM_DURATION` of claimable time after their effective start — even when a late assignment or a dispute hold pushes that start to/past the pool-level end. If an active freeze started before that normal end and the arbitrator never unfreezes, the winner gets one bounded post-backstop grace: until `poolEnd + MAX_FREEZE_BACKSTOP + MIN_CLAIM_DURATION`. A freeze that starts after the winner's normal claim window already expired does not reopen it. The challenge window thus converts the dispute race into a deterministic review period **without ever timing out a legitimate winner**: in the happy path the organizer assigns before `claimStart`, so `effectiveClaimStart + MIN_CLAIM_DURATION <= claimEnd`, the per-position end equals the pool end, and behavior is unchanged (zero extra delay); a late/held/interrupted assignment carries its own guaranteed window, and reclaim of that placement is blocked until it lapses (§6.9). Winner safety no longer depends on the arbitrator extending `claimEnd` in time.

### 6.8 Disputes & arbitration
```solidity
function raiseDispute(uint256 poolId, uint16 placement, bytes32 reasonHash, uint64 holdDuration) external; // ticket holder
function freeze(uint256 poolId) external;        // arbitrator
function unfreeze(uint256 poolId) external;      // arbitrator
function voidAssignment(uint256 poolId, uint16 placement) external;             // arbitrator, open pool, unsettled only
function reassign(uint256 poolId, uint16 placement, address newWinner) external; // arbitrator, open pool, unsettled only
function extendClaimEnd(uint256 poolId, uint64 newEnd) external;                // arbitrator, open pool, increase-only
function resolveDispute(uint256 poolId, uint16 placement, bool upheld, bytes32 resolutionHash) external; // arbitrator
```

- **`raiseDispute`** — caller must hold a ticket (`balanceOf(caller) > 0`). It is a **free signal**; it does not freeze the pool. If `placement != 0`, the position is unclaimed, and it is still pre-claim (`block.timestamp < effectiveClaimStart` ignoring holdUntil) and `!freeHoldUsed`, it applies the requested one-time per-position hold, capped to `MAX_DISPUTE_HOLD`: `holdUntil = block.timestamp + min(holdDuration, MAX_DISPUTE_HOLD)`. A too-short hold that cannot reach the natural claim open is inert and does not consume `freeHoldUsed`. This gives a dispute immediate teeth over the **specific contested payout** during the window where value has not left, without enabling a pool-wide DoS. After the hold lapses the placement opens regardless; further holds require the arbitrator. Emits `DisputeRaised`.
- **`freeze`/`unfreeze`** — pause all claims and reclaims until the backstop. `freeze` records `frozenAt`; `unfreeze` adds `block.timestamp - frozenAt` to `frozenAccrued` so winners do not lose claim time. Freeze cannot hold past `poolEnd + MAX_FREEZE_BACKSTOP`; after that, never-assigned funds flow normally and assigned winners whose open window was interrupted get the bounded post-backstop grace in §6.7.
- **`voidAssignment` / `reassign`** — correct a wrong/contested placement; `reassign` still requires `balanceOf(newWinner) > 0`. Maintains `isAssigned`/`assignedCount`. Both reject a **settled** placement (`claimed` or `reclaimed` → `AlreadyClaimed`) and any operation on a **closed** pool (`PoolIsClosed`) — a placement whose escrow was already paid out (to a winner or back to the creator) is terminal and must not be re-targeted into an unclaimable state.
- **Settled/closed are terminal for all arbitration & assignment.** `assignWinners`, `reassign`, and `voidAssignment` reject a `reclaimed` placement (`AlreadyClaimed`); `reassign`, `voidAssignment`, and `extendClaimEnd` reject a closed pool (`PoolIsClosed`). This mirrors `claim`/`reclaim`, which already skip settled placements, so no path can record a winner against returned escrow.
- **Hard limits:** the arbitrator can never move escrow to itself or an arbitrary address, change `positionAmounts`, or touch a claimed/reclaimed (settled) placement.

Outcomes: **Rejected** → unfreeze/clear hold, claims proceed; **Upheld–correctable** → void/reassign, then proceed; **Upheld–catastrophic** → max remedy is "don't pay the bad assignments" + freeze within backstop; ticket-price refunds are the attendance controller's domain, beyond that it is reputation/off-chain recourse (stated plainly).

Bonded/slashing disputes are **v2**, introduced only alongside decentralized arbitration (a bond secures a trustless court; under a single trusted arbitrator it taxes the wrong party and adds discretion, not decentralization).

### 6.9 Close / reclaim
```solidity
function closePool(uint256 poolId) external nonReentrant;   // creator only; full reclaim, pre-tickets/early-exit
function reclaim(uint256 poolId) external nonReentrant;     // creator only; after effectiveClaimEnd
```

`reclaim` is **per-position and partial**: it iterates placements and sweeps only those whose funds are reclaimable *now*, summing them into one transfer. Never-assigned shares are reclaimable once `block.timestamp > pool.claimEnd + frozenAccrued`; an assigned-unclaimed share only once `block.timestamp > effectiveClaimEnd(pos)` (§6.7). Each swept placement is marked `reclaimed`; the pool is marked `closed` only when every share is settled (claimed or reclaimed). A claimed placement is never reclaimable and vice-versa.

| State | Creator action |
|---|---|
| `block.timestamp < claimStart && totalSupply(eventLock) == 0 && assignedCount == 0` | `closePool` → full reclaim (mistake / flopped event; any event type) |
| Protected: `attendanceController != 0 && cfg.cancelInitiated && cfg.refundComplete && assignedCount == 0` | `closePool` → **early exit before claimEnd** (no time gate; protection state is creator-unspoofable) |
| Any ticket exists OR any winner assigned, before that share's end, not an early-exit state | locked |
| `frozen` (within backstop, measured against pool end) | locked |
| `frozen` past backstop | `reclaim` can sweep never-assigned shares; assigned-unclaimed shares remain locked until their post-backstop grace ends |
| After pool end, not frozen | `reclaim` → never-assigned + assigned-unclaimed placements **whose own `effectiveClaimEnd(pos)` has passed** (partial; callable again as later placements lapse) |
| Nothing currently reclaimable but locked placements remain | `reclaim` reverts `NotYetReclaimable` |
| Every share settled | `reclaim` reverts `NothingToPay`. On-chain `closed` is set only when a creator action (closePool / a fully-settling reclaim) drained the escrow; a pool drained entirely by **winner claims** stays `closed == false` and the mirror derives the distinct terminal status `claim_complete` (§8) — "closed" means the creator closed it, not "all winners paid" |

There is no perpetual lock of unassigned funds: the anti-rug guarantee is the escrow + immutable terms + full window lockout, not punishing the creator's own money forever. A creator who funds and never assigns winners is committing a public, auditable rug — a dispute/reputation matter, not a contract-stuck-funds matter. Partial reclaim also isolates a late/held placement: the creator can recover their on-time funds without waiting on, and without being able to strand, the late winner.

### 6.10 Events
```
PoolCreated(poolId, creator, eventLock, payoutToken, totalFunded, claimStart, claimEnd, challengeWindow, positionCount, rulesHash)
ManagerAdded/ManagerRemoved/ManagerRenounced(poolId, manager)
WinnerAssigned(poolId, placement, account, assignedAt)
WinnerReplaced/AssignmentVoided/Reassigned(poolId, placement, oldAccount, newAccount)
PrizeClaimed(poolId, placement, winner, amount)
DisputeRaised(poolId, placement, disputer, reasonHash)
DisputeResolved(poolId, placement, upheld, resolutionHash)
PoolFrozen/PoolUnfrozen(poolId)
ClaimEndExtended(poolId, newEnd)
PoolClosed(poolId, creator, amount)        // early/pre-ticket
ResidualReclaimed(poolId, creator, amount) // post-claimEnd
AllowedPayoutTokenSet / AllowedAttendanceControllerSet / ArbitratorSet
```
The event set is sufficient to fully reconstruct pool state in the Supabase mirror.

### 6.11 Errors
Custom errors (gas-efficient, matching the ticket-pass controller style): `NotCreator`, `NotManager`, `NotArbitrator`, `NotLockManager`, `TokenNotAllowed`, `AttendanceNotAllowed`, `EventNotProtected`, `BadFunding`, `BadWindow`, `BadPlacement`, `NotTicketHolder`, `AlreadyAssigned`, `AlreadyClaimed`, `CannotReplaceAfterClaimStart`, `AssignmentWindowClosed`, `PoolIsFrozen`, `PoolIsClosed`, `WindowNotOpen`, `WindowClosed`, `NotYetReclaimable`, `NothingToPay`, `EarlyExitNotAllowed`, `TooManyPositions`, `BatchTooLarge`. (`AssignmentWindowClosed` guards the §6.6 initial-assignment cutoff; `NotYetReclaimable` vs `NothingToPay` distinguish "locked placements remain" from "all settled" in the §6.9 partial reclaim.)

---

## 7. Lifecycle state machine

```
Funded ──assignWinners──▶ ResultsPending ──(challenge window/holds elapse)──▶ Claiming ──claimEnd──▶ Expired
  │                                  │                                            │                     │
  │ totalSupply==0 & none assigned   │ raiseDispute → (arbitrator) Frozen ◀───────┘                     │
  ├──closePool (full reclaim)        │            Frozen ──unfreeze──▶ resumes (claimEnd extended)       │
  │                                  │                                                                   │
  └─protected: cancel+refund+none ──closePool (early exit)                          Expired ──reclaim──▶ Closed
```
- `Funded` — escrow held, terms visible, no winners yet.
- `ResultsPending` — some placements assigned; per-placement challenge windows/holds running.
- `Claiming` — at least one placement claimable.
- `Frozen` — arbitrator hold (bounded by backstop); blocks claims and reclaims.
- `Expired` — `effectiveClaimEnd` passed; creator may `reclaim` residual.
- `ClaimComplete` — every share paid out to winners (no creator reclaim needed); terminal. Mirror-derived (`!closed && claimedAmount >= totalFunded`); distinct from `Closed`, which is creator-driven.
- `Closed` — pool reclaimed/closed by the creator (early or residual); terminal.

---

## 8. Database (Supabase migrations)

Naming `YYYYMMDDHHMMSS_*.sql`. All tables are **server-only** (edge functions via `service_role`); no `anon`/`authenticated` grants. Identity columns are `text` Privy DIDs (no `auth.users` FK). Exact wei stored as `text`. Every FK indexed; nullable FKs use partial indexes. RLS enabled with `service_role` full-access policy.

Tables (mirrors of on-chain-verified state):
- `reward_pools` — `pool_id` (on-chain), `chain_id`, `controller_address`, `event_lock_address`, `attendance_controller_address` (nullable), `creator_id` (Privy DID), `creator_address`, `payout_token_address` (nullable = ETH), `total_funded` (text wei), `claim_start`, `claim_end`, `challenge_window_secs`, `position_count`, `rules_hash`, `rules_uri`, `status` (enum: funded/results_pending/claiming/frozen/expired/claim_complete/closed), `tx_hash`, timestamps.
- `reward_pool_positions` — `pool_id` FK, `placement`, `amount` (text wei), `winner_address` (nullable), `assigned_at`, `hold_until`, `claimed` bool, `claimed_at`, `claim_tx_hash`.
- `reward_pool_managers` — `pool_id` FK, `manager_address`, `active` bool, `added_tx_hash`.
- `reward_pool_disputes` — `id` uuid, `pool_id` FK, `placement` (nullable), `disputer_id` (Privy DID), `disputer_address`, `category`, `reason_text`, `evidence_urls` (jsonb), `reason_hash`, `status` (enum: open/under_review/upheld/rejected), `resolution_note`, `resolution_hash`, `onchain_tx_hash` (nullable), timestamps.

Indexes: unique `(controller_address, chain_id, pool_id)` on `reward_pools`; unique `(pool_id, placement)` on positions; unique `(pool_id, manager_address)` on managers; FK indexes on every `pool_id`; query indexes on `reward_pools(event_lock_address, chain_id, status)`. Any edge-function upsert must target a matching **non-partial** unique index (e.g. `onConflict: "controller_address,chain_id,pool_id"`).

RLS/grants per table:
```sql
alter table public.reward_pools enable row level security;
grant select, insert, update, delete on table public.reward_pools to service_role;
create policy "service_role_all" on public.reward_pools for all to service_role using (true) with check (true);
```
(Repeat per table. No anon/authenticated grants — all reads are server-mediated; reward data is public-by-nature but is still served through the read edge functions to keep a one-line lockdown surface.)

A migration also adds `rewards_controller_address text` to `network_configs` (mirrors `ticket_pass_controller_address`).

---

## 9. Edge functions

All follow the repo standard: `{ ok: true, ... }` / `{ ok: false, error }`, CORS, `verifyPrivyToken`, `service_role` client, scoped queries, `SET search_path` on any new SQL function. Client calls via `callEdgeFunction`.

**Writes (verify on-chain, then mirror):**
- `create-reward-pool` — validate Privy user (`validateUserWallet(privyUserId, creatorAddress)`), then verify against `getPool(poolId)` on-chain (creator, eventLock, payoutToken, totalFunded, amounts, windows, rulesHash) before inserting `reward_pools` + `reward_pool_positions` + `reward_pool_managers`. Reject if any field mismatches (`pool_state_mismatch_on_chain`), mirroring `create-ticket-pass`.
- `manage-reward-pool-managers` — creator-gated; the on-chain add/remove tx is sent client-side, this records the mirror.
- `sync-reward-pool` — re-reads on-chain pool/positions/dispute/freeze state and reconciles the mirror (idempotent; called after each wallet action and on a schedule). Source of truth is the chain; DB follows.
- `raise-reward-dispute` — verify caller holds a ticket (`balanceOf(caller) > 0` on `eventLock`), store the rich dispute record + `reason_hash`, **send admin email** (reuse the existing email path; the dispute row persists regardless of email success), optionally accept the client `raiseDispute` tx hash for the censorship-resistant on-chain signal.
- `resolve-reward-dispute` — **arbitrator/admin-gated** (reuse `is-admin`); records resolution; the on-chain `freeze`/`void`/`reassign`/`resolveDispute` tx is sent from the arbitrator multisig.
- `request-claim-end-extension` — **organizer-scoped** (pool creator, or a reward manager proving the wallet that holds the role); off-chain email notify only, no on-chain effect. Fired by the UI when an `assignWinners` tx reverts `AssignmentWindowClosed`, asking the arbitrator to `extendClaimEnd` so the late (but legitimate) result can be assigned. Not a dispute — it sets no hold and touches no escrow.

**Reads:**
- `list-event-reward-pools` — pools + positions + status for an event (used by cards). Public read path; still server-mediated.
- `list-reward-disputes` — disputes for a pool; ticket-holder-gated rich view (category/status/timestamps; reason/evidence gated to disputer + arbitrator; no PII leakage).

Acceptable raw `supabase.functions.invoke` exceptions per CLAUDE.md do not apply here; use `callEdgeFunction` throughout.

---

## 10. Frontend surface

- Config: extend `NetworkConfig` with `rewards_controller_address` and a `getRewardsControllerAddress(chainId)` helper in `src/lib/config/network-config.ts` (same shape as the ticket-pass controller field).
- ABI: add to `src/lib/abi/` and `supabase/functions/_shared/abi/`. Contract addresses in `src/lib/config/contract-config.ts`.
- Hooks (mirror ticket-pass patterns): `useRewardPools` (list/mirror), `useRewardPoolOnchainState` (direct contract reads for the trust surface), `useRewardControllerActions` (create/assign/claim/manager/dispute wallet txs, then call `sync-reward-pool`). Use Divvi-tagged client writes via the established provider wrapper.
- Creation wizard: a reward step after event/ticket setup — asset (ETH/allowlisted ERC20), placements + absolute amounts (presets: even split / percentage / custom, compiled to amounts client-side with leftover wei to placement 1), `claimStart`/`claimEnd`, `challengeWindow` (default `MIN_CHALLENGE_WINDOW`), managers, rules text (hashed → `rulesHash`), and a funding preview. Client enforces `claimStart >= event_end`.
- Event-details cards (ticket-holder-gated rich view; values read from the controller):
  1. **Prize & Terms** — funded amount, asset, full split, claim window, rules link, frozen/disputed badge, "verify on-chain" explorer link via `getExplorerTxUrl`.
  2. **Declared Winners** — per placement: winner (ENS/short), amount, claimed state, "claim opens" countdown when a window/hold is active.
  3. **My Prize** — only for an assigned winner; claim CTA when claimable. When a placement was assigned late (its `opensAt > pool.claimEnd + frozenAccrued`, read from `positionClaimEnd`), show an **informational** note only ("Assigned late — your claim window runs X→Y, extended past the pool window") — the contract guarantees the window, so there is **no winner-facing arbitrator-notify action**.
  4. **Disputes** — pool dispute status, "Raise a dispute" (ticket-holder-gated), list (category/status/timestamp), resolution note when closed. The dispute path is a free signal and does **not** block the creator's reclaim (only an arbitrator `freeze` does).
- Organizer assignment: when an `assignWinners` tx reverts `AssignmentWindowClosed`, the UI surfaces a "Claim window has ended — notify arbitrator to extend it" CTA wired to `request-claim-end-extension` (the only arbitrator-notify affordance, and it lives on the organizer, not the winner).
- Event cards (compact badge): `Funded` · `Results pending` · `Claim open` · `Disputed` · `Expired` · `Paid out` (claim_complete) · `Closed`.
- Trust line (marketing-clean): "🔒 Prize locked on-chain — pays out to the organizer's declared winners. Ticket holders can raise a dispute if results look wrong."

UX defaults follow the repo's optimistic/localized interaction rules: scope loading to the acted element, optimistic update + background `sync-reward-pool`, toast on error, revert only on confirmed failure.

---

## 11. Attendance-controller early-exit (read-only oracle)

The only place the attendance controller is consulted, and only via `view` reads on a per-pool, immutable, allowlist-bound address:

- Bound at creation: `attendanceController` must be allowlisted and `eventConfigByLock(eventLock).exists == true`.
- `closePool` early-exit path (protected only): allowed iff `cfg.cancelInitiated && cfg.refundComplete && assignedCount == 0`. This opens a reclaim path **only** in a provably-safe state (event cancelled, refunds done, no winners) and never closes a path. The `assignedCount == 0` guard makes "winners assigned + event cancelled" impossible by construction.
- No other reward logic depends on attendance state. Claim-window lockout and post-`claimEnd` reclaim are purely time-based. Reward escrow and ticket-price escrow remain independent: a ticket refund never claws back a won prize and vice versa.

---

## 12. Edge cases & validation checklist

- `eventLock` is a contract and answers `isLockManager`/`balanceOf`/`totalSupply` (probe; reject EOAs/garbage).
- ERC20 funding measured by balance delta; allowlist excludes fee-on-transfer/rebasing.
- `sum(positionAmounts) == totalFunded` exactly (absolute amounts ⇒ no dust at claim).
- Each `amount > 0`; `positionCount <= MAX_POSITIONS`; batch `<= MAX_ASSIGN_BATCH`.
- `claimStart > now`; `claimEnd >= claimStart + MIN_CLAIM_DURATION`; `challengeWindow >= MIN_CHALLENGE_WINDOW`; UI dispute holds default to 1 day and expose 1-3 days while the contract caps any request at 5 days.
- One placement per address; one winner per placement; replacement only pre-`claimStart` on unclaimed placements.
- Settled placements (claimed or reclaimed) never voidable/reassignable/replaceable/assignable; closed pools reject `reassign`/`voidAssignment`/`extendClaimEnd`.
- Reentrancy guard on `claim`/`closePool`/`reclaim`; effects before transfer; ETH via `call` with revert-on-failure.
- Double-close / double-reclaim guarded by `closed`.
- Contract winners (team multisig) supported; reverting receiver just stays unclaimed → reclaimable.
- Freeze bounded by `MAX_FREEZE_BACKSTOP`; `unfreeze` extends `claimEnd` by frozen duration; an abandoned freeze gives interrupted assigned winners one bounded post-backstop grace.
- Free dispute hold is one-time per placement, capped, pre-claim only.
- Self-dealing (creator assigns self) is allowed by the contract — surface a UI warning only.

---

## 13. Security considerations

- **No owner/arbitrator drain.** Escrow leaves only via `claim` (to the assigned winner) or `closePool`/`reclaim` (to the creator under the §6.9 rules). Mirror the ticket-pass invariant and assert it in tests.
- **Creator event-lock powers are neutralized for claims** by snapshot-at-assignment; verify with a test that revokes/expires a winner's key after assignment and confirms the claim still succeeds.
- **`totalSupply()` is not a trusted "no tickets sold" oracle.** A lock manager (the creator, by the auth anchor) can drive `totalSupply()` to 0 by burning keys (Unlock `burn` is authorized for lock managers and decrements `_totalSupply`). The `closePool` no-tickets full-reclaim is therefore gated to `block.timestamp < claimStart`, so it cannot be used to bypass the claim-window lockout or the dispute/freeze/reassign recourse after the claim phase opens; post-claim reclaim is forced onto the time-locked, freezable `reclaim` path. The attendance early-exit relies on protection state the creator cannot spoof, so it needs no such gate. Verify with a test: burn keys after `claimStart`, `closePool` reverts `EarlyExitNotAllowed`.
- **Oracle spoofing** closed by the attendance-controller allowlist + `exists` binding.
- **Griefing** bounded: disputes never pool-freeze for free; the free hold is per-placement, capped, one-time.
- **Arbitrator over-reach** bounded by the freeze backstop and the no-drain/no-amount-change/no-claimed-touch limits.
- Residual (threat-model register, not UI/source): a creator — or a manager colluding with a ticket holder (incl. `lendKey`) — can direct a prize to a chosen address. The contract secures funds + terms, not placements. Mitigations are visibility (all assignments on-chain), the challenge window + dispute path, and reputation.

---

## 14. Testing

Foundry/contract tests:
- Funding match (ETH + ERC20), `sum == totalFunded`, allowlist rejection.
- Creator-auth gate (`isLockManager`), attendance allowlist/`exists` binding.
- Assignment: ticket-holder gate, one-per-address, replacement pre/post `claimStart`, batch atomicity.
- Challenge window: happy-path zero delay; late assignment fresh window; dispute hold one-time/capped.
- **Per-position window**: late-assigned winner claims past pool end; early-assigned closes at pool end; exact start/end boundaries; tie (`start + MIN_CLAIM_DURATION == pool end`); dispute hold still grants ≥ `MIN_CLAIM_DURATION`; `positionClaimEnd` matches the formula.
- **Assignment cutoff**: assign at exact pool end succeeds, one second past reverts `AssignmentWindowClosed`; succeeds again after `extendClaimEnd` / `unfreeze` accrual; frozen/closed precede the cutoff; replacement stays gated by `claimStart`, not the cutoff.
- **Partial reclaim**: never-assigned + early funds reclaim at pool end while a late placement stays locked (pool not `closed`); full reclaim after the late placement's end; idempotency via `reclaimed`; `NotYetReclaimable` vs `NothingToPay`; a winner claiming late before its end leaves the rest reclaimable; a reclaimed placement cannot be claimed.
- Claim: window bounds, frozen blocks until the backstop, post-backstop grace for interrupted assigned winners, claimed finality, contract-winner receive, **post-assignment key revocation does not block claim**.
- Disputes/arbitration: free signal no-freeze, freeze extends `claimEnd` when resolved, void/reassign unclaimed-only, backstop, no-drain.
- Settled/closed terminal guards: after a partial reclaim keeps a pool open, `assignWinners` (even post-`extendClaimEnd`), `reassign`, and `voidAssignment` on a reclaimed placement revert `AlreadyClaimed`; `reassign`/`voidAssignment`/`extendClaimEnd` on a `closePool`-refunded (closed) pool revert `PoolIsClosed`.
- Close/reclaim truth table incl. protected early-exit and the `assignedCount==0` guard.
- Invariants/fuzz: solvency under partial reclaim (`sum(claims) + sum(reclaims) == totalFunded` once settled); no placement both `claimed` and `reclaimed`; `closed ⇒ fully settled`.
Integration (edge): on-chain verification on create/sync (mirrors `dg-redemption-contracts` test style), dispute email dispatch, RLS/grants.

---

## 15. Rollout

1. Contract: implement `TeeRexRewardsControllerV1`, audit-pass the no-drain invariant, deploy to Base Sepolia then Mainnet; record addresses.
2. Migration: create the four tables + grants/indexes; add `rewards_controller_address` to `network_configs`; populate per chain. (Write migration files only; do not run — the user applies them.)
3. Edge functions: ship create/sync/list/dispute/resolve with on-chain verification.
4. Frontend: config + ABI + hooks + creation step + event-details cards + badges.
5. Arbitrator: provision the multisig, `setArbitrator`, wire the admin dispute-resolution console + email alerts.
6. QA on Sepolia across the §7 lifecycle, then enable on Mainnet behind the existing admin/feature gating.

---

## 16. Open questions / v2

- Optional on-chain winner credential (EAS attestation) after claim, for portable proof.
- Bonded disputes + slashing alongside **decentralized arbitration** (`setArbitrator(courtContract)`).
- Top-ups / additional sponsors (immutable-terms tension; default off in v1).
- Team-member auto-splitting beyond a single team payout wallet.
- Multi-asset pools and non-EVM payout rails.
