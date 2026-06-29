// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RewardsBase} from "./RewardsBase.t.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";
import {ClaimAttacker} from "./mocks/ClaimAttacker.sol";

contract RewardsClaimTest is RewardsBase {
    function test_ClaimEth_HappyPath() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);

        (bool canClaimBefore, uint256 opensAt) = controller.claimable(poolId, 1);
        assertFalse(canClaimBefore);
        assertEq(opensAt, DEFAULT_CLAIM_START); // claimStart dominates the 30h window

        vm.warp(DEFAULT_CLAIM_START);
        (bool canClaimNow,) = controller.claimable(poolId, 1);
        assertTrue(canClaimNow);

        uint256 balBefore = alice.balance;
        vm.expectEmit(true, true, true, true, address(controller));
        emit R.PrizeClaimed(poolId, 1, alice, 3 ether);
        vm.prank(alice);
        controller.claim(poolId, 1);

        assertEq(alice.balance, balBefore + 3 ether);
        assertTrue(_posClaimed(poolId, 1));
        assertEq(controller.remaining(poolId), 6 ether - 3 ether);
        assertEq(_poolClaimedAmount(poolId), 3 ether);
    }

    function test_ClaimErc20_HappyPath() public {
        (uint256 poolId,) = _createDefaultErc20Pool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START);
        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertEq(token.balanceOf(alice), balBefore + 300e6);
    }

    function test_ChallengeWindowCanDominateClaimStart() public {
        // claimStart sooner than assignedAt + window → window governs when the prize opens.
        uint256[] memory a = new uint256[](1);
        a[0] = 1 ether;
        uint64 cs = START + 20 hours;
        vm.prank(creator);
        uint256 poolId = controller.createRewardPool{value: 1 ether}(
            _params(address(0), address(0), a, cs, cs + MIN_CLAIM, MIN_WINDOW, _noManagers())
        );
        _assign(poolId, alice, 1); // assignedAt = START, opens at START + 30h

        (, uint256 opensAt) = controller.claimable(poolId, 1);
        assertEq(opensAt, START + MIN_WINDOW);

        vm.warp(cs); // past claimStart but before window opens
        vm.prank(alice);
        vm.expectRevert(R.WindowNotOpen.selector);
        controller.claim(poolId, 1);

        vm.warp(START + MIN_WINDOW);
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertTrue(_posClaimed(poolId, 1));
    }

    function test_RevertWhen_ClaimBeforeOpen() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START - 1);
        vm.prank(alice);
        vm.expectRevert(R.WindowNotOpen.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_ClaimAfterWindowClosed() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_END + 1); // past claimEnd
        vm.prank(alice);
        vm.expectRevert(R.WindowClosed.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_ClaimNotWinner() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START);
        vm.prank(bob);
        vm.expectRevert(R.NotWinner.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_DoubleClaim() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START);
        vm.startPrank(alice);
        controller.claim(poolId, 1);
        vm.expectRevert(R.AlreadyClaimed.selector);
        controller.claim(poolId, 1);
        vm.stopPrank();
    }

    function test_RevertWhen_ClaimFrozenPool() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START);
        vm.prank(arbitrator);
        controller.freeze(poolId);
        vm.prank(alice);
        vm.expectRevert(R.PoolIsFrozen.selector);
        controller.claim(poolId, 1);
    }

    function test_ClaimFrozenPoolPastBackstopDuringGrace() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START);
        vm.prank(arbitrator);
        controller.freeze(poolId);

        uint256 graceEnd = DEFAULT_CLAIM_END + MAX_BACKSTOP + MIN_CLAIM;
        assertEq(controller.positionClaimEnd(poolId, 1), graceEnd);

        vm.warp(DEFAULT_CLAIM_END + MAX_BACKSTOP);
        vm.prank(alice);
        vm.expectRevert(R.PoolIsFrozen.selector);
        controller.claim(poolId, 1);

        vm.warp(DEFAULT_CLAIM_END + MAX_BACKSTOP + 1);
        (bool canClaim,) = controller.claimable(poolId, 1);
        assertTrue(canClaim);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertEq(alice.balance, balBefore + 3 ether);
    }

    function test_RevertWhen_ClaimFrozenPoolAfterBackstopGrace() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_START);
        vm.prank(arbitrator);
        controller.freeze(poolId);

        vm.warp(DEFAULT_CLAIM_END + MAX_BACKSTOP + MIN_CLAIM + 1);
        (bool canClaim,) = controller.claimable(poolId, 1);
        assertFalse(canClaim);

        vm.prank(alice);
        vm.expectRevert(R.WindowClosed.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_FreezeAfterExpiredWindowDoesNotReopenClaim() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);

        vm.warp(DEFAULT_CLAIM_END + 1);
        vm.prank(arbitrator);
        controller.freeze(poolId);

        vm.warp(DEFAULT_CLAIM_END + MAX_BACKSTOP + 1);
        (bool canClaim,) = controller.claimable(poolId, 1);
        assertFalse(canClaim);

        vm.prank(alice);
        vm.expectRevert(R.WindowClosed.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_ClaimClosedPool() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(DEFAULT_CLAIM_END + 1); // window closed; creator reclaims
        vm.prank(creator);
        controller.reclaim(poolId);
        vm.prank(alice);
        vm.expectRevert(R.PoolIsClosed.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_NativePayoutRejected() public {
        (uint256 poolId,) = _createDefaultEthPool();
        ClaimAttacker attacker = new ClaimAttacker(address(controller));
        attacker.configure(poolId, false, 0, false); // rejects ETH
        lock.setBalance(address(attacker), 1);
        _assign(poolId, address(attacker), 1);
        vm.warp(DEFAULT_CLAIM_START);
        vm.expectRevert(R.NativeTransferFailed.selector);
        attacker.doClaim(1);
    }

    function test_ReentrantClaimBlocked_NoFundsLeak() public {
        (uint256 poolId,) = _createDefaultEthPool();
        ClaimAttacker attacker = new ClaimAttacker(address(controller));
        attacker.configure(poolId, true, 1, true); // re-enters claim(poolId, 1)
        lock.setBalance(address(attacker), 1);
        _assign(poolId, address(attacker), 1);
        vm.warp(DEFAULT_CLAIM_START);

        uint256 escrowBefore = address(controller).balance;
        // Reentry hits the nonReentrant guard inside receive(); the low-level pay then fails.
        vm.expectRevert(R.NativeTransferFailed.selector);
        attacker.doClaim(1);

        assertEq(address(controller).balance, escrowBefore, "no escrow left the contract");
        assertFalse(_posClaimed(poolId, 1), "claim rolled back");
    }

    function test_RevertWhen_ClaimUnknownPool() public {
        vm.prank(alice);
        vm.expectRevert(R.UnknownPool.selector);
        controller.claim(123, 1);
    }

    // --- Per-position guaranteed claim window ---

    /// A winner assigned late gets MIN_CLAIM_DURATION after their effective start, even past pool end.
    function test_LateAssignedWinner_CanClaimPastPoolEnd() public {
        (uint256 poolId,) = _createDefaultEthPool();
        uint64 ce = DEFAULT_CLAIM_END; // pool claim end

        vm.warp(ce - 1 hours);
        _assign(poolId, alice, 1); // late: assignedAt = ce - 1h

        uint256 expectedOpen = uint256(ce - 1 hours) + MIN_WINDOW; // ce + 29h, past pool end
        uint256 expectedEnd = expectedOpen + MIN_CLAIM;
        (, uint256 opensAt) = controller.claimable(poolId, 1);
        assertEq(opensAt, expectedOpen);
        assertEq(controller.positionClaimEnd(poolId, 1), expectedEnd);
        assertGt(expectedOpen, ce); // opens after the pool-level end

        vm.warp(expectedOpen); // exact effective start (>= boundary)
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertEq(alice.balance, balBefore + 3 ether);
    }

    /// Late winner can claim at the exact per-position end (<= boundary).
    function test_Claim_LateAtExactPerPositionEnd() public {
        (uint256 poolId,) = _createDefaultEthPool();
        uint64 ce = DEFAULT_CLAIM_END;
        vm.warp(ce - 1 hours);
        _assign(poolId, alice, 1);

        uint256 end = controller.positionClaimEnd(poolId, 1);
        vm.warp(end);
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertTrue(_posClaimed(poolId, 1));
    }

    function test_RevertWhen_ClaimOneSecBeforeEffectiveStart_Late() public {
        (uint256 poolId,) = _createDefaultEthPool();
        uint64 ce = DEFAULT_CLAIM_END;
        vm.warp(ce - 1 hours);
        _assign(poolId, alice, 1);

        (, uint256 opensAt) = controller.claimable(poolId, 1);
        vm.warp(opensAt - 1);
        vm.prank(alice);
        vm.expectRevert(R.WindowNotOpen.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_ClaimOneSecAfterPerPositionEnd_Late() public {
        (uint256 poolId,) = _createDefaultEthPool();
        uint64 ce = DEFAULT_CLAIM_END;
        vm.warp(ce - 1 hours);
        _assign(poolId, alice, 1);

        uint256 end = controller.positionClaimEnd(poolId, 1);
        vm.warp(end + 1);
        vm.prank(alice);
        vm.expectRevert(R.WindowClosed.selector);
        controller.claim(poolId, 1);
    }

    /// An early-assigned winner gets no extra time: their window closes at the pool end.
    function test_EarlyAssigned_ClosesAtPoolEnd() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1); // assignedAt = START (early)
        uint64 ce = DEFAULT_CLAIM_END;
        assertEq(controller.positionClaimEnd(poolId, 1), ce);

        vm.warp(ce); // exact pool end still claimable
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertTrue(_posClaimed(poolId, 1));
    }

    /// Boundary: when start + MIN_CLAIM_DURATION == pool end, the per-position end ties to pool end.
    function test_TieCase_StartPlusMinEqualsPoolEnd() public {
        uint256[] memory a = new uint256[](1);
        a[0] = 1 ether;
        uint64 cs = DEFAULT_CLAIM_START;
        uint64 ce = cs + MIN_CLAIM; // exactly the minimum window
        vm.prank(creator);
        uint256 poolId = controller.createRewardPool{value: 1 ether}(
            _params(address(0), address(0), a, cs, ce, MIN_WINDOW, _noManagers())
        );
        _assign(poolId, alice, 1); // early: opens at cs (claimStart dominates 30h)

        assertEq(controller.positionClaimEnd(poolId, 1), ce); // tie: cs + MIN_CLAIM == ce
    }

    /// A reclaimed placement cannot be claimed (guard runs before the window check).
    function test_RevertWhen_ClaimReclaimedPosition() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1); // early
        uint64 ce = DEFAULT_CLAIM_END;
        vm.warp(ce - 1 hours);
        _assign(poolId, bob, 2); // late: locks reclaim of pool past pool end

        vm.warp(ce + 1); // pos1 + never-assigned pos3 reclaimable; pos2 still locked
        vm.prank(creator);
        controller.reclaim(poolId);
        assertTrue(_posReclaimed(poolId, 1));
        assertFalse(_poolClosed(poolId)); // pos2 keeps the pool open

        vm.prank(alice);
        vm.expectRevert(R.AlreadyClaimed.selector);
        controller.claim(poolId, 1);
    }
}
