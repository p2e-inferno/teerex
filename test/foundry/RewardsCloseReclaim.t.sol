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
            _params(address(0), address(attendance), a, START + 7 days, START + 12 days, MIN_WINDOW, _noManagers())
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
        vm.warp(START + 12 days + 1);
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
        vm.warp(START + 7 days);
        vm.prank(alice);
        controller.claim(poolId, 1); // 3 ether out

        vm.warp(START + 12 days + 1);
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance, balBefore + 3 ether); // 6 funded - 3 claimed
    }

    function test_RevertWhen_ReclaimBeforeWindowEnd() public {
        (uint256 poolId,) = _createDefaultEthPool();
        vm.warp(START + 12 days); // not yet strictly past
        vm.prank(creator);
        vm.expectRevert(R.NotYetReclaimable.selector);
        controller.reclaim(poolId);
    }

    function test_RevertWhen_ReclaimNotCreator() public {
        (uint256 poolId,) = _createDefaultEthPool();
        vm.warp(START + 12 days + 1);
        vm.prank(stranger);
        vm.expectRevert(R.NotCreator.selector);
        controller.reclaim(poolId);
    }

    function test_RevertWhen_ReclaimWhenAllClaimed() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        _assign(poolId, bob, 2);
        _assign(poolId, carol, 3);
        vm.warp(START + 7 days);
        vm.prank(alice);
        controller.claim(poolId, 1);
        vm.prank(bob);
        controller.claim(poolId, 2);
        vm.prank(carol);
        controller.claim(poolId, 3);

        vm.warp(START + 12 days + 1);
        vm.prank(creator);
        vm.expectRevert(R.NothingToPay.selector);
        controller.reclaim(poolId);
    }

    function test_RevertWhen_ReclaimFrozenWithinBackstop() public {
        (uint256 poolId,) = _createDefaultEthPool();
        vm.prank(arbitrator);
        controller.freeze(poolId);
        vm.warp(START + 12 days + 1 days); // past claimEnd, within backstop
        vm.prank(creator);
        vm.expectRevert(R.PoolIsFrozen.selector);
        controller.reclaim(poolId);
    }

    function test_Reclaim_FrozenPastBackstop_Releases() public {
        (uint256 poolId, uint256 total) = _createDefaultEthPool();
        vm.prank(arbitrator);
        controller.freeze(poolId);
        // Backstop escape hatch: escrow is released even while frozen once the backstop elapses.
        vm.warp(START + 12 days + MAX_BACKSTOP + 1);
        uint256 balBefore = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance, balBefore + total);
        assertTrue(_poolClosed(poolId));
    }

    function test_RevertWhen_ReclaimClosedPool() public {
        (uint256 poolId,) = _createDefaultEthPool();
        vm.warp(START + 12 days + 1);
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
}
