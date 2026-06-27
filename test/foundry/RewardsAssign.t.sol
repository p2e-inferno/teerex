// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RewardsBase} from "./RewardsBase.t.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";

contract RewardsAssignTest is RewardsBase {
    uint256 internal poolId;

    function setUp() public override {
        super.setUp();
        (poolId,) = _createDefaultEthPool();
    }

    function _batch(address account, uint16 placement)
        internal
        pure
        returns (R.WinnerAssignment[] memory batch)
    {
        batch = new R.WinnerAssignment[](1);
        batch[0] = R.WinnerAssignment({account: account, placement: placement});
    }

    function test_AssignSingle() public {
        vm.expectEmit(true, true, true, true, address(controller));
        emit R.WinnerAssigned(poolId, 1, alice, START);
        _assign(poolId, alice, 1);
        assertEq(_posWinner(poolId, 1), alice);
        assertTrue(controller.isAssigned(poolId, alice));
        assertEq(_poolAssignedCount(poolId), 1);
    }

    function test_AssignBatch() public {
        R.WinnerAssignment[] memory batch = new R.WinnerAssignment[](3);
        batch[0] = R.WinnerAssignment({account: alice, placement: 1});
        batch[1] = R.WinnerAssignment({account: bob, placement: 2});
        batch[2] = R.WinnerAssignment({account: carol, placement: 3});
        vm.prank(creator);
        controller.assignWinners(poolId, batch);
        assertEq(_posWinner(poolId, 1), alice);
        assertEq(_posWinner(poolId, 2), bob);
        assertEq(_posWinner(poolId, 3), carol);
        assertEq(_poolAssignedCount(poolId), 3);
    }

    function test_ManagerCanAssign() public {
        vm.prank(creator);
        controller.addManager(poolId, manager);
        _assignAs(manager, poolId, alice, 1);
        assertEq(_posWinner(poolId, 1), alice);
    }

    function test_ReplaceWinnerBeforeClaimStart() public {
        _assign(poolId, alice, 1);
        vm.expectEmit(true, true, false, true, address(controller));
        emit R.WinnerReplaced(poolId, 1, alice, bob);
        _assign(poolId, bob, 1);
        assertEq(_posWinner(poolId, 1), bob);
        assertFalse(controller.isAssigned(poolId, alice), "old winner released");
        assertTrue(controller.isAssigned(poolId, bob));
        assertEq(_poolAssignedCount(poolId), 1, "count unchanged on replace");
    }

    function test_RevertWhen_ReplaceAfterClaimStart() public {
        _assign(poolId, alice, 1);
        vm.warp(START + 7 days); // claimStart
        vm.prank(creator);
        vm.expectRevert(R.CannotReplaceAfterClaimStart.selector);
        controller.assignWinners(poolId, _batch(bob, 1));
    }

    function test_RevertWhen_NotManager() public {
        vm.prank(stranger);
        vm.expectRevert(R.NotManager.selector);
        controller.assignWinners(poolId, _batch(alice, 1));
    }

    function test_RevertWhen_BadPlacementZero() public {
        vm.prank(creator);
        vm.expectRevert(R.BadPlacement.selector);
        controller.assignWinners(poolId, _batch(alice, 0));
    }

    function test_RevertWhen_BadPlacementTooHigh() public {
        vm.prank(creator);
        vm.expectRevert(R.BadPlacement.selector);
        controller.assignWinners(poolId, _batch(alice, 4));
    }

    function test_RevertWhen_ZeroAccount() public {
        vm.prank(creator);
        vm.expectRevert(R.InvalidRecipient.selector);
        controller.assignWinners(poolId, _batch(address(0), 1));
    }

    function test_RevertWhen_NotTicketHolder() public {
        vm.prank(creator);
        vm.expectRevert(R.NotTicketHolder.selector);
        controller.assignWinners(poolId, _batch(stranger, 1));
    }

    function test_RevertWhen_SameAccountTwoPlacements() public {
        _assign(poolId, alice, 1);
        vm.prank(creator);
        vm.expectRevert(R.AlreadyAssigned.selector);
        controller.assignWinners(poolId, _batch(alice, 2));
    }

    function test_RevertWhen_BatchTooLarge() public {
        R.WinnerAssignment[] memory batch = new R.WinnerAssignment[](51);
        vm.prank(creator);
        vm.expectRevert(R.BatchTooLarge.selector);
        controller.assignWinners(poolId, batch);
    }

    function test_RevertWhen_AssignToClosedPool() public {
        vm.warp(START + 12 days + 1);
        vm.prank(creator);
        controller.reclaim(poolId); // closes the pool
        vm.prank(creator);
        vm.expectRevert(R.PoolIsClosed.selector);
        controller.assignWinners(poolId, _batch(alice, 1));
    }

    function test_RevertWhen_AssignToFrozenPool() public {
        vm.prank(arbitrator);
        controller.freeze(poolId);
        vm.prank(creator);
        vm.expectRevert(R.PoolIsFrozen.selector);
        controller.assignWinners(poolId, _batch(alice, 1));
    }
}
