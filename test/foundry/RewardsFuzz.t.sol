// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RewardsBase} from "./RewardsBase.t.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";

contract RewardsFuzzTest is RewardsBase {
    uint256 internal constant MAX_PRIZE = 1e24; // 1M ether per placement
    uint64 internal constant FUZZ_CLAIM_END = DEFAULT_CLAIM_START + 30 days;

    function _create3PosEthPool(uint256 x1, uint256 x2, uint256 x3, uint64 cs, uint64 ce)
        internal
        returns (uint256 poolId, uint256 total)
    {
        total = x1 + x2 + x3;
        vm.deal(creator, total);
        uint256[] memory a = new uint256[](3);
        a[0] = x1;
        a[1] = x2;
        a[2] = x3;
        vm.prank(creator);
        poolId = controller.createRewardPool{value: total}(
            _params(address(0), address(0), a, cs, ce, MIN_WINDOW, _noManagers())
        );
    }

    /// Funding is exact: escrow equals the summed prize, never more or less.
    function testFuzz_EthFundingExact(uint96 a1, uint96 a2, uint96 a3) public {
        uint256 x1 = bound(a1, 1, MAX_PRIZE);
        uint256 x2 = bound(a2, 1, MAX_PRIZE);
        uint256 x3 = bound(a3, 1, MAX_PRIZE);
        (uint256 poolId, uint256 total) = _create3PosEthPool(x1, x2, x3, DEFAULT_CLAIM_START, FUZZ_CLAIM_END);
        assertEq(address(controller).balance, total);
        assertEq(controller.remaining(poolId), total);
        assertEq(controller.getPool(poolId).totalFunded, total);
    }

    /// Any ETH value other than the exact total is rejected.
    function testFuzz_EthFundingMismatchReverts(uint96 a1, uint96 a2, uint96 a3, uint96 sent) public {
        uint256 x1 = bound(a1, 1, MAX_PRIZE);
        uint256 x2 = bound(a2, 1, MAX_PRIZE);
        uint256 x3 = bound(a3, 1, MAX_PRIZE);
        uint256 total = x1 + x2 + x3;
        vm.assume(sent != total);
        vm.deal(creator, sent);
        uint256[] memory a = new uint256[](3);
        a[0] = x1;
        a[1] = x2;
        a[2] = x3;
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(R.BadFunding.selector, total, uint256(sent)));
        controller.createRewardPool{value: sent}(
            _params(address(0), address(0), a, DEFAULT_CLAIM_START, FUZZ_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    /// The three window rules accept exactly the valid region and reject everything else.
    function testFuzz_WindowValidation(uint64 cs, uint64 ce, uint64 window) public {
        cs = uint64(bound(cs, START - 10 days, START + 3650 days));
        ce = uint64(bound(ce, START, START + 4000 days));
        window = uint64(bound(window, 0, 365 days));

        bool valid = cs > START && ce >= cs + MIN_CLAIM && window >= MIN_WINDOW;
        uint256[] memory a = _amounts3();
        vm.deal(creator, 6 ether);
        vm.prank(creator);
        if (valid) {
            uint256 poolId = controller.createRewardPool{value: 6 ether}(
                _params(address(0), address(0), a, cs, ce, window, _noManagers())
            );
            assertEq(controller.remaining(poolId), 6 ether);
        } else {
            vm.expectRevert(R.BadWindow.selector);
            controller.createRewardPool{value: 6 ether}(
                _params(address(0), address(0), a, cs, ce, window, _noManagers())
            );
        }
    }

    /// claim opens exactly at max(claimStart, assignedAt + window): one second early reverts.
    function testFuzz_ClaimOpensAtBoundary(uint64 startOffset, uint64 window) public {
        uint64 cs = uint64(bound(startOffset, 1 hours, 3650 days)) + START;
        uint64 w = uint64(bound(window, MIN_WINDOW, 365 days));
        uint64 ce = cs + w + 30 days; // guarantees the window is open at opensAt

        uint256[] memory a = new uint256[](1);
        a[0] = 1 ether;
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        uint256 poolId = controller.createRewardPool{value: 1 ether}(
            _params(address(0), address(0), a, cs, ce, w, _noManagers())
        );
        _assign(poolId, alice, 1); // assignedAt = START

        uint256 expectedOpen = cs > START + w ? cs : START + w;
        (, uint256 opensAt) = controller.claimable(poolId, 1);
        assertEq(opensAt, expectedOpen);

        vm.warp(expectedOpen - 1);
        vm.prank(alice);
        vm.expectRevert(R.WindowNotOpen.selector);
        controller.claim(poolId, 1);

        vm.warp(expectedOpen);
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertTrue(_posClaimed(poolId, 1));
    }

    /// A free dispute hold never pushes the open more than MAX_HOLD past the natural open, and is
    /// applied iff the dispute lands strictly within MAX_HOLD before that open.
    function testFuzz_DisputeHoldCap(uint64 disputeAt) public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        uint64 naturalOpen = DEFAULT_CLAIM_START; // claimStart dominates the 30h window

        disputeAt = uint64(bound(disputeAt, START, naturalOpen + 10 days));
        vm.warp(disputeAt);
        vm.prank(ticketHolder);
        controller.raiseDispute(poolId, 1, keccak256("x"), MAX_HOLD);

        uint64 hold = _posHoldUntil(poolId, 1);
        if (hold != 0) {
            assertEq(hold, disputeAt + MAX_HOLD);
            assertLe(hold, naturalOpen + MAX_HOLD);
            assertLt(disputeAt, naturalOpen);
        } else {
            assertTrue(disputeAt >= naturalOpen || disputeAt + MAX_HOLD <= naturalOpen);
        }
    }

    /// Value is conserved across any subset of claims: paid out + still escrowed == total funded,
    /// and every claimed placement receives exactly its declared amount.
    function testFuzz_ConservationAcrossClaims(uint96 a1, uint96 a2, uint96 a3, uint8 mask) public {
        uint256[3] memory amt =
            [bound(a1, 1, MAX_PRIZE), bound(a2, 1, MAX_PRIZE), bound(a3, 1, MAX_PRIZE)];
        (uint256 poolId, uint256 total) = _create3PosEthPool(amt[0], amt[1], amt[2], DEFAULT_CLAIM_START, FUZZ_CLAIM_END);

        address[3] memory winners = [alice, bob, carol];
        for (uint16 i = 0; i < 3; i++) _assign(poolId, winners[i], i + 1);
        vm.warp(DEFAULT_CLAIM_START);

        uint256 paid;
        for (uint16 i = 0; i < 3; i++) {
            if ((mask >> i) & 1 == 1) {
                uint256 before = winners[i].balance;
                vm.prank(winners[i]);
                controller.claim(poolId, i + 1);
                assertEq(winners[i].balance - before, amt[i]);
                paid += amt[i];
            }
        }
        assertEq(address(controller).balance, total - paid);
        assertEq(controller.remaining(poolId), total - paid);
    }

    /// After the window closes, the creator reclaims exactly the unclaimed remainder and the escrow
    /// is emptied.
    function testFuzz_ReclaimReturnsRemainder(uint96 a1, uint96 a2, uint96 a3, uint8 mask) public {
        uint256[3] memory amt =
            [bound(a1, 1, MAX_PRIZE), bound(a2, 1, MAX_PRIZE), bound(a3, 1, MAX_PRIZE)];
        (uint256 poolId, uint256 total) = _create3PosEthPool(amt[0], amt[1], amt[2], DEFAULT_CLAIM_START, FUZZ_CLAIM_END);

        address[3] memory winners = [alice, bob, carol];
        for (uint16 i = 0; i < 3; i++) _assign(poolId, winners[i], i + 1);
        vm.warp(DEFAULT_CLAIM_START);

        uint256 paid;
        for (uint16 i = 0; i < 3; i++) {
            if ((mask >> i) & 1 == 1) {
                vm.prank(winners[i]);
                controller.claim(poolId, i + 1);
                paid += amt[i];
            }
        }

        vm.warp(FUZZ_CLAIM_END + 1);
        if (total - paid == 0) {
            vm.prank(creator);
            vm.expectRevert(R.NothingToPay.selector);
            controller.reclaim(poolId);
        } else {
            uint256 before = creator.balance;
            vm.prank(creator);
            controller.reclaim(poolId);
            assertEq(creator.balance - before, total - paid);
            assertEq(address(controller).balance, 0);
        }
    }

    // --- per-position window / cutoff / partial reclaim ---

    /// positionClaimEnd == max(poolEnd, opensAt + MIN_CLAIM) for any assignment time and window, and
    /// the placement is always claimable at its own opensAt — the guarantee holds regardless of inputs.
    function testFuzz_PerPositionWindow(uint64 csOff, uint64 winRaw, uint64 ceExtra, uint64 assignOff) public {
        uint64 cs = START + uint64(bound(csOff, 1 hours, 365 days));
        uint64 win = uint64(bound(winRaw, MIN_WINDOW, 365 days));
        uint64 ce = cs + MIN_CLAIM + uint64(bound(ceExtra, 0, 365 days));
        uint64 t = uint64(bound(assignOff, START, ce)); // within the initial-assignment cutoff

        uint256[] memory a = new uint256[](1);
        a[0] = 1 ether;
        vm.prank(creator);
        uint256 poolId = controller.createRewardPool{value: 1 ether}(
            _params(address(0), address(0), a, cs, ce, win, _noManagers())
        );

        vm.warp(t);
        _assign(poolId, alice, 1);

        uint256 opensExpected = cs > uint256(t) + win ? cs : uint256(t) + win;
        uint256 endExpected = uint256(ce) > opensExpected + MIN_CLAIM ? uint256(ce) : opensExpected + MIN_CLAIM;

        (, uint256 opensAt) = controller.claimable(poolId, 1);
        assertEq(opensAt, opensExpected);
        assertEq(controller.positionClaimEnd(poolId, 1), endExpected);
        assertGe(endExpected, opensExpected + MIN_CLAIM); // guaranteed minimum window
        assertGe(endExpected, uint256(ce));               // never shorter than the pool end

        vm.warp(opensExpected);
        vm.prank(alice);
        controller.claim(poolId, 1); // claimable at the exact start regardless of how late
        assertTrue(_posClaimed(poolId, 1));
    }

    /// Initial assignment succeeds iff at/under the cutoff (pool end), else reverts AssignmentWindowClosed.
    function testFuzz_AssignmentCutoff(uint64 assignOff) public {
        (uint256 poolId,) = _createDefaultEthPool();
        uint64 ce = DEFAULT_CLAIM_END;
        uint64 t = uint64(bound(assignOff, START + 1, START + 90 days));

        vm.warp(t);
        if (t <= ce) {
            _assign(poolId, alice, 1);
            assertEq(_posWinner(poolId, 1), alice);
        } else {
            R.WinnerAssignment[] memory b = new R.WinnerAssignment[](1);
            b[0] = R.WinnerAssignment({account: alice, placement: 1});
            vm.prank(creator);
            vm.expectRevert(R.AssignmentWindowClosed.selector);
            controller.assignWinners(poolId, b);
        }
    }

    /// A late winner can claim at ANY instant inside their guaranteed [opensAt, positionClaimEnd] window.
    function testFuzz_LateWinnerClaimsWithinWindow(uint64 assignOff, uint64 claimOff) public {
        (uint256 poolId,) = _createDefaultEthPool();
        uint64 ce = DEFAULT_CLAIM_END;
        uint64 t = uint64(bound(assignOff, ce - 2 days, ce)); // late, still within the cutoff

        vm.warp(t);
        _assign(poolId, alice, 1);

        (, uint256 opensAt) = controller.claimable(poolId, 1);
        uint256 end = controller.positionClaimEnd(poolId, 1);
        uint256 claimTime = bound(claimOff, opensAt, end);

        vm.warp(claimTime);
        vm.prank(alice);
        controller.claim(poolId, 1);
        assertTrue(_posClaimed(poolId, 1));
    }

    /// A freeze blocks through the backstop, then only an interrupted assigned winner gets the
    /// bounded post-backstop grace; a freeze after the normal end never reopens the position.
    function testFuzz_FrozenBackstopClaimBoundary(uint64 freezeRaw, uint64 claimRaw) public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);

        uint256 normalEnd = DEFAULT_CLAIM_END;
        uint64 freezeAt = uint64(bound(uint256(freezeRaw), START, normalEnd + 1 days));
        vm.warp(freezeAt);
        vm.prank(arbitrator);
        controller.freeze(poolId);

        uint256 expectedEnd = freezeAt <= normalEnd ? normalEnd + MAX_BACKSTOP + MIN_CLAIM : normalEnd;
        assertEq(controller.positionClaimEnd(poolId, 1), expectedEnd);

        uint256 latest = normalEnd + MAX_BACKSTOP + MIN_CLAIM + 2 days;
        uint256 claimTime = bound(uint256(claimRaw), freezeAt, latest);
        vm.warp(claimTime);

        bool freezeBlocks = claimTime <= normalEnd + MAX_BACKSTOP;
        bool expectedCanClaim =
            claimTime >= DEFAULT_CLAIM_START && claimTime <= expectedEnd && !freezeBlocks;
        (bool canClaim,) = controller.claimable(poolId, 1);
        assertEq(canClaim, expectedCanClaim);

        vm.prank(alice);
        if (expectedCanClaim) {
            controller.claim(poolId, 1);
            assertTrue(_posClaimed(poolId, 1));
        } else if (freezeBlocks) {
            vm.expectRevert(R.PoolIsFrozen.selector);
            controller.claim(poolId, 1);
        } else if (claimTime < DEFAULT_CLAIM_START) {
            vm.expectRevert(R.WindowNotOpen.selector);
            controller.claim(poolId, 1);
        } else {
            vm.expectRevert(R.WindowClosed.selector);
            controller.claim(poolId, 1);
        }
    }

    /// With winners assigned at arbitrary (sorted) times and never claimed, a single reclaim once past
    /// every per-position end returns the whole escrow and closes the pool — partial reclaim collapses
    /// to a full, conservation-preserving sweep.
    function testFuzz_PartialReclaimEventuallyFull(uint64 r1, uint64 r2, uint64 r3) public {
        (uint256 poolId, uint256 total) = _createDefaultEthPool();
        uint64 ce = DEFAULT_CLAIM_END;

        uint64[3] memory ts = [
            uint64(bound(r1, START, ce)),
            uint64(bound(r2, START, ce)),
            uint64(bound(r3, START, ce))
        ];
        // Non-decreasing so the warps only move forward.
        if (ts[0] > ts[1]) (ts[0], ts[1]) = (ts[1], ts[0]);
        if (ts[1] > ts[2]) (ts[1], ts[2]) = (ts[2], ts[1]);
        if (ts[0] > ts[1]) (ts[0], ts[1]) = (ts[1], ts[0]);

        address[3] memory winners = [alice, bob, carol];
        for (uint16 i = 0; i < 3; i++) {
            vm.warp(ts[i]);
            _assign(poolId, winners[i], i + 1);
        }

        // Past the maximum possible per-position end (latest assign <= ce; +window +MIN_CLAIM).
        vm.warp(uint256(ce) + MIN_WINDOW + MIN_CLAIM + 1);
        uint256 before = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);

        assertEq(creator.balance - before, total);
        assertEq(address(controller).balance, 0);
        assertEq(controller.remaining(poolId), 0);
        assertTrue(_poolClosed(poolId));
    }
}
