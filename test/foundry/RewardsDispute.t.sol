// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RewardsBase} from "./RewardsBase.t.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";

contract RewardsDisputeTest is RewardsBase {
    uint256 internal poolId;
    bytes32 internal constant REASON = keccak256("looks wrong");

    // claimStart = START + 7 days = START + 168h; assignedAt = START, window 30h, so the natural
    // open for placement 1 is START + 168h.
    uint64 internal constant NATURAL_OPEN = START + 168 hours;

    function setUp() public override {
        super.setUp();
        (poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
    }

    function _dispute(address who, uint16 placement) internal {
        vm.prank(who);
        controller.raiseDispute(poolId, placement, REASON);
    }

    function test_DisputeWithinWindow_AppliesCappedHold() public {
        vm.warp(START + 150 hours); // within 24h before natural open
        vm.expectEmit(true, true, true, true, address(controller));
        emit R.DisputeRaised(poolId, 1, ticketHolder, REASON);
        _dispute(ticketHolder, 1);
        assertEq(_posHoldUntil(poolId, 1), START + 150 hours + MAX_HOLD);
        // Hold cannot push the open by more than MAX_HOLD beyond the natural open.
        assertLe(_posHoldUntil(poolId, 1), NATURAL_OPEN + MAX_HOLD);
    }

    function test_DisputeHoldDelaysClaim() public {
        vm.warp(START + 150 hours);
        _dispute(ticketHolder, 1);

        vm.warp(NATURAL_OPEN); // would be open without the hold
        vm.prank(alice);
        vm.expectRevert(R.WindowNotOpen.selector);
        controller.claim(poolId, 1);

        vm.warp(START + 150 hours + MAX_HOLD); // hold expiry
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertTrue(_posClaimed(poolId, 1));
    }

    function test_EarlyInertDispute_DoesNotConsumeOneTimeHold() public {
        // Far before the open: hold would not exceed the natural open, so it is inert...
        _dispute(ticketHolder, 1);
        assertEq(_posHoldUntil(poolId, 1), 0);

        // ...and the one-time hold is still available later.
        vm.warp(START + 150 hours);
        _dispute(ticketHolder, 1);
        assertEq(_posHoldUntil(poolId, 1), START + 150 hours + MAX_HOLD);
    }

    function test_SecondDisputeAfterHoldUsed_NoChange() public {
        vm.warp(START + 150 hours);
        _dispute(ticketHolder, 1);
        uint64 held = _posHoldUntil(poolId, 1);

        vm.warp(START + 155 hours);
        _dispute(bob, 1);
        assertEq(_posHoldUntil(poolId, 1), held, "hold is one-time");
    }

    function test_DisputeAfterOpen_NoHold() public {
        vm.warp(NATURAL_OPEN);
        _dispute(ticketHolder, 1);
        assertEq(_posHoldUntil(poolId, 1), 0);
    }

    function test_DisputeUnassignedPlacement_NoHold() public {
        vm.warp(START + 150 hours);
        _dispute(ticketHolder, 2); // placement 2 has no winner
        assertEq(_posHoldUntil(poolId, 2), 0);
    }

    function test_DisputeClaimedPlacement_NoHold() public {
        vm.warp(NATURAL_OPEN);
        vm.prank(alice);
        controller.claim(poolId, 1);
        _dispute(ticketHolder, 1);
        assertEq(_posHoldUntil(poolId, 1), 0);
    }

    function test_GeneralDispute_PlacementZero_JustEmits() public {
        vm.warp(START + 150 hours);
        vm.expectEmit(true, true, true, true, address(controller));
        emit R.DisputeRaised(poolId, 0, ticketHolder, REASON);
        _dispute(ticketHolder, 0);
    }

    function test_RevertWhen_DisputerNotTicketHolder() public {
        vm.prank(stranger);
        vm.expectRevert(R.NotTicketHolder.selector);
        controller.raiseDispute(poolId, 1, REASON);
    }

    function test_RevertWhen_DisputeBadPlacement() public {
        vm.prank(ticketHolder);
        vm.expectRevert(R.BadPlacement.selector);
        controller.raiseDispute(poolId, 4, REASON);
    }

    function test_RevertWhen_DisputeClosedPool() public {
        vm.warp(START + 12 days + 1);
        vm.prank(creator);
        controller.reclaim(poolId); // closes pool
        vm.prank(ticketHolder);
        vm.expectRevert(R.PoolIsClosed.selector);
        controller.raiseDispute(poolId, 1, REASON);
    }

    /// Even when a dispute hold pushes a late winner's start past the pool end, the per-position end
    /// still grants the full MIN_CLAIM_DURATION — the hold cannot erode the guaranteed window.
    function test_DisputeHold_StillGuaranteesMinClaimDuration() public {
        uint256[] memory a = new uint256[](1);
        a[0] = 1 ether;
        uint64 cs = START + 7 days;
        uint64 ce = START + 12 days;
        vm.prank(creator);
        uint256 latePool = controller.createRewardPool{value: 1 ether}(
            _params(address(0), address(0), a, cs, ce, MIN_WINDOW, _noManagers())
        );
        vm.warp(ce - 1 hours);
        _assign(latePool, alice, 1); // natural open = ce + 29h

        vm.warp(ce + 6 hours); // within MAX_HOLD before the natural open
        vm.prank(ticketHolder);
        controller.raiseDispute(latePool, 1, REASON);

        (, uint256 opensAt) = controller.claimable(latePool, 1);
        uint256 end = controller.positionClaimEnd(latePool, 1);
        assertEq(end, opensAt + MIN_CLAIM); // full window after the (held) start
        assertGt(opensAt + MIN_CLAIM, uint256(ce)); // guarantee is binding past the pool end

        vm.warp(opensAt);
        vm.prank(alice);
        controller.claim(latePool, 1); // claimable within the guaranteed window
        assertTrue(_posClaimed(latePool, 1));
    }
}
