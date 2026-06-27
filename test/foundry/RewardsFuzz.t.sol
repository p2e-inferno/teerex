// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RewardsBase} from "./RewardsBase.t.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";

contract RewardsFuzzTest is RewardsBase {
    uint256 internal constant MAX_PRIZE = 1e24; // 1M ether per placement

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
        (uint256 poolId, uint256 total) = _create3PosEthPool(x1, x2, x3, START + 7 days, START + 37 days);
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
            _params(address(0), address(0), a, START + 7 days, START + 37 days, MIN_WINDOW, _noManagers())
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
        uint64 naturalOpen = START + 7 days; // claimStart dominates the 30h window

        disputeAt = uint64(bound(disputeAt, START, naturalOpen + 10 days));
        vm.warp(disputeAt);
        vm.prank(ticketHolder);
        controller.raiseDispute(poolId, 1, keccak256("x"));

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
        (uint256 poolId, uint256 total) = _create3PosEthPool(amt[0], amt[1], amt[2], START + 7 days, START + 37 days);

        address[3] memory winners = [alice, bob, carol];
        for (uint16 i = 0; i < 3; i++) _assign(poolId, winners[i], i + 1);
        vm.warp(START + 7 days);

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
        (uint256 poolId, uint256 total) = _create3PosEthPool(amt[0], amt[1], amt[2], START + 7 days, START + 37 days);

        address[3] memory winners = [alice, bob, carol];
        for (uint16 i = 0; i < 3; i++) _assign(poolId, winners[i], i + 1);
        vm.warp(START + 7 days);

        uint256 paid;
        for (uint16 i = 0; i < 3; i++) {
            if ((mask >> i) & 1 == 1) {
                vm.prank(winners[i]);
                controller.claim(poolId, i + 1);
                paid += amt[i];
            }
        }

        vm.warp(START + 37 days + 1);
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
}
