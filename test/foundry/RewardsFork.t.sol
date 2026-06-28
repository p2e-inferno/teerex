// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Test.sol";
import {TeeRexRewardsControllerV1 as R} from "../../contracts/TeeRexRewardsControllerV1.sol";

interface IUnlock {
    function createUpgradeableLock(bytes calldata data) external returns (address);
}

/// A clean payout recipient. `makeAddr` labels can collide with addresses that already hold
/// bytecode on the forked network (whose fallback may forward ETH), so prize winners that must
/// retain the payout use a freshly deployed receiver instead.
contract ForkRecipient {
    receive() external payable {}
}

interface IERC20Fork {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

interface IPublicLock {
    function initialize(
        address lockCreator,
        uint256 expirationDuration,
        address tokenAddress,
        uint256 keyPrice,
        uint256 maxNumberOfKeys,
        string calldata lockName
    ) external;
    function grantKeys(
        address[] calldata recipients,
        uint256[] calldata expirations,
        address[] calldata keyManagers
    ) external returns (uint256[] memory);
    function balanceOf(address owner) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function isLockManager(address account) external view returns (bool);
}

/// @notice Fork-based suite that runs the rewards controller against a REAL Unlock PublicLock
/// deployed via the live factory — proving the controller's `isLockManager` / `balanceOf` /
/// `totalSupply` assumptions hold against the actual contract, not a mock.
///
/// Self-skips when FORK_RPC_URL is unset (or the fork is not Base mainnet/sepolia), so `forge test`
/// stays runnable offline. To run:
///   FORK_RPC_URL=https://sepolia.base.org forge test --match-contract RewardsForkTest
contract RewardsForkTest is Test {
    // Unlock factory addresses — verified against the unlock-protocol/networks package.
    address internal constant UNLOCK_BASE_MAINNET = 0xd0b14797b9D08493392865647384974470202A78;
    address internal constant UNLOCK_BASE_SEPOLIA = 0x259813B665C8f6074391028ef782e27B65840d89;
    // Circle-issued native USDC on Base mainnet.
    address internal constant USDC_BASE_MAINNET = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    uint64 internal constant MIN_WINDOW = 30 hours;
    uint64 internal constant MIN_CLAIM = 7 days;
    uint64 internal constant MAX_BACKSTOP = 30 days;

    bool internal skipped;
    address internal unlockFactory;
    R internal controller;
    IPublicLock internal lock;

    address internal owner = makeAddr("owner");
    address internal arbitrator = makeAddr("arbitrator");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    modifier onFork() {
        if (skipped) {
            emit log("[skip] FORK_RPC_URL not set");
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

        lock = IPublicLock(_deployLock("TeeRex Fork Event"));

        address[] memory none = new address[](0);
        controller = new R(owner, arbitrator, none, none);
        vm.deal(creator, 100 ether);
    }

    function _deployLock(string memory name) internal returns (address) {
        // creator becomes the lock manager (and key granter).
        bytes memory initData = abi.encodeWithSelector(
            IPublicLock.initialize.selector,
            creator, uint256(365 days), address(0), uint256(0), type(uint256).max, name
        );
        return IUnlock(unlockFactory).createUpgradeableLock(initData);
    }

    function _grantKey(IPublicLock l, address to) internal {
        address[] memory r = new address[](1);
        r[0] = to;
        uint256[] memory e = new uint256[](1);
        e[0] = block.timestamp + 365 days;
        address[] memory m = new address[](1);
        m[0] = to;
        vm.prank(creator);
        l.grantKeys(r, e, m);
    }

    function _createEthPool(address eventLock, uint256 amount) internal returns (uint256 poolId) {
        uint256[] memory a = new uint256[](1);
        a[0] = amount;
        uint64 cs = uint64(block.timestamp + 2 days);
        R.CreateRewardPoolParams memory p = R.CreateRewardPoolParams({
            eventLock: eventLock,
            attendanceController: address(0),
            payoutToken: address(0),
            positionAmounts: a,
            claimStart: cs,
            claimEnd: cs + 30 days,
            challengeWindow: MIN_WINDOW,
            rulesHash: keccak256("rules"),
            initialManagers: new address[](0)
        });
        vm.prank(creator);
        poolId = controller.createRewardPool{value: amount}(p);
    }

    function test_Fork_RealLockSanity() public onFork {
        assertTrue(lock.isLockManager(creator), "creator is the real lock manager");
        assertEq(lock.balanceOf(alice), 0);
        _grantKey(lock, alice);
        assertEq(lock.balanceOf(alice), 1, "real key reflected in balanceOf");
        assertGt(lock.totalSupply(), 0);
    }

    function test_Fork_FullLifecycle() public onFork {
        address winner = address(new ForkRecipient());
        _grantKey(lock, winner);
        uint256 poolId = _createEthPool(address(lock), 2 ether); // real isLockManager + code check

        R.WinnerAssignment[] memory batch = new R.WinnerAssignment[](1);
        batch[0] = R.WinnerAssignment({account: winner, placement: 1});
        vm.prank(creator);
        controller.assignWinners(poolId, batch); // real balanceOf snapshot

        vm.warp(block.timestamp + 2 days + 1);
        uint256 before = winner.balance;
        vm.prank(winner);
        controller.claim(poolId, 1);
        assertEq(winner.balance - before, 2 ether);
        assertEq(controller.remaining(poolId), 0);
    }

    function test_Fork_FrozenWinnerClaimsAfterBackstopGrace() public onFork {
        address winner = address(new ForkRecipient());
        _grantKey(lock, winner);
        uint256 poolId = _createEthPool(address(lock), 1 ether);

        R.WinnerAssignment[] memory batch = new R.WinnerAssignment[](1);
        batch[0] = R.WinnerAssignment({account: winner, placement: 1});
        vm.prank(creator);
        controller.assignWinners(poolId, batch);

        R.Pool memory p = controller.getPool(poolId);
        vm.warp(p.claimStart);
        vm.prank(arbitrator);
        controller.freeze(poolId);

        uint256 graceEnd = uint256(p.claimEnd) + MAX_BACKSTOP + MIN_CLAIM;
        assertEq(controller.positionClaimEnd(poolId, 1), graceEnd);

        vm.warp(uint256(p.claimEnd) + MAX_BACKSTOP);
        vm.prank(winner);
        vm.expectRevert(R.PoolIsFrozen.selector);
        controller.claim(poolId, 1);

        vm.warp(uint256(p.claimEnd) + MAX_BACKSTOP + 1);
        uint256 before = winner.balance;
        vm.prank(winner);
        controller.claim(poolId, 1);
        assertEq(winner.balance - before, 1 ether);
        assertEq(controller.remaining(poolId), 0);
    }

    function test_Fork_AssignRevertsForNonKeyHolder() public onFork {
        uint256 poolId = _createEthPool(address(lock), 1 ether);
        R.WinnerAssignment[] memory batch = new R.WinnerAssignment[](1);
        batch[0] = R.WinnerAssignment({account: bob, placement: 1}); // bob holds no key
        vm.prank(creator);
        vm.expectRevert(R.NotTicketHolder.selector);
        controller.assignWinners(poolId, batch);
    }

    function test_Fork_CreateRevertsForNonManager() public onFork {
        uint256[] memory a = new uint256[](1);
        a[0] = 1 ether;
        uint64 cs = uint64(block.timestamp + 2 days);
        R.CreateRewardPoolParams memory p = R.CreateRewardPoolParams({
            eventLock: address(lock),
            attendanceController: address(0),
            payoutToken: address(0),
            positionAmounts: a,
            claimStart: cs,
            claimEnd: cs + 30 days,
            challengeWindow: MIN_WINDOW,
            rulesHash: bytes32(0),
            initialManagers: new address[](0)
        });
        vm.deal(bob, 1 ether);
        vm.prank(bob); // not a manager of the real lock
        vm.expectRevert(R.NotLockManager.selector);
        controller.createRewardPool{value: 1 ether}(p);
    }

    function test_Fork_CloseEarlyExitRevertsWithTickets() public onFork {
        _grantKey(lock, alice); // real totalSupply() > 0
        uint256 poolId = _createEthPool(address(lock), 1 ether);
        vm.prank(creator);
        vm.expectRevert(R.EarlyExitNotAllowed.selector);
        controller.closePool(poolId);
    }

    function test_Fork_CloseNoTicketsRefunds() public onFork {
        IPublicLock emptyLock = IPublicLock(_deployLock("Empty Event"));
        assertEq(emptyLock.totalSupply(), 0, "fresh lock has no keys");

        uint256 poolId = _createEthPool(address(emptyLock), 1 ether);
        uint256 before = creator.balance;
        vm.prank(creator);
        controller.closePool(poolId); // real totalSupply() == 0 → early-exit refund
        assertEq(creator.balance - before, 1 ether);
    }

    /// Exercises the ERC20 funding + payout path against REAL Base-mainnet USDC (not a mock):
    /// balance-delta funding measurement, `safeTransferFrom` on create, and `safeTransfer` on claim
    /// all run against Circle's actual token. Mainnet-only (the USDC address is chain-specific).
    function test_Fork_Erc20Usdc_FundAndClaim() public onFork {
        if (block.chainid != 8453) {
            emit log("[skip] USDC ERC20 fork test is Base-mainnet-only");
            return;
        }

        address winner = address(new ForkRecipient());
        _grantKey(lock, winner);

        vm.prank(owner);
        controller.setAllowedPayoutToken(USDC_BASE_MAINNET, true);

        uint256 amount = 250e6; // 250 USDC
        deal(USDC_BASE_MAINNET, creator, amount);

        uint256[] memory a = new uint256[](1);
        a[0] = amount;
        uint64 cs = uint64(block.timestamp + 2 days);
        R.CreateRewardPoolParams memory p = R.CreateRewardPoolParams({
            eventLock: address(lock),
            attendanceController: address(0),
            payoutToken: USDC_BASE_MAINNET,
            positionAmounts: a,
            claimStart: cs,
            claimEnd: cs + 30 days,
            challengeWindow: MIN_WINDOW,
            rulesHash: keccak256("rules"),
            initialManagers: new address[](0)
        });

        vm.startPrank(creator);
        IERC20Fork(USDC_BASE_MAINNET).approve(address(controller), amount);
        uint256 poolId = controller.createRewardPool(p);
        vm.stopPrank();
        assertEq(IERC20Fork(USDC_BASE_MAINNET).balanceOf(address(controller)), amount, "real USDC escrowed");

        R.WinnerAssignment[] memory batch = new R.WinnerAssignment[](1);
        batch[0] = R.WinnerAssignment({account: winner, placement: 1});
        vm.prank(creator);
        controller.assignWinners(poolId, batch);

        vm.warp(block.timestamp + 2 days + 1);
        vm.prank(winner);
        controller.claim(poolId, 1);
        assertEq(IERC20Fork(USDC_BASE_MAINNET).balanceOf(winner), amount, "winner paid in real USDC");
        assertEq(controller.remaining(poolId), 0);
    }
}
