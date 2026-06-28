// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RewardsBase} from "./RewardsBase.t.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";

contract RewardsCloseReclaimTest is RewardsBase {
    function _createPoolWithAttendance() internal returns (uint256 poolId, uint256 total) {
        attendance.setConfig(address(lock), true, false, false, false);
        uint256[] memory a = _amounts3();
        total = a[0] + a[1] + a[2];
        vm.prank(creator);
        poolId = controller.createRewardPool{value: total}(
            _params(address(0), address(attendance), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    function _createSingleEthPool() internal returns (uint256 poolId) {
        uint256[] memory a = new uint256[](1);
        a[0] = 1 ether;
        vm.prank(creator);
        poolId = controller.createRewardPool{value: 1 ether}(
            _params(address(0), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    // ---- closePool (early exit) ----

    function test_ClosePool_NoTickets_Refunds() public {
        (uint256 poolId, uint256 total) = _createDefaultEthPool();
        lock.setTotalSupply(0);
        uint256 balBefore = creator.balance;

        vm.expectEmit(true, true, false, true, address(controller));
        emit R.PoolClosed(poolId, creator, total);
        vm.prank(creator);
        controller.closePool(poolId);

        assertEq(creator.balance, balBefore + total);
        assertTrue(_poolClosed(poolId));
        assertEq(controller.remaining(poolId), 0);
    }

    function test_ClosePool_AttendanceEarlyExit_Refunds() public {
        (uint256 poolId, uint256 total) = _createPoolWithAttendance();
        // Event cancelled and refunds completed → early exit even though tickets exist.
        attendance.setConfig(address(lock), true, true, true, true);
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        controller.closePool(poolId);
        assertEq(creator.balance, balBefore + total);
        assertTrue(_poolClosed(poolId));
    }

    function test_RevertWhen_CloseWithTicketsNoEarlyExit() public {
        (uint256 poolId,) = _createDefaultEthPool(); // totalSupply = 100, no attendance
        vm.prank(creator);
        vm.expectRevert(R.EarlyExitNotAllowed.selector);
        controller.closePool(poolId);
    }

    function test_RevertWhen_CloseAttendanceCancelIncomplete() public {
        (uint256 poolId,) = _createPoolWithAttendance();
        attendance.setConfig(address(lock), true, true, true, false); // refund not complete
        vm.prank(creator);
        vm.expectRevert(R.EarlyExitNotAllowed.selector);
        controller.closePool(poolId);
    }

    /// The no-tickets early-close is a pre-event convenience only. Once the claim phase is live,
    /// `totalSupply() == 0` no longer authorizes a full reclaim — the creator must use the
    /// time-locked, freezable reclaim() path. Guards against a lock manager zeroing supply
    /// (e.g. by burning keys) to bypass the claim-window lockout and dispute/freeze recourse.
    function test_RevertWhen_CloseNoTicketsAfterClaimStart() public {
        (uint256 poolId,) = _createDefaultEthPool();
        lock.setTotalSupply(0);
        vm.warp(DEFAULT_CLAIM_START); // claim phase is now live
        vm.prank(creator);
        vm.expectRevert(R.EarlyExitNotAllowed.selector);
        controller.closePool(poolId);
    }

    /// The attendance-proven cancel+refund early-exit stays available after the claim phase opens,
    /// since it is gated by on-chain protection state the creator cannot spoof, not by totalSupply.
    function test_ClosePool_AttendanceEarlyExit_AfterClaimStart() public {
        (uint256 poolId, uint256 total) = _createPoolWithAttendance();
        attendance.setConfig(address(lock), true, true, true, true);
        vm.warp(DEFAULT_CLAIM_START + 1 days);
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        controller.closePool(poolId);
        assertEq(creator.balance, balBefore + total);
        assertTrue(_poolClosed(poolId));
    }

    function test_RevertWhen_CloseWithAssignedWinner() public {
        (uint256 poolId,) = _createDefaultEthPool();
        lock.setTotalSupply(0);
        _assign(poolId, alice, 1);
        vm.prank(creator);
        vm.expectRevert(R.EarlyExitNotAllowed.selector); // assignedCount > 0
        controller.closePool(poolId);
    }

    function test_RevertWhen_CloseNotCreator() public {
        (uint256 poolId,) = _createDefaultEthPool();
        lock.setTotalSupply(0);
        vm.prank(stranger);
        vm.expectRevert(R.NotCreator.selector);
        controller.closePool(poolId);
    }

    function test_RevertWhen_CloseFrozen() public {
        (uint256 poolId,) = _createDefaultEthPool();
        lock.setTotalSupply(0);
        vm.prank(arbitrator);
        controller.freeze(poolId);
        vm.prank(creator);
        vm.expectRevert(R.PoolIsFrozen.selector);
        controller.closePool(poolId);
    }

    function test_RevertWhen_DoubleClose() public {
        (uint256 poolId,) = _createDefaultEthPool();
        lock.setTotalSupply(0);
        vm.startPrank(creator);
        controller.closePool(poolId);
        vm.expectRevert(R.PoolIsClosed.selector);
        controller.closePool(poolId);
        vm.stopPrank();
    }

    // ---- reclaim ----

    function test_Reclaim_FullWhenNothingClaimed() public {
        (uint256 poolId, uint256 total) = _createDefaultEthPool();
        _assign(poolId, alice, 1); // assigned but never claimed
        vm.warp(DEFAULT_CLAIM_END + 1);
        uint256 balBefore = creator.balance;

        vm.expectEmit(true, true, false, true, address(controller));
        emit R.ResidualReclaimed(poolId, creator, total);
        vm.prank(creator);
        controller.reclaim(poolId);

        assertEq(creator.balance, balBefore + total);
        assertTrue(_poolClosed(poolId));
    }

    function test_Reclaim_RemainderAfterPartialClaim() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START);
        vm.prank(alice);
        controller.claim(poolId, 1); // 3 ether out

        vm.warp(DEFAULT_CLAIM_END + 1);
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance, balBefore + 3 ether); // 6 funded - 3 claimed
    }

    function test_RevertWhen_ReclaimBeforeWindowEnd() public {
        (uint256 poolId,) = _createDefaultEthPool();
        vm.warp(DEFAULT_CLAIM_END); // not yet strictly past
        vm.prank(creator);
        vm.expectRevert(R.NotYetReclaimable.selector);
        controller.reclaim(poolId);
    }

    function test_RevertWhen_ReclaimNotCreator() public {
        (uint256 poolId,) = _createDefaultEthPool();
        vm.warp(DEFAULT_CLAIM_END + 1);
        vm.prank(stranger);
        vm.expectRevert(R.NotCreator.selector);
        controller.reclaim(poolId);
    }

    function test_RevertWhen_ReclaimWhenAllClaimed() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        _assign(poolId, bob, 2);
        _assign(poolId, carol, 3);
        vm.warp(DEFAULT_CLAIM_START);
        vm.prank(alice);
        controller.claim(poolId, 1);
        vm.prank(bob);
        controller.claim(poolId, 2);
        vm.prank(carol);
        controller.claim(poolId, 3);

        vm.warp(DEFAULT_CLAIM_END + 1);
        vm.prank(creator);
        vm.expectRevert(R.NothingToPay.selector);
        controller.reclaim(poolId);
    }

    function test_RevertWhen_ReclaimFrozenWithinBackstop() public {
        (uint256 poolId,) = _createDefaultEthPool();
        vm.prank(arbitrator);
        controller.freeze(poolId);
        vm.warp(DEFAULT_CLAIM_END + 1 days); // past claimEnd, within backstop
        vm.prank(creator);
        vm.expectRevert(R.PoolIsFrozen.selector);
        controller.reclaim(poolId);
    }

    function test_Reclaim_FrozenPastBackstop_Releases() public {
        (uint256 poolId, uint256 total) = _createDefaultEthPool();
        vm.prank(arbitrator);
        controller.freeze(poolId);
        // Backstop escape hatch: escrow is released even while frozen once the backstop elapses.
        vm.warp(DEFAULT_CLAIM_END + MAX_BACKSTOP + 1);
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance, balBefore + total);
        assertTrue(_poolClosed(poolId));
    }

    function test_RevertWhen_ReclaimAssignedFrozenPastBackstopDuringWinnerGrace() public {
        uint256 poolId = _createSingleEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START);
        vm.prank(arbitrator);
        controller.freeze(poolId);

        vm.warp(DEFAULT_CLAIM_END + MAX_BACKSTOP + 1);
        vm.prank(creator);
        vm.expectRevert(R.NotYetReclaimable.selector);
        controller.reclaim(poolId);
        assertFalse(_posReclaimed(poolId, 1));
    }

    function test_ReclaimAssignedFrozenPastBackstopAfterWinnerGrace() public {
        uint256 poolId = _createSingleEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START);
        vm.prank(arbitrator);
        controller.freeze(poolId);

        vm.warp(DEFAULT_CLAIM_END + MAX_BACKSTOP + MIN_CLAIM + 1);
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance, balBefore + 1 ether);
        assertTrue(_posReclaimed(poolId, 1));
        assertTrue(_poolClosed(poolId));
    }

    function test_ReclaimFrozenPastBackstop_SweepsNeverAssignedDuringWinnerGrace() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START);
        vm.prank(arbitrator);
        controller.freeze(poolId);

        vm.warp(DEFAULT_CLAIM_END + MAX_BACKSTOP + 1);
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance, balBefore + 3 ether);
        assertFalse(_posReclaimed(poolId, 1));
        assertTrue(_posReclaimed(poolId, 2));
        assertTrue(_posReclaimed(poolId, 3));
        assertFalse(_poolClosed(poolId));
    }

    function test_RevertWhen_ReclaimClosedPool() public {
        (uint256 poolId,) = _createDefaultEthPool();
        vm.warp(DEFAULT_CLAIM_END + 1);
        vm.startPrank(creator);
        controller.reclaim(poolId);
        vm.expectRevert(R.PoolIsClosed.selector);
        controller.reclaim(poolId); // already closed
        vm.stopPrank();
    }

    function test_RevertWhen_ReclaimUnknownPool() public {
        vm.prank(creator);
        vm.expectRevert(R.UnknownPool.selector);
        controller.reclaim(7);
    }

    // ---- per-position partial reclaim ----

    function test_Reclaim_AllNeverAssigned_FullAtPoolEnd() public {
        (uint256 poolId, uint256 total) = _createDefaultEthPool();
        vm.warp(DEFAULT_CLAIM_END + 1);
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance, balBefore + total);
        assertTrue(_poolClosed(poolId));
    }

    /// A late-assigned, single-position pool is not reclaimable until that placement's own end.
    function test_RevertWhen_ReclaimLateAssignedNotYetEnded() public {
        uint256[] memory a = new uint256[](1);
        a[0] = 1 ether;
        uint64 cs = DEFAULT_CLAIM_START;
        uint64 ce = DEFAULT_CLAIM_END;
        vm.prank(creator);
        uint256 poolId = controller.createRewardPool{value: 1 ether}(
            _params(address(0), address(0), a, cs, ce, MIN_WINDOW, _noManagers())
        );
        vm.warp(ce - 1 hours);
        _assign(poolId, alice, 1); // late

        vm.warp(ce + 1); // past pool end, before the placement's guaranteed end
        vm.prank(creator);
        vm.expectRevert(R.NotYetReclaimable.selector);
        controller.reclaim(poolId);

        vm.warp(controller.positionClaimEnd(poolId, 1) + 1);
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance, balBefore + 1 ether);
        assertTrue(_poolClosed(poolId));
    }

    /// Never-assigned + early funds reclaim at pool end; a late placement keeps the pool open until its end.
    function test_Reclaim_PartialThenFull() public {
        (uint256 poolId, uint256 total) = _createDefaultEthPool();
        _assign(poolId, alice, 1); // early → ends at pool end
        uint64 ce = DEFAULT_CLAIM_END;
        vm.warp(ce - 1 hours);
        _assign(poolId, bob, 2); // late → ends past pool end; pos 3 never assigned

        vm.warp(ce + 1);
        vm.expectEmit(true, true, false, true, address(controller));
        emit R.ResidualReclaimed(poolId, creator, 4 ether); // pos1 (3) + pos3 (1)
        vm.prank(creator);
        controller.reclaim(poolId);
        assertFalse(_poolClosed(poolId), "late pos keeps pool open");
        assertEq(controller.remaining(poolId), 2 ether);
        assertTrue(_posReclaimed(poolId, 1));
        assertTrue(_posReclaimed(poolId, 3));
        assertFalse(_posReclaimed(poolId, 2));

        vm.warp(controller.positionClaimEnd(poolId, 2) + 1);
        uint256 balBefore = creator.balance;
        vm.expectEmit(true, true, false, true, address(controller));
        emit R.ResidualReclaimed(poolId, creator, 2 ether);
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance, balBefore + 2 ether);
        assertTrue(_poolClosed(poolId));
        assertEq(controller.remaining(poolId), 0);
        assertEq(_poolClaimedAmount(poolId), total);
    }

    /// A second reclaim in the same state does not double-pay the already-swept placements.
    function test_Reclaim_Idempotent() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1); // early
        uint64 ce = DEFAULT_CLAIM_END;
        vm.warp(ce - 1 hours);
        _assign(poolId, bob, 2); // late keeps pool open after the first sweep

        vm.warp(ce + 1);
        vm.prank(creator);
        controller.reclaim(poolId); // sweeps pos1 + pos3
        uint256 balAfterFirst = creator.balance;

        vm.prank(creator);
        vm.expectRevert(R.NotYetReclaimable.selector); // nothing newly eligible; pos2 still locked
        controller.reclaim(poolId);
        assertEq(creator.balance, balAfterFirst, "no double pay");
    }

    function test_Reclaim_WinnerClaimsLateBeforeEnd_ThenCreatorReclaimsRest() public {
        (uint256 poolId,) = _createDefaultEthPool();
        uint64 ce = DEFAULT_CLAIM_END;
        vm.warp(ce - 1 hours);
        _assign(poolId, alice, 1); // late; pos 2 + 3 never assigned

        (, uint256 opensAt) = controller.claimable(poolId, 1);
        vm.warp(opensAt); // past pool end already
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertEq(alice.balance, aliceBefore + 3 ether);

        uint256 creatorBefore = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId); // pos1 claimed (skipped); pos2 + pos3 reclaimed
        assertEq(creator.balance, creatorBefore + 3 ether);
        assertTrue(_poolClosed(poolId));
        assertEq(controller.remaining(poolId), 0);
    }

    /// Regression: a share swept during a partial reclaim is terminal. Even after the arbitrator
    /// extends the window (so the assignment cutoff would otherwise pass), the creator cannot
    /// re-assign a reclaimed placement into an unclaimable state — its escrow is already returned.
    function test_RevertWhen_AssignReclaimedPosition() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1); // early
        uint64 ce = DEFAULT_CLAIM_END;
        vm.warp(ce - 1 hours);
        _assign(poolId, bob, 2); // late keeps pool open; pos3 never assigned

        vm.warp(ce + 1);
        vm.prank(creator);
        controller.reclaim(poolId); // sweeps pos1 + pos3; pos2 locked → pool stays open
        assertTrue(_posReclaimed(poolId, 3));
        assertFalse(_poolClosed(poolId));

        vm.prank(arbitrator);
        controller.extendClaimEnd(poolId, ce + 60 days);

        R.WinnerAssignment[] memory batch = new R.WinnerAssignment[](1);
        batch[0] = R.WinnerAssignment({account: carol, placement: 3});
        vm.prank(creator);
        vm.expectRevert(R.AlreadyClaimed.selector);
        controller.assignWinners(poolId, batch);
    }
}
