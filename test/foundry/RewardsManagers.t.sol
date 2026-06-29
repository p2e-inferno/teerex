// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {RewardsBase} from "./RewardsBase.t.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";

contract RewardsManagersTest is RewardsBase {
    uint256 internal poolId;

    function setUp() public override {
        super.setUp();
        (poolId,) = _createDefaultEthPool();
    }

    function test_AddManager() public {
        vm.expectEmit(true, true, false, false, address(controller));
        emit R.ManagerAdded(poolId, manager);
        vm.prank(creator);
        controller.addManager(poolId, manager);
        assertTrue(controller.isManager(poolId, manager));
    }

    function test_AddManager_Idempotent() public {
        vm.startPrank(creator);
        controller.addManager(poolId, manager);
        controller.addManager(poolId, manager);
        vm.stopPrank();
        assertTrue(controller.isManager(poolId, manager));
    }

    function test_RemoveManager() public {
        vm.startPrank(creator);
        controller.addManager(poolId, manager);
        controller.removeManager(poolId, manager);
        vm.stopPrank();
        assertFalse(controller.isManager(poolId, manager));
    }

    function test_RenounceManager() public {
        vm.prank(creator);
        controller.addManager(poolId, manager);
        vm.prank(manager);
        controller.renounceManager(poolId);
        assertFalse(controller.isManager(poolId, manager));
    }

    function test_RevertWhen_AddManagerNotCreator() public {
        vm.prank(stranger);
        vm.expectRevert(R.NotCreator.selector);
        controller.addManager(poolId, manager);
    }

    function test_RevertWhen_AddZeroManager() public {
        vm.prank(creator);
        vm.expectRevert(R.InvalidRecipient.selector);
        controller.addManager(poolId, address(0));
    }

    function test_RevertWhen_RemoveManagerNotCreator() public {
        vm.prank(stranger);
        vm.expectRevert(R.NotCreator.selector);
        controller.removeManager(poolId, manager);
    }

    function test_RevertWhen_RenounceNotAManager() public {
        vm.prank(stranger);
        vm.expectRevert(R.NotManager.selector);
        controller.renounceManager(poolId);
    }

    function test_RevertWhen_AddManagerUnknownPool() public {
        vm.prank(creator);
        vm.expectRevert(R.UnknownPool.selector);
        controller.addManager(999, manager);
    }
}
