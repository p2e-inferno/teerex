// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RewardsBase} from "./RewardsBase.t.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract RewardsAdminTest is RewardsBase {
    MockERC20 internal token2;
    MockERC20 internal token3;

    function setUp() public override {
        super.setUp();
        token2 = new MockERC20("T2", "T2", 18);
        token3 = new MockERC20("T3", "T3", 18);
    }

    function _onlyOwnerError(address caller) internal pure returns (bytes memory) {
        return abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", caller);
    }

    // ---- constructor ----

    function test_ConstructorState() public view {
        assertEq(controller.owner(), owner);
        assertEq(controller.arbitrator(), arbitrator);
        assertEq(controller.VERSION(), 1);
        assertEq(controller.nextPoolId(), 0);
        assertTrue(controller.allowedPayoutToken(address(token)));
        assertTrue(controller.allowedAttendanceController(address(attendance)));
    }

    function test_RevertWhen_ConstructorZeroArbitrator() public {
        address[] memory empty = new address[](0);
        vm.expectRevert(R.InvalidArbitrator.selector);
        new R(owner, address(0), empty, empty);
    }

    // ---- arbitrator ----

    function test_SetArbitrator() public {
        vm.expectEmit(true, true, false, false, address(controller));
        emit R.ArbitratorSet(arbitrator, bob);
        vm.prank(owner);
        controller.setArbitrator(bob);
        assertEq(controller.arbitrator(), bob);
    }

    function test_SetArbitrator_RotatesAuthority() public {
        (uint256 poolId,) = _createDefaultEthPool();
        vm.prank(owner);
        controller.setArbitrator(bob);

        vm.prank(arbitrator); // old arbitrator
        vm.expectRevert(R.NotArbitrator.selector);
        controller.freeze(poolId);

        vm.prank(bob); // new arbitrator
        controller.freeze(poolId);
        assertTrue(_poolFrozen(poolId));
    }

    function test_RevertWhen_SetArbitratorZero() public {
        vm.prank(owner);
        vm.expectRevert(R.InvalidArbitrator.selector);
        controller.setArbitrator(address(0));
    }

    function test_RevertWhen_SetArbitratorNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(_onlyOwnerError(stranger));
        controller.setArbitrator(bob);
    }

    // ---- payout token allowlist ----

    function test_IsAllowedPayoutToken_NativeAlwaysTrue() public view {
        assertTrue(controller.isAllowedPayoutToken(address(0)));
        assertTrue(controller.isAllowedPayoutToken(address(token)));
        assertFalse(controller.isAllowedPayoutToken(address(token2)));
    }

    function test_AddPayoutToken_Enumerates() public {
        vm.expectEmit(true, false, false, true, address(controller));
        emit R.AllowedPayoutTokenUpdated(address(token2), true);
        vm.prank(owner);
        controller.setAllowedPayoutToken(address(token2), true);

        assertTrue(controller.isAllowedPayoutToken(address(token2)));
        address[] memory list = controller.getAllowedPayoutTokens();
        assertEq(list.length, 2);
        assertEq(list[0], address(token));
        assertEq(list[1], address(token2));
    }

    function test_RemovePayoutToken_SwapPop() public {
        vm.startPrank(owner);
        controller.setAllowedPayoutToken(address(token2), true);
        controller.setAllowedPayoutToken(address(token3), true);
        // Remove the first entry → last (token3) is swapped into its slot.
        controller.setAllowedPayoutToken(address(token), false);
        vm.stopPrank();

        assertFalse(controller.isAllowedPayoutToken(address(token)));
        address[] memory list = controller.getAllowedPayoutTokens();
        assertEq(list.length, 2);
        assertEq(list[0], address(token3));
        assertEq(list[1], address(token2));
    }

    function test_RemovePayoutToken_Last_NoSwap() public {
        vm.startPrank(owner);
        controller.setAllowedPayoutToken(address(token2), true);
        controller.setAllowedPayoutToken(address(token2), false); // token2 is the last entry
        vm.stopPrank();
        assertFalse(controller.isAllowedPayoutToken(address(token2)));
        assertEq(controller.getAllowedPayoutTokens().length, 1);
    }

    function test_AddPayoutToken_Idempotent() public {
        vm.startPrank(owner);
        controller.setAllowedPayoutToken(address(token2), true);
        controller.setAllowedPayoutToken(address(token2), true); // no-op
        vm.stopPrank();
        assertEq(controller.getAllowedPayoutTokens().length, 2);
    }

    function test_RevertWhen_AllowZeroToken() public {
        vm.prank(owner);
        vm.expectRevert(R.InvalidToken.selector);
        controller.setAllowedPayoutToken(address(0), true);
    }

    function test_RevertWhen_SetTokenNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(_onlyOwnerError(stranger));
        controller.setAllowedPayoutToken(address(token2), true);
    }

    // ---- attendance controller allowlist ----

    function test_SetAttendanceController_AddRemove() public {
        address newController = makeAddr("newAttendance");
        vm.expectEmit(true, false, false, true, address(controller));
        emit R.AllowedAttendanceControllerUpdated(newController, true);
        vm.startPrank(owner);
        controller.setAllowedAttendanceController(newController, true);
        assertTrue(controller.allowedAttendanceController(newController));
        controller.setAllowedAttendanceController(newController, false);
        assertFalse(controller.allowedAttendanceController(newController));
        vm.stopPrank();
    }

    function test_SetAttendanceController_Idempotent() public {
        address c = makeAddr("idemp");
        vm.startPrank(owner);
        controller.setAllowedAttendanceController(c, true);
        controller.setAllowedAttendanceController(c, true); // no-op early return
        vm.stopPrank();
        assertTrue(controller.allowedAttendanceController(c));
    }

    function test_RevertWhen_SetAttendanceZero() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(R.AttendanceNotAllowed.selector, address(0)));
        controller.setAllowedAttendanceController(address(0), true);
    }

    function test_RevertWhen_SetAttendanceNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(_onlyOwnerError(stranger));
        controller.setAllowedAttendanceController(makeAddr("x"), true);
    }

    // ---- view guards ----

    function test_RevertWhen_RemainingUnknownPool() public {
        vm.expectRevert(R.UnknownPool.selector);
        controller.remaining(999);
    }

    function test_RevertWhen_EffectiveClaimEndUnknownPool() public {
        vm.expectRevert(R.UnknownPool.selector);
        controller.effectiveClaimEnd(999);
    }

    function test_RevertWhen_ClaimableUnknownPool() public {
        vm.expectRevert(R.UnknownPool.selector);
        controller.claimable(999, 1);
    }
}
