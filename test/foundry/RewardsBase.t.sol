// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Test.sol";
import {TeeRexRewardsControllerV1} from "../../contracts/TeeRexRewardsControllerV1.sol";
import {MockPublicLock} from "./mocks/MockPublicLock.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockAttendanceController} from "./mocks/MockAttendanceController.sol";

/// @notice Shared setup + helpers for the rewards-controller test suite. A fixed epoch is warped
/// in so claim-window math reads as wall-clock offsets from `START`.
abstract contract RewardsBase is Test {
    uint64 internal constant START = 1_700_000_000;
    uint64 internal constant MIN_WINDOW = 30 hours;
    uint64 internal constant MAX_HOLD = 24 hours;
    uint64 internal constant MIN_CLAIM = 3 days;
    uint64 internal constant MAX_BACKSTOP = 90 days;

    TeeRexRewardsControllerV1 internal controller;
    MockPublicLock internal lock;
    MockERC20 internal token;
    MockAttendanceController internal attendance;

    address internal owner = makeAddr("owner");
    address internal arbitrator = makeAddr("arbitrator");
    address internal creator = makeAddr("creator");
    address internal manager = makeAddr("manager");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal ticketHolder = makeAddr("ticketHolder");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        vm.warp(START);

        lock = new MockPublicLock();
        token = new MockERC20("USD Coin", "USDC", 6);
        attendance = new MockAttendanceController();

        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        address[] memory controllers = new address[](1);
        controllers[0] = address(attendance);

        controller = new TeeRexRewardsControllerV1(owner, arbitrator, tokens, controllers);

        lock.setManager(creator, true);
        lock.setTotalSupply(100);
        // Eligible winners / disputers all hold a key on the event lock.
        lock.setBalance(alice, 1);
        lock.setBalance(bob, 1);
        lock.setBalance(carol, 1);
        lock.setBalance(ticketHolder, 1);

        vm.deal(creator, 1_000 ether);
        token.mint(creator, 1_000_000e6);
    }

    // -----------------------------------------------------------------
    // Param + creation helpers
    // -----------------------------------------------------------------

    function _amounts3() internal pure returns (uint256[] memory a) {
        a = new uint256[](3);
        a[0] = 3 ether;
        a[1] = 2 ether;
        a[2] = 1 ether;
    }

    function _noManagers() internal pure returns (address[] memory) {
        return new address[](0);
    }

    function _params(
        address payoutToken,
        address attendanceController,
        uint256[] memory positionAmounts,
        uint64 claimStart,
        uint64 claimEnd,
        uint64 challengeWindow,
        address[] memory initialManagers
    ) internal view returns (TeeRexRewardsControllerV1.CreateRewardPoolParams memory p) {
        p = TeeRexRewardsControllerV1.CreateRewardPoolParams({
            eventLock: address(lock),
            attendanceController: attendanceController,
            payoutToken: payoutToken,
            positionAmounts: positionAmounts,
            claimStart: claimStart,
            claimEnd: claimEnd,
            challengeWindow: challengeWindow,
            rulesHash: keccak256("rules"),
            initialManagers: initialManagers
        });
    }

    /// @dev 3-placement ETH pool, claim opens in 7 days for 5 days, default 30h challenge window.
    function _createDefaultEthPool() internal returns (uint256 poolId, uint256 total) {
        uint256[] memory a = _amounts3();
        total = a[0] + a[1] + a[2];
        uint64 cs = START + 7 days;
        uint64 ce = cs + 5 days;
        vm.prank(creator);
        poolId = controller.createRewardPool{value: total}(
            _params(address(0), address(0), a, cs, ce, MIN_WINDOW, _noManagers())
        );
    }

    function _createDefaultErc20Pool() internal returns (uint256 poolId, uint256 total) {
        uint256[] memory a = new uint256[](3);
        a[0] = 300e6;
        a[1] = 200e6;
        a[2] = 100e6;
        total = a[0] + a[1] + a[2];
        uint64 cs = START + 7 days;
        uint64 ce = cs + 5 days;
        vm.startPrank(creator);
        token.approve(address(controller), total);
        poolId = controller.createRewardPool(
            _params(address(token), address(0), a, cs, ce, MIN_WINDOW, _noManagers())
        );
        vm.stopPrank();
    }

    function _assign(uint256 poolId, address account, uint16 placement) internal {
        _assignAs(creator, poolId, account, placement);
    }

    function _assignAs(address who, uint256 poolId, address account, uint16 placement) internal {
        TeeRexRewardsControllerV1.WinnerAssignment[] memory batch =
            new TeeRexRewardsControllerV1.WinnerAssignment[](1);
        batch[0] = TeeRexRewardsControllerV1.WinnerAssignment({account: account, placement: placement});
        vm.prank(who);
        controller.assignWinners(poolId, batch);
    }

    // -----------------------------------------------------------------
    // Pool struct field accessors (the public getter returns a flat tuple)
    // -----------------------------------------------------------------

    function _poolFrozen(uint256 poolId) internal view returns (bool) {
        return controller.getPool(poolId).frozen;
    }

    function _poolClosed(uint256 poolId) internal view returns (bool) {
        return controller.getPool(poolId).closed;
    }

    function _poolClaimedAmount(uint256 poolId) internal view returns (uint256) {
        return controller.getPool(poolId).claimedAmount;
    }

    function _poolAssignedCount(uint256 poolId) internal view returns (uint16) {
        return controller.getPool(poolId).assignedCount;
    }

    // -----------------------------------------------------------------
    // Position struct field accessors
    // -----------------------------------------------------------------

    function _posAmount(uint256 poolId, uint16 placement) internal view returns (uint256 amount) {
        (amount,,,,,,,) = controller.positions(poolId, placement);
    }

    function _posWinner(uint256 poolId, uint16 placement) internal view returns (address winner) {
        (,winner,,,,,,) = controller.positions(poolId, placement);
    }

    function _posAssignedAt(uint256 poolId, uint16 placement) internal view returns (uint64 assignedAt) {
        (,,assignedAt,,,,,) = controller.positions(poolId, placement);
    }

    function _posHoldUntil(uint256 poolId, uint16 placement) internal view returns (uint64 holdUntil) {
        (,,,holdUntil,,,,) = controller.positions(poolId, placement);
    }

    function _posClaimed(uint256 poolId, uint16 placement) internal view returns (bool claimed) {
        (,,,,,claimed,,) = controller.positions(poolId, placement);
    }

    function _posReclaimed(uint256 poolId, uint16 placement) internal view returns (bool reclaimed) {
        (,,,,,,reclaimed,) = controller.positions(poolId, placement);
    }
}
