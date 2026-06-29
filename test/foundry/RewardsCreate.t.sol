// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RewardsBase} from "./RewardsBase.t.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";

contract RewardsCreateTest is RewardsBase {
    function test_CreateEthPool_StoresTermsAndHoldsEscrow() public {
        uint256[] memory a = _amounts3();
        uint256 total = a[0] + a[1] + a[2];
        uint64 cs = DEFAULT_CLAIM_START;
        uint64 ce = DEFAULT_CLAIM_END;

        vm.prank(creator);
        uint256 poolId = controller.createRewardPool{value: total}(
            _params(address(0), address(0), a, cs, ce, MIN_WINDOW, _noManagers())
        );

        assertEq(poolId, 0);
        assertEq(address(controller).balance, total, "escrow held");
        assertEq(controller.remaining(poolId), total);

        R.Pool memory p = controller.getPool(poolId);
        assertTrue(p.exists);
        assertFalse(p.closed);
        assertEq(p.creator, creator);
        assertEq(p.eventLock, address(lock));
        assertEq(p.payoutToken, address(0));
        assertEq(p.totalFunded, total);
        assertEq(p.claimStart, cs);
        assertEq(p.claimEnd, ce);
        assertEq(p.challengeWindow, MIN_WINDOW);
        assertEq(p.positionCount, 3);
        assertEq(p.assignedCount, 0);
        assertEq(_posAmount(poolId, 1), a[0]);
        assertEq(_posAmount(poolId, 3), a[2]);
    }

    function test_CreateErc20Pool_PullsExactFunding() public {
        uint256 balBefore = token.balanceOf(creator);
        (uint256 poolId, uint256 total) = _createDefaultErc20Pool();
        assertEq(token.balanceOf(address(controller)), total);
        assertEq(token.balanceOf(creator), balBefore - total);
        assertEq(controller.remaining(poolId), total);
    }

    function test_CreateWithInitialManagers() public {
        uint256[] memory a = _amounts3();
        uint256 total = a[0] + a[1] + a[2];
        address[] memory mgrs = new address[](2);
        mgrs[0] = manager;
        mgrs[1] = manager; // duplicate is deduped by the guard
        vm.prank(creator);
        uint256 poolId = controller.createRewardPool{value: total}(
            _params(address(0), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, mgrs)
        );
        assertTrue(controller.isManager(poolId, manager));
    }

    function test_CreateWithZeroManagerInList_Skipped() public {
        uint256[] memory a = _amounts3();
        uint256 total = a[0] + a[1] + a[2];
        address[] memory mgrs = new address[](2);
        mgrs[0] = address(0); // skipped by the guard
        mgrs[1] = manager;
        vm.prank(creator);
        uint256 poolId = controller.createRewardPool{value: total}(
            _params(address(0), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, mgrs)
        );
        assertTrue(controller.isManager(poolId, manager));
        assertFalse(controller.isManager(poolId, address(0)));
    }

    function test_CreateWithAttendanceController_Succeeds() public {
        attendance.setConfig(address(lock), true, false, false, false);
        uint256[] memory a = _amounts3();
        uint256 total = a[0] + a[1] + a[2];
        vm.prank(creator);
        uint256 poolId = controller.createRewardPool{value: total}(
            _params(address(0), address(attendance), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
        assertEq(controller.getPool(poolId).attendanceController, address(attendance));
    }

    function test_RevertWhen_NotLockManager() public {
        uint256[] memory a = _amounts3();
        vm.deal(stranger, 10 ether);
        vm.prank(stranger);
        vm.expectRevert(R.NotLockManager.selector);
        controller.createRewardPool{value: 6 ether}(
            _params(address(0), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    function test_RevertWhen_EventLockHasNoCode() public {
        uint256[] memory a = _amounts3();
        R.CreateRewardPoolParams memory p =
            _params(address(0), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers());
        p.eventLock = stranger; // EOA, no code
        vm.prank(creator);
        vm.expectRevert(R.InvalidEventLock.selector);
        controller.createRewardPool{value: 6 ether}(p);
    }

    function test_RevertWhen_AttendanceNotAllowed() public {
        uint256[] memory a = _amounts3();
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(R.AttendanceNotAllowed.selector, stranger));
        controller.createRewardPool{value: 6 ether}(
            _params(address(0), stranger, a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    function test_RevertWhen_AttendanceEventNotProtected() public {
        // Allowlisted controller, but no config bound for this lock (exists == false).
        uint256[] memory a = _amounts3();
        vm.prank(creator);
        vm.expectRevert(R.EventNotProtected.selector);
        controller.createRewardPool{value: 6 ether}(
            _params(address(0), address(attendance), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    function test_RevertWhen_TokenNotAllowed() public {
        MockFeeOnTransferERC20 bad = new MockFeeOnTransferERC20(100);
        uint256[] memory a = _amounts3();
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(R.TokenNotAllowed.selector, address(bad)));
        controller.createRewardPool(
            _params(address(bad), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    function test_RevertWhen_FeeOnTransferToken_ShortfallRejected() public {
        // Even if a non-standard token is allowlisted, the balance-delta check rejects it.
        MockFeeOnTransferERC20 bad = new MockFeeOnTransferERC20(100); // 1%
        bad.mint(creator, 1_000 ether);
        vm.prank(owner);
        controller.setAllowedPayoutToken(address(bad), true);

        uint256[] memory a = _amounts3();
        uint256 total = a[0] + a[1] + a[2];
        vm.startPrank(creator);
        bad.approve(address(controller), total);
        vm.expectRevert(abi.encodeWithSelector(R.BadFunding.selector, total, total - (total * 100) / 10_000));
        controller.createRewardPool(
            _params(address(bad), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
        vm.stopPrank();
    }

    function test_RevertWhen_EmptyPositions() public {
        uint256[] memory a = new uint256[](0);
        vm.prank(creator);
        vm.expectRevert(R.BadPositions.selector);
        controller.createRewardPool(
            _params(address(0), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    function test_RevertWhen_ZeroAmountPosition() public {
        uint256[] memory a = new uint256[](2);
        a[0] = 1 ether;
        a[1] = 0;
        vm.prank(creator);
        vm.expectRevert(R.BadPositions.selector);
        controller.createRewardPool{value: 1 ether}(
            _params(address(0), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    function test_RevertWhen_TooManyPositions() public {
        uint256[] memory a = new uint256[](201);
        for (uint256 i = 0; i < 201; i++) a[i] = 1 wei;
        vm.prank(creator);
        vm.expectRevert(R.TooManyPositions.selector);
        controller.createRewardPool{value: 201 wei}(
            _params(address(0), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    function test_RevertWhen_ClaimStartInPast() public {
        uint256[] memory a = _amounts3();
        vm.prank(creator);
        vm.expectRevert(R.BadWindow.selector);
        controller.createRewardPool{value: 6 ether}(
            _params(address(0), address(0), a, START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    function test_RevertWhen_ClaimDurationTooShort() public {
        uint256[] memory a = _amounts3();
        uint64 cs = DEFAULT_CLAIM_START;
        vm.prank(creator);
        vm.expectRevert(R.BadWindow.selector);
        controller.createRewardPool{value: 6 ether}(
            _params(address(0), address(0), a, cs, cs + MIN_CLAIM - 1, MIN_WINDOW, _noManagers())
        );
    }

    function test_RevertWhen_ChallengeWindowTooShort() public {
        uint256[] memory a = _amounts3();
        uint64 cs = DEFAULT_CLAIM_START;
        vm.prank(creator);
        vm.expectRevert(R.BadWindow.selector);
        controller.createRewardPool{value: 6 ether}(
            _params(address(0), address(0), a, cs, cs + MIN_CLAIM, MIN_WINDOW - 1, _noManagers())
        );
    }

    function test_RevertWhen_EthFundingMismatch() public {
        uint256[] memory a = _amounts3();
        uint256 total = a[0] + a[1] + a[2];
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(R.BadFunding.selector, total, total - 1));
        controller.createRewardPool{value: total - 1}(
            _params(address(0), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
    }

    function test_RevertWhen_NativeValueSentWithErc20() public {
        uint256[] memory a = new uint256[](1);
        a[0] = 100e6;
        vm.startPrank(creator);
        token.approve(address(controller), 100e6);
        vm.expectRevert(R.UnexpectedNativeValue.selector);
        controller.createRewardPool{value: 1}(
            _params(address(token), address(0), a, DEFAULT_CLAIM_START, DEFAULT_CLAIM_END, MIN_WINDOW, _noManagers())
        );
        vm.stopPrank();
    }

    function test_PoolIdsIncrement() public {
        (uint256 p0,) = _createDefaultEthPool();
        (uint256 p1,) = _createDefaultEthPool();
        assertEq(p0, 0);
        assertEq(p1, 1);
        assertEq(controller.nextPoolId(), 2);
    }
}
