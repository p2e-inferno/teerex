// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RewardsBase} from "./RewardsBase.t.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";

contract RewardsArbitrationTest is RewardsBase {
    uint256 internal poolId;
    uint64 internal claimEnd;

    function setUp() public override {
        super.setUp();
        (poolId,) = _createDefaultEthPool();
        claimEnd = START + 12 days;
        _assign(poolId, alice, 1);
    }

    // ---- freeze / unfreeze ----

    function test_Freeze() public {
        vm.expectEmit(true, false, false, false, address(controller));
        emit R.PoolFrozen(poolId);
        vm.prank(arbitrator);
        controller.freeze(poolId);
        assertTrue(_poolFrozen(poolId));
    }

    function test_RevertWhen_FreezeNotArbitrator() public {
        vm.prank(stranger);
        vm.expectRevert(R.NotArbitrator.selector);
        controller.freeze(poolId);
    }

    function test_RevertWhen_DoubleFreeze() public {
        vm.startPrank(arbitrator);
        controller.freeze(poolId);
        vm.expectRevert(R.PoolIsFrozen.selector);
        controller.freeze(poolId);
        vm.stopPrank();
    }

    function test_RevertWhen_FreezeUnknownPool() public {
        vm.prank(arbitrator);
        vm.expectRevert(R.UnknownPool.selector);
        controller.freeze(404);
    }

    function test_RevertWhen_FreezeClosedPool() public {
        vm.warp(START + 12 days + 1);
        vm.prank(creator);
        controller.reclaim(poolId); // closes the pool
        vm.prank(arbitrator);
        vm.expectRevert(R.PoolIsClosed.selector);
        controller.freeze(poolId);
    }

    function test_Unfreeze_ExtendsClaimEndByFrozenDuration() public {
        vm.warp(START + 7 days);
        vm.prank(arbitrator);
        controller.freeze(poolId);

        vm.warp(START + 9 days); // 2 days frozen
        vm.prank(arbitrator);
        controller.unfreeze(poolId);

        assertFalse(_poolFrozen(poolId));
        assertEq(controller.effectiveClaimEnd(poolId), claimEnd + 2 days);
    }

    function test_RevertWhen_UnfreezeNotFrozen() public {
        vm.prank(arbitrator);
        vm.expectRevert(R.NotFrozen.selector);
        controller.unfreeze(poolId);
    }

    function test_RevertWhen_UnfreezeNotArbitrator() public {
        vm.prank(arbitrator);
        controller.freeze(poolId);
        vm.prank(stranger);
        vm.expectRevert(R.NotArbitrator.selector);
        controller.unfreeze(poolId);
    }

    function test_RevertWhen_ReassignNotArbitrator() public {
        vm.prank(stranger);
        vm.expectRevert(R.NotArbitrator.selector);
        controller.reassign(poolId, 1, bob);
    }

    function test_FreezeBlocksClaim_UnfreezeRestores() public {
        vm.warp(START + 7 days);
        vm.prank(arbitrator);
        controller.freeze(poolId);

        vm.prank(alice);
        vm.expectRevert(R.PoolIsFrozen.selector);
        controller.claim(poolId, 1);

        vm.prank(arbitrator);
        controller.unfreeze(poolId);
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertTrue(_posClaimed(poolId, 1));
    }

    // ---- void ----

    function test_VoidAssignment() public {
        vm.expectEmit(true, true, true, false, address(controller));
        emit R.AssignmentVoided(poolId, 1, alice);
        vm.prank(arbitrator);
        controller.voidAssignment(poolId, 1);
        assertEq(_posWinner(poolId, 1), address(0));
        assertFalse(controller.isAssigned(poolId, alice));
        assertEq(_poolAssignedCount(poolId), 0);
    }

    function test_RevertWhen_VoidNotArbitrator() public {
        vm.prank(creator);
        vm.expectRevert(R.NotArbitrator.selector);
        controller.voidAssignment(poolId, 1);
    }

    function test_RevertWhen_VoidBadPlacement() public {
        vm.prank(arbitrator);
        vm.expectRevert(R.BadPlacement.selector);
        controller.voidAssignment(poolId, 0);
    }

    function test_RevertWhen_VoidUnassigned() public {
        vm.prank(arbitrator);
        vm.expectRevert(R.NotAssigned.selector);
        controller.voidAssignment(poolId, 2);
    }

    function test_RevertWhen_VoidClaimed() public {
        vm.warp(START + 7 days);
        vm.prank(alice);
        controller.claim(poolId, 1);
        vm.prank(arbitrator);
        vm.expectRevert(R.AlreadyClaimed.selector);
        controller.voidAssignment(poolId, 1);
    }

    // ---- reassign ----

    function test_Reassign() public {
        vm.expectEmit(true, true, false, true, address(controller));
        emit R.Reassigned(poolId, 1, alice, bob);
        vm.prank(arbitrator);
        controller.reassign(poolId, 1, bob);
        assertEq(_posWinner(poolId, 1), bob);
        assertFalse(controller.isAssigned(poolId, alice));
        assertTrue(controller.isAssigned(poolId, bob));
    }

    function test_ReassignUnassignedPlacement_IncrementsCount() public {
        vm.prank(arbitrator);
        controller.reassign(poolId, 2, bob);
        assertEq(_posWinner(poolId, 2), bob);
        assertEq(_poolAssignedCount(poolId), 2);
    }

    function test_RevertWhen_ReassignNotTicketHolder() public {
        vm.prank(arbitrator);
        vm.expectRevert(R.NotTicketHolder.selector);
        controller.reassign(poolId, 1, stranger);
    }

    function test_RevertWhen_ReassignZeroWinner() public {
        vm.prank(arbitrator);
        vm.expectRevert(R.InvalidRecipient.selector);
        controller.reassign(poolId, 1, address(0));
    }

    function test_RevertWhen_ReassignBadPlacement() public {
        vm.prank(arbitrator);
        vm.expectRevert(R.BadPlacement.selector);
        controller.reassign(poolId, 5, bob);
    }

    function test_RevertWhen_ReassignClaimed() public {
        vm.warp(START + 7 days);
        vm.prank(alice);
        controller.claim(poolId, 1);
        vm.prank(arbitrator);
        vm.expectRevert(R.AlreadyClaimed.selector);
        controller.reassign(poolId, 1, bob);
    }

    function test_RevertWhen_ReassignToAlreadyAssignedAccount() public {
        _assign(poolId, bob, 2);
        vm.prank(arbitrator);
        vm.expectRevert(R.AlreadyAssigned.selector);
        controller.reassign(poolId, 1, bob);
    }

    // ---- extend ----

    function test_ExtendClaimEnd() public {
        uint64 newEnd = claimEnd + 3 days;
        vm.expectEmit(true, false, false, true, address(controller));
        emit R.ClaimEndExtended(poolId, newEnd);
        vm.prank(arbitrator);
        controller.extendClaimEnd(poolId, newEnd);
        assertEq(controller.effectiveClaimEnd(poolId), newEnd);
    }

    function test_RevertWhen_ExtendNotLater() public {
        vm.prank(arbitrator);
        vm.expectRevert(R.BadWindow.selector);
        controller.extendClaimEnd(poolId, claimEnd);
    }

    function test_RevertWhen_ExtendNotArbitrator() public {
        vm.prank(creator);
        vm.expectRevert(R.NotArbitrator.selector);
        controller.extendClaimEnd(poolId, claimEnd + 1 days);
    }

    // ---- resolveDispute ----

    function test_ResolveDispute_ClearsHold() public {
        vm.warp(START + 150 hours);
        vm.prank(ticketHolder);
        controller.raiseDispute(poolId, 1, keccak256("x"));
        assertGt(_posHoldUntil(poolId, 1), 0);

        vm.expectEmit(true, true, false, true, address(controller));
        emit R.DisputeResolved(poolId, 1, true, keccak256("resolution"));
        vm.prank(arbitrator);
        controller.resolveDispute(poolId, 1, true, keccak256("resolution"));
        assertEq(_posHoldUntil(poolId, 1), 0);
    }

    function test_ResolveDispute_PlacementZero_JustEmits() public {
        vm.expectEmit(true, true, false, true, address(controller));
        emit R.DisputeResolved(poolId, 0, false, keccak256("r"));
        vm.prank(arbitrator);
        controller.resolveDispute(poolId, 0, false, keccak256("r"));
    }

    function test_RevertWhen_ResolveNotArbitrator() public {
        vm.prank(stranger);
        vm.expectRevert(R.NotArbitrator.selector);
        controller.resolveDispute(poolId, 1, true, keccak256("r"));
    }

    // ---- settled-position / closed-pool guards ----

    /// Builds a partially-reclaimed pool that stays OPEN: pos1 (early, alice) and pos3 (never
    /// assigned) are swept and marked reclaimed; pos2 (late, bob) is still within its guaranteed
    /// window so it stays locked. Reclaimed shares retain their winner field and their escrow is gone.
    function _partialReclaimOpenPool() internal returns (uint256 pid) {
        (pid,) = _createDefaultEthPool();
        _assign(pid, alice, 1); // early → ends at pool end
        uint64 ce = START + 12 days;
        vm.warp(ce - 1 hours);
        _assign(pid, bob, 2); // late → keeps the pool open after the sweep
        vm.warp(ce + 1);
        vm.prank(creator);
        controller.reclaim(pid); // sweeps pos1 + pos3; pos2 locked
        assertFalse(_poolClosed(pid));
        assertTrue(_posReclaimed(pid, 1));
        assertTrue(_posReclaimed(pid, 3));
    }

    function test_RevertWhen_ReassignReclaimedAssignedPosition() public {
        uint256 pid = _partialReclaimOpenPool();
        vm.prank(arbitrator);
        vm.expectRevert(R.AlreadyClaimed.selector);
        controller.reassign(pid, 1, carol); // pos1 reclaimed (winner still set)
    }

    function test_RevertWhen_ReassignReclaimedNeverAssignedPosition() public {
        uint256 pid = _partialReclaimOpenPool();
        vm.prank(arbitrator);
        vm.expectRevert(R.AlreadyClaimed.selector);
        controller.reassign(pid, 3, carol); // pos3 reclaimed (winner == 0)
    }

    function test_RevertWhen_VoidReclaimedPosition() public {
        uint256 pid = _partialReclaimOpenPool();
        vm.prank(arbitrator);
        vm.expectRevert(R.AlreadyClaimed.selector);
        controller.voidAssignment(pid, 1); // pos1 reclaimed (winner still set)
    }

    /// closePool refunds escrow and leaves positions pristine (winner == 0); arbitration must not
    /// resurrect a winner on a closed, settled pool.
    function _closedRefundedPool() internal returns (uint256 pid) {
        lock.setTotalSupply(0); // no tickets → early-exit close is allowed
        (pid,) = _createDefaultEthPool();
        vm.prank(creator);
        controller.closePool(pid);
        assertTrue(_poolClosed(pid));
    }

    function test_RevertWhen_ReassignOnClosedPool() public {
        uint256 pid = _closedRefundedPool();
        vm.prank(arbitrator);
        vm.expectRevert(R.PoolIsClosed.selector);
        controller.reassign(pid, 1, bob);
    }

    function test_RevertWhen_VoidOnClosedPool() public {
        uint256 pid = _closedRefundedPool();
        vm.prank(arbitrator);
        vm.expectRevert(R.PoolIsClosed.selector);
        controller.voidAssignment(pid, 1);
    }

    function test_RevertWhen_ExtendClaimEndOnClosedPool() public {
        uint256 pid = _closedRefundedPool();
        vm.prank(arbitrator);
        vm.expectRevert(R.PoolIsClosed.selector);
        controller.extendClaimEnd(pid, START + 100 days);
    }
}
