// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.6.1/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.6.1/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.6.1/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.6.1/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPublicLock {
    function balanceOf(address owner) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function isLockManager(address account) external view returns (bool);
}

interface IAttendanceController {
    // Auto-generated getter for `mapping(address => EventConfig) public eventConfigByLock`.
    // EventConfig leads with these static status flags; decoding only the leading words is safe
    // because the remaining fields are all fixed-size and trail them.
    function eventConfigByLock(address lock)
        external
        view
        returns (bool exists, bool managerReleased, bool cancelInitiated, bool refundComplete);
}

/**
 * @title TeeRexRewardsControllerV1
 * @notice Prefunded prize-pool escrow for TeeRex events. Design rationale and threat model:
 * docs/rewards-controller-v1-spec.md.
 *
 * Invariants:
 * - Pure escrow: only reads the event lock and an optional allowlisted attendance controller.
 * - Owner and arbitrator can never move escrow to themselves or an arbitrary address; funds leave
 *   only via claim (assigned winner) or closePool/reclaim (creator).
 * - Ticket eligibility is snapshotted at assignment and never re-read at claim.
 * - Per-pool accounting (totalFunded - claimedAmount) isolates each pool's escrow.
 * - A placement is claimable only after max(claimStart, assignedAt + challengeWindow).
 */
contract TeeRexRewardsControllerV1 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint16 public constant VERSION = 1;

    uint64 internal constant MIN_CHALLENGE_WINDOW = 30 hours; // contract floor
    uint64 internal constant MAX_DISPUTE_HOLD = 24 hours;     // free per-placement hold cap
    uint64 internal constant MIN_CLAIM_DURATION = 3 days;     // claimEnd - claimStart floor
    uint64 internal constant MAX_FREEZE_BACKSTOP = 90 days;   // bounds an arbitrator hold past claimEnd
    uint16 internal constant MAX_POSITIONS = 200;
    uint16 internal constant MAX_ASSIGN_BATCH = 50;

    /// @notice Hot role authorized to resolve disputes. Never moves escrow to itself.
    address public arbitrator;

    struct Pool {
        bool exists;
        bool frozen;
        bool closed;
        address creator;              // only address that can close/reclaim
        address eventLock;            // associated PublicLock (read-only)
        address attendanceController; // address(0) = non-protected; else allowlisted + exists-bound
        address payoutToken;          // address(0) = native ETH, else allowlisted ERC20
        uint256 totalFunded;          // == sum(position amounts); immutable
        uint256 claimedAmount;        // running total paid out to winners
        uint64 claimStart;
        uint64 claimEnd;              // base end; effective end = claimEnd + frozenAccrued
        uint64 challengeWindow;       // >= MIN_CHALLENGE_WINDOW
        uint64 frozenAt;              // 0 when not frozen
        uint64 frozenAccrued;         // total frozen duration, added to effective claimEnd
        uint16 positionCount;
        uint16 assignedCount;
        bytes32 rulesHash;            // anchors off-chain qualifying rules shown in UI
    }

    struct Position {
        uint256 amount;   // immutable share for this 1-based placement
        address winner;   // address(0) until assigned
        uint64 assignedAt;
        uint64 holdUntil; // free dispute hold expiry (0 = none)
        bool freeHoldUsed; // a free dispute hold may be applied once per placement
        bool claimed;
        bool reclaimed;   // creator reclaimed this placement's share (mutually exclusive with claimed)
        uint64 claimedAt;
    }

    struct CreateRewardPoolParams {
        address eventLock;
        address attendanceController; // zero for non-protected
        address payoutToken;          // zero for ETH
        uint256[] positionAmounts;    // absolute amounts, 1-based placements; each > 0
        uint64 claimStart;
        uint64 claimEnd;
        uint64 challengeWindow;
        bytes32 rulesHash;
        address[] initialManagers;
    }

    uint256 public nextPoolId;
    // Read via getPool(); a public auto-getter for this 17-field struct exceeds the legacy stack
    // limit (blocking non-via-ir coverage builds), so the struct is exposed as a memory view.
    mapping(uint256 => Pool) internal pools;
    mapping(uint256 => mapping(uint16 => Position)) public positions; // poolId => placement => Position
    mapping(uint256 => mapping(address => bool)) public isManager;    // poolId => addr => assign-only
    mapping(uint256 => mapping(address => bool)) public isAssigned;   // poolId => addr => holds a placement

    // ERC20 payout-token allowlist (native is always allowed and never stored). Restricting
    // escrowable ERC20s to vetted standard tokens protects accounting from fee-on-transfer / rebasing.
    mapping(address => bool) public allowedPayoutToken;
    address[] public allowedPayoutTokens;
    mapping(address => uint256) private allowedPayoutTokenIndex; // token => index+1 (0 = absent)

    // Trusted attendance controllers; required for the protected-event early-exit oracle.
    mapping(address => bool) public allowedAttendanceController;

    error InvalidArbitrator();
    error InvalidToken();
    error TokenNotAllowed(address token);
    error AttendanceNotAllowed(address controller);
    error EventNotProtected();
    error NotLockManager();
    error InvalidEventLock();
    error BadPositions();
    error BadFunding(uint256 required, uint256 provided);
    error BadWindow();
    error TooManyPositions();
    error BatchTooLarge();

    error UnknownPool();
    error NotCreator();
    error NotManager();
    error NotArbitrator();
    error PoolIsFrozen();
    error NotFrozen();
    error PoolIsClosed();
    error BadPlacement();
    error InvalidRecipient();
    error NotTicketHolder();
    error AlreadyAssigned();
    error AlreadyClaimed();
    error CannotReplaceAfterClaimStart();
    error AssignmentWindowClosed();
    error NotAssigned();
    error WindowNotOpen();
    error WindowClosed();
    error NotWinner();
    error EarlyExitNotAllowed();
    error NotYetReclaimable();
    error NothingToPay();
    error NativeTransferFailed();
    error UnexpectedNativeValue();

    event ArbitratorSet(address indexed previousArbitrator, address indexed newArbitrator);
    event AllowedPayoutTokenUpdated(address indexed token, bool allowed);
    event AllowedAttendanceControllerUpdated(address indexed controller, bool allowed);

    event PoolCreated(
        uint256 indexed poolId,
        address indexed creator,
        address indexed eventLock,
        address payoutToken,
        address attendanceController,
        uint256 totalFunded,
        uint64 claimStart,
        uint64 claimEnd,
        uint64 challengeWindow,
        uint16 positionCount,
        bytes32 rulesHash
    );
    event ManagerAdded(uint256 indexed poolId, address indexed manager);
    event ManagerRemoved(uint256 indexed poolId, address indexed manager);
    event ManagerRenounced(uint256 indexed poolId, address indexed manager);
    event WinnerAssigned(uint256 indexed poolId, uint16 indexed placement, address indexed account, uint64 assignedAt);
    event WinnerReplaced(uint256 indexed poolId, uint16 indexed placement, address previousAccount, address newAccount);
    event PrizeClaimed(uint256 indexed poolId, uint16 indexed placement, address indexed winner, uint256 amount);
    event DisputeRaised(uint256 indexed poolId, uint16 indexed placement, address indexed disputer, bytes32 reasonHash);
    event DisputeResolved(uint256 indexed poolId, uint16 indexed placement, bool upheld, bytes32 resolutionHash);
    event AssignmentVoided(uint256 indexed poolId, uint16 indexed placement, address indexed account);
    event Reassigned(uint256 indexed poolId, uint16 indexed placement, address previousAccount, address newAccount);
    event PoolFrozen(uint256 indexed poolId);
    event PoolUnfrozen(uint256 indexed poolId, uint64 frozenAccrued);
    event ClaimEndExtended(uint256 indexed poolId, uint64 newClaimEnd);
    event PoolClosed(uint256 indexed poolId, address indexed creator, uint256 amount);
    event ResidualReclaimed(uint256 indexed poolId, address indexed creator, uint256 amount);

    constructor(
        address _initialOwner,
        address _arbitrator,
        address[] memory _initialAllowedTokens,
        address[] memory _initialAllowedAttendanceControllers
    ) Ownable(_initialOwner) {
        if (_arbitrator == address(0)) revert InvalidArbitrator();
        arbitrator = _arbitrator;

        for (uint256 i = 0; i < _initialAllowedTokens.length; i++) {
            _setAllowedPayoutToken(_initialAllowedTokens[i], true);
        }
        for (uint256 i = 0; i < _initialAllowedAttendanceControllers.length; i++) {
            _setAllowedAttendanceController(_initialAllowedAttendanceControllers[i], true);
        }
    }

    modifier onlyArbitrator() {
        if (msg.sender != arbitrator) revert NotArbitrator();
        _;
    }

    function setArbitrator(address _arbitrator) external onlyOwner {
        if (_arbitrator == address(0)) revert InvalidArbitrator();
        emit ArbitratorSet(arbitrator, _arbitrator);
        arbitrator = _arbitrator;
    }

    function setAllowedPayoutToken(address token, bool allowed) external onlyOwner {
        _setAllowedPayoutToken(token, allowed);
    }

    function setAllowedAttendanceController(address controller, bool allowed) external onlyOwner {
        _setAllowedAttendanceController(controller, allowed);
    }

    function isAllowedPayoutToken(address token) public view returns (bool) {
        if (token == address(0)) return true; // native is implicitly allowed
        return allowedPayoutToken[token];
    }

    function getAllowedPayoutTokens() external view returns (address[] memory) {
        return allowedPayoutTokens;
    }

    function createRewardPool(CreateRewardPoolParams calldata p)
        external
        payable
        nonReentrant
        returns (uint256 poolId)
    {
        // Creator auth anchor: must be a manager of the event lock (gasless deploy adds the creator;
        // client deploys make the creator the manager). Probes that eventLock is a live PublicLock.
        if (!_isLockManager(p.eventLock, msg.sender)) revert NotLockManager();

        if (p.attendanceController != address(0)) {
            if (!allowedAttendanceController[p.attendanceController]) {
                revert AttendanceNotAllowed(p.attendanceController);
            }
            (bool exists,,,) = IAttendanceController(p.attendanceController).eventConfigByLock(p.eventLock);
            if (!exists) revert EventNotProtected();
        }

        if (p.payoutToken != address(0) && !allowedPayoutToken[p.payoutToken]) {
            revert TokenNotAllowed(p.payoutToken);
        }

        uint256 count = p.positionAmounts.length;
        if (count == 0) revert BadPositions();
        if (count > MAX_POSITIONS) revert TooManyPositions();

        uint256 total = 0;
        for (uint256 i = 0; i < count; i++) {
            uint256 amt = p.positionAmounts[i];
            if (amt == 0) revert BadPositions();
            total += amt; // checked arithmetic: reverts on overflow
        }

        if (p.claimStart <= block.timestamp) revert BadWindow();
        if (p.claimEnd < p.claimStart + MIN_CLAIM_DURATION) revert BadWindow();
        if (p.challengeWindow < MIN_CHALLENGE_WINDOW) revert BadWindow();

        // Funding must match exactly. ERC20 is measured by balance delta to reject any token whose
        // transfer does not credit the full amount (defense-in-depth atop the allowlist).
        if (p.payoutToken == address(0)) {
            if (msg.value != total) revert BadFunding(total, msg.value);
        } else {
            if (msg.value != 0) revert UnexpectedNativeValue();
            uint256 balBefore = IERC20(p.payoutToken).balanceOf(address(this));
            IERC20(p.payoutToken).safeTransferFrom(msg.sender, address(this), total);
            uint256 received = IERC20(p.payoutToken).balanceOf(address(this)) - balBefore;
            if (received != total) revert BadFunding(total, received);
        }

        poolId = nextPoolId++;

        Pool storage pool = pools[poolId];
        pool.exists = true;
        pool.creator = msg.sender;
        pool.eventLock = p.eventLock;
        pool.attendanceController = p.attendanceController;
        pool.payoutToken = p.payoutToken;
        pool.totalFunded = total;
        pool.claimStart = p.claimStart;
        pool.claimEnd = p.claimEnd;
        pool.challengeWindow = p.challengeWindow;
        pool.positionCount = uint16(count);
        pool.rulesHash = p.rulesHash;

        for (uint256 i = 0; i < count; i++) {
            positions[poolId][uint16(i + 1)].amount = p.positionAmounts[i];
        }

        for (uint256 i = 0; i < p.initialManagers.length; i++) {
            address m = p.initialManagers[i];
            if (m != address(0) && !isManager[poolId][m]) {
                isManager[poolId][m] = true;
                emit ManagerAdded(poolId, m);
            }
        }

        emit PoolCreated(
            poolId,
            msg.sender,
            p.eventLock,
            p.payoutToken,
            p.attendanceController,
            total,
            p.claimStart,
            p.claimEnd,
            p.challengeWindow,
            uint16(count),
            p.rulesHash
        );
    }

    function addManager(uint256 poolId, address m) external {
        Pool storage pool = _pool(poolId);
        if (msg.sender != pool.creator) revert NotCreator();
        if (m == address(0)) revert InvalidRecipient();
        if (!isManager[poolId][m]) {
            isManager[poolId][m] = true;
            emit ManagerAdded(poolId, m);
        }
    }

    function removeManager(uint256 poolId, address m) external {
        Pool storage pool = _pool(poolId);
        if (msg.sender != pool.creator) revert NotCreator();
        if (isManager[poolId][m]) {
            isManager[poolId][m] = false;
            emit ManagerRemoved(poolId, m);
        }
    }

    function renounceManager(uint256 poolId) external {
        _pool(poolId);
        if (!isManager[poolId][msg.sender]) revert NotManager();
        isManager[poolId][msg.sender] = false;
        emit ManagerRenounced(poolId, msg.sender);
    }

    struct WinnerAssignment {
        address account;
        uint16 placement; // 1-based
    }

    function assignWinners(uint256 poolId, WinnerAssignment[] calldata batch) external {
        Pool storage pool = _pool(poolId);
        if (pool.frozen) revert PoolIsFrozen();
        if (pool.closed) revert PoolIsClosed();
        if (msg.sender != pool.creator && !isManager[poolId][msg.sender]) revert NotManager();
        if (batch.length > MAX_ASSIGN_BATCH) revert BatchTooLarge();

        for (uint256 i = 0; i < batch.length; i++) {
            address account = batch[i].account;
            uint16 placement = batch[i].placement;

            if (placement == 0 || placement > pool.positionCount) revert BadPlacement();
            if (account == address(0)) revert InvalidRecipient();
            // Snapshot ticket eligibility: evaluated once, here, and never re-checked at claim.
            if (IPublicLock(pool.eventLock).balanceOf(account) == 0) revert NotTicketHolder();

            Position storage pos = positions[poolId][placement];
            address current = pos.winner;

            // A reclaimed share is terminal: its escrow was returned to the creator, so a winner
            // recorded here could never claim. claimed is unreachable pre-claimStart (gate below).
            if (pos.reclaimed) revert AlreadyClaimed();

            if (current != address(0)) {
                // Replacement is allowed only pre-claim; the gate below also guarantees the placement is unclaimed.
                if (block.timestamp >= pool.claimStart) revert CannotReplaceAfterClaimStart();
                isAssigned[poolId][current] = false;
            } else {
                // Bound initial assignment so a late winner's guaranteed window cannot start past
                // the claim window; genuinely-late results must route through arbitrator extendClaimEnd.
                if (block.timestamp > uint256(pool.claimEnd) + pool.frozenAccrued) revert AssignmentWindowClosed();
                pool.assignedCount += 1;
            }

            if (isAssigned[poolId][account]) revert AlreadyAssigned();
            isAssigned[poolId][account] = true;

            pos.winner = account;
            pos.assignedAt = uint64(block.timestamp);
            pos.holdUntil = 0;
            pos.freeHoldUsed = false;

            if (current == address(0)) {
                emit WinnerAssigned(poolId, placement, account, uint64(block.timestamp));
            } else {
                emit WinnerReplaced(poolId, placement, current, account);
            }
        }
    }

    function claim(uint256 poolId, uint16 placement) external nonReentrant {
        Pool storage pool = _pool(poolId);
        if (pool.closed) revert PoolIsClosed();
        if (pool.frozen) revert PoolIsFrozen();

        Position storage pos = positions[poolId][placement];
        if (pos.winner != msg.sender) revert NotWinner();
        if (pos.claimed) revert AlreadyClaimed();
        if (pos.reclaimed) revert AlreadyClaimed();

        uint256 opensAt = _effectiveClaimStart(pool, pos);
        if (block.timestamp < opensAt) revert WindowNotOpen();
        if (block.timestamp > _effectiveClaimEnd(pool, pos)) revert WindowClosed();

        // Effects before interaction.
        pos.claimed = true;
        pos.claimedAt = uint64(block.timestamp);
        pool.claimedAmount += pos.amount;

        _pay(pool.payoutToken, msg.sender, pos.amount);

        emit PrizeClaimed(poolId, placement, msg.sender, pos.amount);
    }

    function raiseDispute(uint256 poolId, uint16 placement, bytes32 reasonHash) external {
        Pool storage pool = _pool(poolId);
        if (pool.closed) revert PoolIsClosed();
        if (IPublicLock(pool.eventLock).balanceOf(msg.sender) == 0) revert NotTicketHolder();

        if (placement != 0) {
            if (placement > pool.positionCount) revert BadPlacement();
            Position storage pos = positions[poolId][placement];
            if (pos.winner != address(0) && !pos.claimed && !pos.freeHoldUsed) {
                uint256 windowEnd = uint256(pos.assignedAt) + pool.challengeWindow;
                uint256 naturalOpen = pool.claimStart > windowEnd ? pool.claimStart : windowEnd;
                uint256 hold = block.timestamp + MAX_DISPUTE_HOLD;
                // Teeth only when the placement is still pre-claim AND the dispute lands within
                // MAX_DISPUTE_HOLD of it opening; an earlier (inert) dispute must not consume the
                // one-time hold, and the bound caps the extra delay at MAX_DISPUTE_HOLD.
                if (block.timestamp < naturalOpen && hold > naturalOpen) {
                    pos.holdUntil = uint64(hold);
                    pos.freeHoldUsed = true;
                }
            }
        }

        emit DisputeRaised(poolId, placement, msg.sender, reasonHash);
    }

    function freeze(uint256 poolId) external onlyArbitrator {
        Pool storage pool = _pool(poolId);
        if (pool.closed) revert PoolIsClosed();
        if (pool.frozen) revert PoolIsFrozen();
        pool.frozen = true;
        pool.frozenAt = uint64(block.timestamp);
        emit PoolFrozen(poolId);
    }

    function unfreeze(uint256 poolId) external onlyArbitrator {
        Pool storage pool = _pool(poolId);
        if (!pool.frozen) revert NotFrozen();
        // Extend the claim window by the frozen duration so winners do not lose claim time.
        pool.frozenAccrued += uint64(block.timestamp) - pool.frozenAt;
        pool.frozen = false;
        pool.frozenAt = 0;
        emit PoolUnfrozen(poolId, pool.frozenAccrued);
    }

    function voidAssignment(uint256 poolId, uint16 placement) external onlyArbitrator {
        Pool storage pool = _pool(poolId);
        if (pool.closed) revert PoolIsClosed();
        if (placement == 0 || placement > pool.positionCount) revert BadPlacement();
        Position storage pos = positions[poolId][placement];
        if (pos.winner == address(0)) revert NotAssigned();
        if (pos.claimed || pos.reclaimed) revert AlreadyClaimed();

        address account = pos.winner;
        isAssigned[poolId][account] = false;
        pool.assignedCount -= 1;
        pos.winner = address(0);
        pos.assignedAt = 0;
        pos.holdUntil = 0;
        pos.freeHoldUsed = false;

        emit AssignmentVoided(poolId, placement, account);
    }

    function reassign(uint256 poolId, uint16 placement, address newWinner) external onlyArbitrator {
        Pool storage pool = _pool(poolId);
        if (pool.closed) revert PoolIsClosed();
        if (placement == 0 || placement > pool.positionCount) revert BadPlacement();
        if (newWinner == address(0)) revert InvalidRecipient();
        if (IPublicLock(pool.eventLock).balanceOf(newWinner) == 0) revert NotTicketHolder();

        Position storage pos = positions[poolId][placement];
        if (pos.claimed || pos.reclaimed) revert AlreadyClaimed();

        address current = pos.winner;
        if (current != address(0)) {
            isAssigned[poolId][current] = false;
        } else {
            pool.assignedCount += 1;
        }
        if (isAssigned[poolId][newWinner]) revert AlreadyAssigned();
        isAssigned[poolId][newWinner] = true;

        pos.winner = newWinner;
        pos.assignedAt = uint64(block.timestamp);
        pos.holdUntil = 0;
        pos.freeHoldUsed = false;

        emit Reassigned(poolId, placement, current, newWinner);
    }

    function extendClaimEnd(uint256 poolId, uint64 newClaimEnd) external onlyArbitrator {
        Pool storage pool = _pool(poolId);
        if (pool.closed) revert PoolIsClosed();
        if (newClaimEnd <= pool.claimEnd) revert BadWindow();
        pool.claimEnd = newClaimEnd;
        emit ClaimEndExtended(poolId, newClaimEnd);
    }

    function resolveDispute(
        uint256 poolId,
        uint16 placement,
        bool upheld,
        bytes32 resolutionHash
    ) external onlyArbitrator {
        Pool storage pool = _pool(poolId);
        if (placement != 0 && placement <= pool.positionCount) {
            // Lift any free hold; if upheld, the arbitrator has already voided/reassigned.
            positions[poolId][placement].holdUntil = 0;
        }
        emit DisputeResolved(poolId, placement, upheld, resolutionHash);
    }

    function closePool(uint256 poolId) external nonReentrant {
        Pool storage pool = _pool(poolId);
        if (msg.sender != pool.creator) revert NotCreator();
        if (pool.closed) revert PoolIsClosed();
        if (pool.frozen) revert PoolIsFrozen();

        // Early full reclaim requires no winners assigned AND either an empty lock before the claim
        // phase opens, or the attendance-proven cancel+refund state. Restricting the no-tickets path
        // to pre-claimStart keeps every post-claim reclaim on the time-locked, freezable reclaim()
        // path. assignedCount == 0 makes "winners assigned + early reclaim" impossible by construction.
        bool noTickets =
            block.timestamp < pool.claimStart && IPublicLock(pool.eventLock).totalSupply() == 0;
        bool allowed = pool.assignedCount == 0 && (noTickets || _attendanceEarlyExit(pool));
        if (!allowed) revert EarlyExitNotAllowed();

        pool.closed = true;
        uint256 amount = pool.totalFunded - pool.claimedAmount; // == totalFunded (nothing claimed)
        if (amount > 0) {
            pool.claimedAmount = pool.totalFunded;
            _pay(pool.payoutToken, pool.creator, amount);
        }

        emit PoolClosed(poolId, pool.creator, amount);
    }

    function reclaim(uint256 poolId) external nonReentrant {
        Pool storage pool = _pool(poolId);
        if (msg.sender != pool.creator) revert NotCreator();
        if (pool.closed) revert PoolIsClosed();

        uint256 poolEnd = _effectiveClaimEnd(pool);
        // A freeze blocks reclaim only until the backstop; past it, escrow is released regardless.
        if (pool.frozen && block.timestamp <= poolEnd + MAX_FREEZE_BACKSTOP) revert PoolIsFrozen();

        // Per-position sweep: never-assigned shares are reclaimable at the pool end; an assigned-
        // unclaimed share only after that placement's guaranteed window. A late/held winner is thus
        // never timed out by the creator, while never-assigned funds are not perpetually locked.
        uint256 amount = 0;
        bool lockedRemain = false;
        uint16 n = pool.positionCount;
        for (uint16 p = 1; p <= n; p++) {
            Position storage pos = positions[poolId][p];
            if (pos.claimed || pos.reclaimed) continue;
            uint256 posEnd = pos.winner == address(0) ? poolEnd : _effectiveClaimEnd(pool, pos);
            if (block.timestamp > posEnd) {
                pos.reclaimed = true; // effect before the single aggregated transfer below
                amount += pos.amount;
            } else {
                lockedRemain = true;
            }
        }

        if (amount == 0) {
            if (lockedRemain) revert NotYetReclaimable();
            revert NothingToPay();
        }

        pool.claimedAmount += amount;
        if (!lockedRemain) pool.closed = true;
        _pay(pool.payoutToken, pool.creator, amount);

        emit ResidualReclaimed(poolId, pool.creator, amount);
    }

    /// @notice When `placement` becomes claimable and whether it is claimable right now.
    function claimable(uint256 poolId, uint16 placement)
        external
        view
        returns (bool canClaim, uint256 opensAt)
    {
        Pool storage pool = _poolView(poolId);
        Position storage pos = positions[poolId][placement];
        opensAt = _effectiveClaimStart(pool, pos);
        canClaim =
            pos.winner != address(0) &&
            !pos.claimed &&
            !pos.reclaimed &&
            !pool.frozen &&
            !pool.closed &&
            block.timestamp >= opensAt &&
            block.timestamp <= _effectiveClaimEnd(pool, pos);
    }

    function effectiveClaimEnd(uint256 poolId) external view returns (uint256) {
        return _effectiveClaimEnd(_poolView(poolId));
    }

    /// @notice The guaranteed claim end for a single placement (>= the pool-level end).
    function positionClaimEnd(uint256 poolId, uint16 placement) external view returns (uint256) {
        Pool storage pool = _poolView(poolId);
        return _effectiveClaimEnd(pool, positions[poolId][placement]);
    }

    function remaining(uint256 poolId) external view returns (uint256) {
        Pool storage pool = _poolView(poolId);
        return pool.totalFunded - pool.claimedAmount;
    }

    function getPool(uint256 poolId) external view returns (Pool memory) {
        return _poolView(poolId);
    }

    function _effectiveClaimStart(Pool storage pool, Position storage pos)
        internal
        view
        returns (uint256)
    {
        uint256 ecs = pool.claimStart;
        uint256 byWindow = uint256(pos.assignedAt) + pool.challengeWindow;
        if (byWindow > ecs) ecs = byWindow;
        if (pos.holdUntil > ecs) ecs = pos.holdUntil;
        return ecs;
    }

    function _effectiveClaimEnd(Pool storage pool) internal view returns (uint256) {
        return uint256(pool.claimEnd) + pool.frozenAccrued;
    }

    // Guarantees an assigned winner MIN_CLAIM_DURATION of claim time after their effective start,
    // even when a late assignment or dispute hold pushes that start to/past the pool-level end.
    function _effectiveClaimEnd(Pool storage pool, Position storage pos)
        internal
        view
        returns (uint256)
    {
        uint256 poolEnd = uint256(pool.claimEnd) + pool.frozenAccrued;
        uint256 byPosition = _effectiveClaimStart(pool, pos) + MIN_CLAIM_DURATION;
        return byPosition > poolEnd ? byPosition : poolEnd;
    }

    function _attendanceEarlyExit(Pool storage pool) internal view returns (bool) {
        if (pool.attendanceController == address(0)) return false;
        (bool exists, , bool cancelInitiated, bool refundComplete) =
            IAttendanceController(pool.attendanceController).eventConfigByLock(pool.eventLock);
        return exists && cancelInitiated && refundComplete;
    }

    function _isLockManager(address lock, address account) internal view returns (bool) {
        if (lock.code.length == 0) revert InvalidEventLock();
        return IPublicLock(lock).isLockManager(account);
    }

    function _pay(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool sent, ) = payable(to).call{value: amount}("");
            if (!sent) revert NativeTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _pool(uint256 poolId) internal view returns (Pool storage pool) {
        pool = pools[poolId];
        if (!pool.exists) revert UnknownPool();
    }

    function _poolView(uint256 poolId) internal view returns (Pool storage pool) {
        pool = pools[poolId];
        if (!pool.exists) revert UnknownPool();
    }

    function _setAllowedPayoutToken(address token, bool allowed) internal {
        if (token == address(0)) revert InvalidToken(); // native is implicitly allowed
        if (allowedPayoutToken[token] == allowed) return; // idempotent

        allowedPayoutToken[token] = allowed;
        if (allowed) {
            allowedPayoutTokens.push(token);
            allowedPayoutTokenIndex[token] = allowedPayoutTokens.length; // index+1
        } else {
            _removeAllowedPayoutToken(token);
        }
        emit AllowedPayoutTokenUpdated(token, allowed);
    }

    function _removeAllowedPayoutToken(address token) private {
        uint256 indexPlusOne = allowedPayoutTokenIndex[token];
        if (indexPlusOne == 0) return;

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = allowedPayoutTokens.length - 1;
        address lastToken = allowedPayoutTokens[lastIndex];

        if (index != lastIndex) {
            allowedPayoutTokens[index] = lastToken;
            allowedPayoutTokenIndex[lastToken] = index + 1;
        }
        allowedPayoutTokens.pop();
        delete allowedPayoutTokenIndex[token];
    }

    function _setAllowedAttendanceController(address controller, bool allowed) internal {
        if (controller == address(0)) revert AttendanceNotAllowed(controller);
        if (allowedAttendanceController[controller] == allowed) return; // idempotent
        allowedAttendanceController[controller] = allowed;
        emit AllowedAttendanceControllerUpdated(controller, allowed);
    }
}
