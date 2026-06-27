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
        assertEq(opensAt, START + 7 days); // claimStart dominates the 30h window

        vm.warp(START + 7 days);
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
        vm.warp(START + 7 days);
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
        vm.warp(START + 7 days - 1);
        vm.prank(alice);
        vm.expectRevert(R.WindowNotOpen.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_ClaimAfterWindowClosed() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(START + 12 days + 1); // past claimEnd
        vm.prank(alice);
        vm.expectRevert(R.WindowClosed.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_ClaimNotWinner() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(START + 7 days);
        vm.prank(bob);
        vm.expectRevert(R.NotWinner.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_DoubleClaim() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(START + 7 days);
        vm.startPrank(alice);
        controller.claim(poolId, 1);
        vm.expectRevert(R.AlreadyClaimed.selector);
        controller.claim(poolId, 1);
        vm.stopPrank();
    }

    function test_RevertWhen_ClaimFrozenPool() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(START + 7 days);
        vm.prank(arbitrator);
        controller.freeze(poolId);
        vm.prank(alice);
        vm.expectRevert(R.PoolIsFrozen.selector);
        controller.claim(poolId, 1);
    }

    function test_RevertWhen_ClaimClosedPool() public {
        (uint256 poolId,) = _createDefaultEthPool();
        _assign(poolId, alice, 1);
        vm.warp(START + 12 days + 1); // window closed; creator reclaims
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
        vm.warp(START + 7 days);
        vm.expectRevert(R.NativeTransferFailed.selector);
        attacker.doClaim(1);
    }

    function test_ReentrantClaimBlocked_NoFundsLeak() public {
        (uint256 poolId,) = _createDefaultEthPool();
        ClaimAttacker attacker = new ClaimAttacker(address(controller));
        attacker.configure(poolId, true, 1, true); // re-enters claim(poolId, 1)
        lock.setBalance(address(attacker), 1);
        _assign(poolId, address(attacker), 1);
        vm.warp(START + 7 days);

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
}
