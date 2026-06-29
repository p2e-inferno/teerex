// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Test.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";
import {IUnlock, IPublicLock, ForkRecipient} from "./RewardsFork.t.sol";

/// @notice Fork-based coverage for the per-position **partial reclaim** caveat: the intermediate
/// states where some placements are swept while others stay locked, exercised across multiple
/// `reclaim` calls (and one interleaved winner `claim`) against a REAL Unlock PublicLock — the path
/// the stateless property fuzzers do not target directly.
///
/// Self-skips when FORK_RPC_URL is unset. To run against Base mainnet:
///   FORK_RPC_URL=<base-mainnet-rpc> forge test --match-contract RewardsForkPartialReclaimTest
contract RewardsForkPartialReclaimTest is Test {
    // Unlock factory addresses (verified against the unlock-protocol/networks package).
    address internal constant UNLOCK_BASE_MAINNET = 0xd0b14797b9D08493392865647384974470202A78;
    address internal constant UNLOCK_BASE_SEPOLIA = 0x259813B665C8f6074391028ef782e27B65840d89;
    uint64 internal constant MIN_WINDOW = 30 hours;
    uint64 internal constant MIN_CLAIM = 7 days;

    bool internal skipped;
    address internal unlockFactory;
    R internal controller;
    IPublicLock internal lock;

    address internal owner = makeAddr("owner");
    address internal arbitrator = makeAddr("arbitrator");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");

    modifier onFork() {
        if (skipped) {
            emit log("[skip] FORK_RPC_URL not set or unsupported chain");
            return;
        }
        _;
    }

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            skipped = true;
            return;
        }
        vm.createSelectFork(rpc);

        if (block.chainid == 8453) unlockFactory = UNLOCK_BASE_MAINNET;
        else if (block.chainid == 84532) unlockFactory = UNLOCK_BASE_SEPOLIA;
        else {
            skipped = true;
            return;
        }
        require(unlockFactory.code.length > 0, "Unlock factory missing (wrong network?)");

        lock = IPublicLock(_deployLock("TeeRex Fork Reward Event"));

        address[] memory none = new address[](0);
        controller = new R(owner, arbitrator, none, none);
        vm.deal(creator, 100 ether);
    }

    function _deployLock(string memory name) internal returns (address) {
        bytes memory initData = abi.encodeWithSelector(
            IPublicLock.initialize.selector,
            creator, uint256(365 days), address(0), uint256(0), type(uint256).max, name
        );
        return IUnlock(unlockFactory).createUpgradeableLock(initData);
    }

    function _grantKey(address to) internal {
        address[] memory r = new address[](1);
        r[0] = to;
        uint256[] memory e = new uint256[](1);
        e[0] = block.timestamp + 365 days;
        address[] memory m = new address[](1);
        m[0] = to;
        vm.prank(creator);
        lock.grantKeys(r, e, m);
    }

    /// 3 placements (3/2/1 ETH), claim opens in 2 days for 30 days.
    function _create3PosPool() internal returns (uint256 poolId, uint64 cs, uint64 ce) {
        uint256[] memory a = new uint256[](3);
        a[0] = 3 ether;
        a[1] = 2 ether;
        a[2] = 1 ether;
        cs = uint64(block.timestamp + 2 days);
        ce = cs + 30 days;
        R.CreateRewardPoolParams memory p = R.CreateRewardPoolParams({
            eventLock: address(lock),
            attendanceController: address(0),
            payoutToken: address(0),
            positionAmounts: a,
            claimStart: cs,
            claimEnd: ce,
            challengeWindow: MIN_WINDOW,
            rulesHash: keccak256("rules"),
            initialManagers: new address[](0)
        });
        vm.prank(creator);
        poolId = controller.createRewardPool{value: 6 ether}(p);
    }

    function _posReclaimed(uint256 poolId, uint16 placement) internal view returns (bool reclaimed) {
        (,,,,,, reclaimed,) = controller.positions(poolId, placement);
    }

    /// Partial sweep (early + never-assigned) while a late placement stays locked, a second reclaim
    /// blocked until that placement's own end, then a final reclaim that closes the pool.
    function test_Fork_PartialReclaim_ThenSecondReclaimCloses() public onFork {
        address winner2 = address(new ForkRecipient());
        _grantKey(alice);
        _grantKey(winner2);
        (uint256 poolId,, uint64 ce) = _create3PosPool();

        // pos1 early (before claimStart); pos2 late (near pool end); pos3 never assigned.
        R.WinnerAssignment[] memory b1 = new R.WinnerAssignment[](1);
        b1[0] = R.WinnerAssignment({account: alice, placement: 1});
        vm.prank(creator);
        controller.assignWinners(poolId, b1);

        vm.warp(uint256(ce) - 1 hours);
        R.WinnerAssignment[] memory b2 = new R.WinnerAssignment[](1);
        b2[0] = R.WinnerAssignment({account: winner2, placement: 2});
        vm.prank(creator);
        controller.assignWinners(poolId, b2);

        // Phase A: just past the pool end — pos1 (early, ends at pool end) + pos3 (never-assigned)
        // are reclaimable; pos2's guaranteed window runs past the pool end, so it stays locked.
        vm.warp(uint256(ce) + 1);
        uint256 c0 = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance - c0, 4 ether, "partial sweep = pos1 + pos3");
        assertEq(controller.remaining(poolId), 2 ether, "pos2 still escrowed");
        assertFalse(controller.getPool(poolId).closed, "late placement keeps pool open");
        assertTrue(_posReclaimed(poolId, 1));
        assertTrue(_posReclaimed(poolId, 3));
        assertFalse(_posReclaimed(poolId, 2));

        // Phase B: a second reclaim now reverts — nothing newly eligible, pos2 still locked.
        vm.prank(creator);
        vm.expectRevert(R.NotYetReclaimable.selector);
        controller.reclaim(poolId);

        // Phase C: past pos2's per-position end — the final reclaim sweeps it and closes the pool.
        vm.warp(controller.positionClaimEnd(poolId, 2) + 1);
        uint256 c1 = creator.balance;
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(creator.balance - c1, 2 ether, "final sweep = pos2");
        assertEq(controller.remaining(poolId), 0);
        assertTrue(controller.getPool(poolId).closed);
        assertTrue(_posReclaimed(poolId, 2));
    }

    /// Partial sweep, then the late winner claims within their guaranteed window, leaving nothing to
    /// reclaim — the claimed placement is never reclaimable and the escrow ends empty.
    function test_Fork_PartialReclaim_LateWinnerClaimsRemainder() public onFork {
        address winner2 = address(new ForkRecipient());
        _grantKey(alice);
        _grantKey(winner2);
        (uint256 poolId,, uint64 ce) = _create3PosPool();

        R.WinnerAssignment[] memory b1 = new R.WinnerAssignment[](1);
        b1[0] = R.WinnerAssignment({account: alice, placement: 1});
        vm.prank(creator);
        controller.assignWinners(poolId, b1);

        vm.warp(uint256(ce) - 1 hours);
        R.WinnerAssignment[] memory b2 = new R.WinnerAssignment[](1);
        b2[0] = R.WinnerAssignment({account: winner2, placement: 2});
        vm.prank(creator);
        controller.assignWinners(poolId, b2);

        // Phase A: partial sweep of pos1 + pos3.
        vm.warp(uint256(ce) + 1);
        vm.prank(creator);
        controller.reclaim(poolId);
        assertEq(controller.remaining(poolId), 2 ether);

        // Phase B: the late winner claims inside their guaranteed window (past the pool end).
        (, uint256 opensAt) = controller.claimable(poolId, 2);
        vm.warp(opensAt);
        uint256 w0 = winner2.balance;
        vm.prank(winner2);
        controller.claim(poolId, 2);
        assertEq(winner2.balance - w0, 2 ether, "late winner paid in full");
        assertEq(controller.remaining(poolId), 0);

        // Phase C: nothing left to reclaim; the claimed placement is not reclaimable.
        vm.prank(creator);
        vm.expectRevert(R.NothingToPay.selector);
        controller.reclaim(poolId);
        assertFalse(_posReclaimed(poolId, 2), "claimed placement never reclaimed");
    }
}
