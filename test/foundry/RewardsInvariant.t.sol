// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Test.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";
import {MockPublicLock} from "./mocks/MockPublicLock.sol";

/// @notice Bounded actor that drives the controller through create/assign/claim/reclaim while
/// timestamps advance, tracking ghost totals of ETH funded and paid out so the test can assert
/// escrow solvency. Every action is wrapped in try/catch — invalid sequences are no-ops, not noise.
contract RewardsHandler is Test {
    R public controller;
    MockPublicLock public lock;
    address[3] public winners;
    uint256[] public pools;

    uint256 public ghostFunded;
    uint256 public ghostPaidOut;

    constructor(R _controller, MockPublicLock _lock, address[3] memory _winners) {
        controller = _controller;
        lock = _lock;
        winners = _winners;
    }

    receive() external payable {}

    function poolCount() external view returns (uint256) {
        return pools.length;
    }

    function createPool(uint256 seed, uint8 nPos) external {
        uint256 n = bound(nPos, 1, 3);
        uint256[] memory amts = new uint256[](n);
        uint256 total;
        for (uint256 i = 0; i < n; i++) {
            uint256 amt = bound(uint256(keccak256(abi.encode(seed, i))), 1, 100 ether);
            amts[i] = amt;
            total += amt;
        }
        if (address(this).balance < total) return;

        uint64 cs = uint64(block.timestamp + 1 days);
        R.CreateRewardPoolParams memory p = R.CreateRewardPoolParams({
            eventLock: address(lock),
            attendanceController: address(0),
            payoutToken: address(0),
            positionAmounts: amts,
            claimStart: cs,
            claimEnd: cs + 30 days,
            challengeWindow: 30 hours,
            rulesHash: bytes32(0),
            initialManagers: new address[](0)
        });
        try controller.createRewardPool{value: total}(p) returns (uint256 poolId) {
            pools.push(poolId);
            ghostFunded += total;
        } catch {}
    }

    function assignWinner(uint256 poolSeed, uint256 wSeed, uint256 pSeed) external {
        if (pools.length == 0) return;
        uint256 poolId = pools[poolSeed % pools.length];
        uint16 pc = controller.getPool(poolId).positionCount;
        if (pc == 0) return;
        R.WinnerAssignment[] memory b = new R.WinnerAssignment[](1);
        b[0] = R.WinnerAssignment({account: winners[wSeed % 3], placement: uint16(pSeed % pc) + 1});
        try controller.assignWinners(poolId, b) {} catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1 hours, 10 days));
    }

    function dispute(uint256 poolSeed, uint256 pSeed, uint256 wSeed) external {
        if (pools.length == 0) return;
        uint256 poolId = pools[poolSeed % pools.length];
        uint16 pc = controller.getPool(poolId).positionCount;
        if (pc == 0) return;
        address holder = winners[wSeed % 3]; // winners all hold a key
        vm.prank(holder);
        try controller.raiseDispute(poolId, uint16(pSeed % pc) + 1, bytes32(0)) {} catch {}
    }

    function claim(uint256 poolSeed, uint256 pSeed) external {
        if (pools.length == 0) return;
        uint256 poolId = pools[poolSeed % pools.length];
        uint16 pc = controller.getPool(poolId).positionCount;
        if (pc == 0) return;
        uint16 placement = uint16(pSeed % pc) + 1;
        (uint256 amount, address winner,,,, bool claimed,,) = controller.positions(poolId, placement);
        if (winner == address(0) || claimed) return;
        vm.prank(winner);
        try controller.claim(poolId, placement) {
            ghostPaidOut += amount;
        } catch {}
    }

    function reclaim(uint256 poolSeed) external {
        if (pools.length == 0) return;
        uint256 poolId = pools[poolSeed % pools.length];
        uint256 remBefore = controller.remaining(poolId);
        try controller.reclaim(poolId) {
            // reclaim may now be partial; credit only what actually left the escrow.
            ghostPaidOut += remBefore - controller.remaining(poolId);
        } catch {}
    }
}

contract RewardsInvariantTest is Test {
    R internal controller;
    MockPublicLock internal lock;
    RewardsHandler internal handler;

    address internal owner = makeAddr("owner");
    address internal arbitrator = makeAddr("arbitrator");

    function setUp() public {
        lock = new MockPublicLock();
        lock.setTotalSupply(100);

        address[] memory tokens = new address[](0);
        address[] memory controllers = new address[](0);
        controller = new R(owner, arbitrator, tokens, controllers);

        address[3] memory winners =
            [makeAddr("w0"), makeAddr("w1"), makeAddr("w2")];
        for (uint256 i = 0; i < 3; i++) lock.setBalance(winners[i], 1);

        handler = new RewardsHandler(controller, lock, winners);
        lock.setManager(address(handler), true); // handler is the pool creator
        vm.deal(address(handler), 1_000_000 ether);

        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = handler.createPool.selector;
        selectors[1] = handler.assignWinner.selector;
        selectors[2] = handler.warp.selector;
        selectors[3] = handler.claim.selector;
        selectors[4] = handler.reclaim.selector;
        selectors[5] = handler.dispute.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// Guards against a vacuous invariant: the handler really creates pools and moves escrow.
    function test_HandlerExercisesRealFlows() public {
        handler.createPool(123, 3);
        assertGt(handler.poolCount(), 0);
        assertGt(handler.ghostFunded(), 0);

        handler.assignWinner(0, 0, 0);
        handler.warp(3 days); // past claimStart + challenge window
        handler.claim(0, 0);
        handler.warp(40 days); // past claimEnd
        handler.reclaim(0);

        assertGt(handler.ghostPaidOut(), 0);
        assertEq(address(controller).balance, handler.ghostFunded() - handler.ghostPaidOut());
    }

    /// The contract custodies exactly the ETH it has been funded minus what it has paid out — it can
    /// never become insolvent (owe more than it holds) nor trap value beyond the unclaimed escrow.
    function invariant_EscrowSolvency() public view {
        assertEq(address(controller).balance, handler.ghostFunded() - handler.ghostPaidOut());
    }

    /// No pool ever pays out more than it was funded.
    function invariant_NoPoolOverpaid() public view {
        uint256 count = handler.poolCount();
        for (uint256 i = 0; i < count; i++) {
            R.Pool memory p = controller.getPool(handler.pools(i));
            assertLe(p.claimedAmount, p.totalFunded);
        }
    }

    /// A placement is settled by exactly one path: a winner claim or a creator reclaim, never both.
    function invariant_NoPositionClaimedAndReclaimed() public view {
        uint256 count = handler.poolCount();
        for (uint256 i = 0; i < count; i++) {
            uint256 poolId = handler.pools(i);
            R.Pool memory p = controller.getPool(poolId);
            for (uint16 pl = 1; pl <= p.positionCount; pl++) {
                (,,,,, bool claimed, bool reclaimed,) = controller.positions(poolId, pl);
                assertFalse(claimed && reclaimed);
            }
        }
    }

    /// A pool is only marked closed once every share has been settled.
    function invariant_ClosedImpliesFullySettled() public view {
        uint256 count = handler.poolCount();
        for (uint256 i = 0; i < count; i++) {
            R.Pool memory p = controller.getPool(handler.pools(i));
            if (p.closed) assertEq(p.claimedAmount, p.totalFunded);
        }
    }
}
