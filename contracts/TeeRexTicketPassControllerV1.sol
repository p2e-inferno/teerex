// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.6.1/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.6.1/contracts/access/Ownable.sol";

interface IUnlockFactory {
    function createUpgradeableLockAtVersion(
        bytes memory data,
        uint16 lockVersion,
        bytes[] calldata transactions
    ) external returns (address);
}

interface IPublicLockV14 {
    function addLockManager(address account) external;
    function renounceLockManager() external;
    function setOwner(address account) external;
    function updateLockConfig(
        uint256 newExpirationDuration,
        uint256 maxNumberOfKeys,
        uint256 maxKeysPerAccount
    ) external;
    function updateKeyPricing(uint256 newKeyPrice, address tokenAddress_) external;

    function grantKeys(
        address[] calldata recipients,
        uint256[] calldata expirationTimestamps,
        address[] calldata keyManagers
    ) external returns (uint256[] memory);

    function totalSupply() external view returns (uint256);
    function isValidKey(uint256 tokenId) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function expirationDuration() external view returns (uint256);
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title TeeRexTicketPassControllerV1
 * @notice Escrow + fulfillment controller for TeeRex "Ticket Pass" bundles.
 *
 * A creator funds a pass for its full capacity up-front; the controller deploys a dedicated
 * Unlock lock (key = one redeemable pass) and custodies the deposited ERC20/native value.
 * After a verified off-chain payment, the platform `granter` calls `grantAndDispense` which, in a
 * SINGLE atomic transaction, mints a key to the buyer, marks its token id redeemed, and pushes the
 * pass's value to the buyer. There is therefore no "granted but not delivered" window.
 *
 * Design notes:
 * - The controller is a PERMANENT lock manager (it grants keys and can hard-stop a closed pass).
 *   The platform's `granter` wallet is NOT a lock manager; it only authorizes controller calls,
 *   so a compromised platform key can never touch escrow — only mint passes up to the funded cap.
 * - Per-copy payout amounts and the payout token are immutable after creation (no setter), so a
 *   creator cannot shrink what buyers receive after sales begin.
 * - There is intentionally NO owner drain of contract balance: escrow only leaves via
 *   dispense-to-key-owner or creator-only close/withdraw. Per-pass accounting prevents any pass
 *   from touching another pass's escrow.
 * - `processedOrder[orderRef]` makes fiat fulfilment idempotent at the chain level, complementing
 *   the off-chain payment-reference unique index and issuance lock.
 * - `dispense(lock, tokenId)` is a permissionless recovery / forward-compat hook (e.g. future
 *   direct on-chain purchase or alternative payment rails such as Paycrest): it always pays
 *   ownerOf(tokenId), so triggering it can never misdirect funds.
 */
contract TeeRexTicketPassControllerV1 is ReentrancyGuard, Ownable {
    uint256 internal constant IMPRACTICAL_PRICE = type(uint256).max / 4;
    uint256 internal constant UNLIMITED = type(uint256).max;

    uint16 public constant VERSION = 1;
    address public immutable unlockFactory;
    uint16 public immutable lockVersion;

    /// @notice Platform wallet authorized to issue passes after a verified payment.
    address public granter;

    struct PassConfig {
        bool exists;
        bool closed;
        bool issuanceEnabled;
        address creator;       // immutable owner of the pass; only address that can close/withdraw/toggle
        address payoutToken;   // ERC20 dispensed per copy; address(0) when native-only
        uint256 tokenPerCopy;  // ERC20 amount delivered per redeemed pass
        uint256 ethPerCopy;    // wei delivered per redeemed pass
        uint256 maxCopies;     // == lock maxNumberOfKeys; full pre-funded capacity
        uint256 keyExpiration; // key expiration duration (seconds) or UNLIMITED sentinel
        uint256 tokenEscrow;   // remaining ERC20 escrow for this pass
        uint256 ethEscrow;     // remaining native escrow (wei) for this pass
        uint256 redeemedCount; // passes dispensed so far
        uint256 keyMaxPerAccount; // max passes a single buyer may hold (== lock maxKeysPerAddress)
    }

    mapping(address => PassConfig) public passByLock;             // lock => config
    mapping(address => mapping(uint256 => bool)) public redeemed; // lock => tokenId => redeemed
    mapping(bytes32 => bool) public processedOrder;               // orderRef => processed

    error InvalidFactory();
    error InvalidLockVersion();
    error InvalidGranter();
    error InvalidConfig();
    error EmptyPass();
    error InvalidPayoutToken();
    error MathOverflow();

    error NativeEscrowMismatch(uint256 required, uint256 provided);
    error InsufficientTokenBalance(uint256 required, uint256 balance);
    error InsufficientTokenAllowance(uint256 required, uint256 allowance);
    error TokenEscrowTransferFailed();

    error UnknownPass();
    error NotGranter();
    error NotCreator();
    error InvalidRecipient();
    error PassClosed();
    error AlreadyClosed();
    error NotClosed();
    error IssuanceDisabled();
    error OrderAlreadyProcessed();
    error SoldOut();
    error PerBuyerLimitReached();
    error AlreadyRedeemed();
    error InvalidKey();
    error NothingToWithdraw();

    error PayoutTokenTransferFailed();
    error PayoutNativeTransferFailed();
    error ERC20WithdrawFailed();
    error NativeWithdrawFailed();

    event GranterUpdated(address indexed previousGranter, address indexed newGranter);

    event PassCreated(
        address indexed lock,
        address indexed creator,
        address indexed payoutToken,
        uint256 tokenPerCopy,
        uint256 ethPerCopy,
        uint256 maxCopies,
        uint256 keyExpiration,
        uint256 tokenEscrow,
        uint256 ethEscrow
    );

    event PassGrantedAndDispensed(
        address indexed lock,
        address indexed recipient,
        uint256 indexed tokenId,
        bytes32 orderRef,
        uint256 tokenAmount,
        uint256 ethAmount
    );

    event PassDispensed(
        address indexed lock,
        address indexed recipient,
        uint256 indexed tokenId,
        uint256 tokenAmount,
        uint256 ethAmount
    );

    event IssuanceToggled(address indexed lock, bool enabled);

    event PassClosed(
        address indexed lock,
        address indexed creator,
        uint256 tokenResidual,
        uint256 ethResidual
    );

    event ResidualWithdrawn(
        address indexed lock,
        address indexed creator,
        uint256 tokenResidual,
        uint256 ethResidual
    );

    constructor(
        address _unlockFactory,
        uint16 _lockVersion,
        address _granter,
        address _initialOwner
    ) Ownable(_initialOwner) {
        if (_unlockFactory == address(0)) revert InvalidFactory();
        if (_lockVersion == 0) revert InvalidLockVersion();
        if (_granter == address(0)) revert InvalidGranter();

        unlockFactory = _unlockFactory;
        lockVersion = _lockVersion;
        granter = _granter;
    }

    // ---------------------------------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------------------------------

    /// @notice Rotate the platform issuance wallet. Owner-only; never affects escrow.
    function setGranter(address _granter) external onlyOwner {
        if (_granter == address(0)) revert InvalidGranter();
        emit GranterUpdated(granter, _granter);
        granter = _granter;
    }

    // ---------------------------------------------------------------------------------------------
    // Creation (atomic deploy + fund)
    // ---------------------------------------------------------------------------------------------

    /**
     * @notice Deploy a pass lock and escrow its full capacity in one transaction.
     * @param expirationDuration Key expiration in seconds, or UNLIMITED for non-expiring passes.
     * @param maxCopies          Total passes available (== lock maxNumberOfKeys).
     * @param maxKeysPerAccount  Max passes one buyer can hold (== lock maxKeysPerAddress).
     * @param payoutToken        ERC20 to dispense, or address(0) for native-only.
     * @param tokenPerCopy       ERC20 amount delivered per redeemed pass (0 when native-only).
     * @param ethPerCopy         Native wei delivered per redeemed pass (0 when token-only).
     * @param creator_           Pass owner; defaults to msg.sender when zero.
     */
    function createPass(
        uint256 expirationDuration,
        uint256 maxCopies,
        uint256 maxKeysPerAccount,
        string calldata lockName,
        address payoutToken,
        uint256 tokenPerCopy,
        uint256 ethPerCopy,
        address creator_
    ) external payable nonReentrant returns (address lock) {
        if (maxCopies == 0) revert InvalidConfig();
        if (maxKeysPerAccount == 0 || maxKeysPerAccount > maxCopies) revert InvalidConfig();
        if (expirationDuration == 0) revert InvalidConfig();
        if (tokenPerCopy == 0 && ethPerCopy == 0) revert EmptyPass();
        // payoutToken present iff tokenPerCopy > 0
        if ((tokenPerCopy > 0) != (payoutToken != address(0))) revert InvalidPayoutToken();

        address creator = creator_ == address(0) ? msg.sender : creator_;

        uint256 tokenEscrow = _mul(tokenPerCopy, maxCopies);
        uint256 ethEscrow = _mul(ethPerCopy, maxCopies);

        if (msg.value != ethEscrow) revert NativeEscrowMismatch(ethEscrow, msg.value);

        if (tokenPerCopy > 0) {
            uint256 bal = IERC20(payoutToken).balanceOf(msg.sender);
            if (bal < tokenEscrow) revert InsufficientTokenBalance(tokenEscrow, bal);
            uint256 allo = IERC20(payoutToken).allowance(msg.sender, address(this));
            if (allo < tokenEscrow) revert InsufficientTokenAllowance(tokenEscrow, allo);
        }

        // Deploy the lock. Key price is impractical so the public purchase() path is disabled;
        // passes are only mintable by this controller via grantAndDispense.
        bytes memory initData = abi.encodeWithSignature(
            "initialize(address,uint256,address,uint256,uint256,string)",
            unlockFactory,
            expirationDuration,
            address(0),
            IMPRACTICAL_PRICE,
            maxCopies,
            lockName
        );

        bytes[] memory txs = new bytes[](4);
        // Make THIS controller a permanent lock manager.
        txs[0] = abi.encodeWithSignature("addLockManager(address)", address(this));
        // Hand cosmetic ownership to the creator.
        txs[1] = abi.encodeWithSignature("setOwner(address)", creator);
        // Set per-buyer cap (initialize only sets expiration + maxNumberOfKeys).
        txs[2] = abi.encodeWithSignature(
            "updateLockConfig(uint256,uint256,uint256)",
            expirationDuration,
            maxCopies,
            maxKeysPerAccount
        );
        // Factory (the executor of these txs) renounces, leaving the controller as sole manager.
        txs[3] = abi.encodeWithSignature("renounceLockManager()");

        lock = IUnlockFactory(unlockFactory).createUpgradeableLockAtVersion(
            initData,
            lockVersion,
            txs
        );

        // Effects: record config before pulling funds.
        passByLock[lock] = PassConfig({
            exists: true,
            closed: false,
            issuanceEnabled: true,
            creator: creator,
            payoutToken: payoutToken,
            tokenPerCopy: tokenPerCopy,
            ethPerCopy: ethPerCopy,
            maxCopies: maxCopies,
            keyExpiration: expirationDuration,
            tokenEscrow: tokenEscrow,
            ethEscrow: ethEscrow,
            redeemedCount: 0,
            keyMaxPerAccount: maxKeysPerAccount
        });

        // Interaction: pull ERC20 escrow (native escrow already arrived via msg.value).
        if (tokenPerCopy > 0) {
            bool ok = IERC20(payoutToken).transferFrom(msg.sender, address(this), tokenEscrow);
            if (!ok) revert TokenEscrowTransferFailed();
        }

        emit PassCreated(
            lock,
            creator,
            payoutToken,
            tokenPerCopy,
            ethPerCopy,
            maxCopies,
            expirationDuration,
            tokenEscrow,
            ethEscrow
        );
    }

    // ---------------------------------------------------------------------------------------------
    // Fulfilment
    // ---------------------------------------------------------------------------------------------

    /**
     * @notice Atomically mint a pass to `recipient` and deliver its value. Granter-only.
     * @dev `orderRef` (typically keccak256 of the off-chain payment reference) makes this
     *      idempotent on-chain: a replayed call reverts with OrderAlreadyProcessed.
     */
    function grantAndDispense(
        address lock,
        address recipient,
        bytes32 orderRef
    ) external nonReentrant returns (uint256 tokenId) {
        if (msg.sender != granter) revert NotGranter();
        if (recipient == address(0)) revert InvalidRecipient();

        PassConfig storage cfg = _cfg(lock);
        if (cfg.closed) revert PassClosed();
        if (!cfg.issuanceEnabled) revert IssuanceDisabled();
        if (processedOrder[orderRef]) revert OrderAlreadyProcessed();
        if (cfg.redeemedCount >= cfg.maxCopies) revert SoldOut();
        // Enforce the per-buyer cap explicitly: Unlock's grantKeys (manager path) bypasses the
        // lock's maxKeysPerAddress check, so we guard it here against the recipient's live balance.
        if (IPublicLockV14(lock).balanceOf(recipient) >= cfg.keyMaxPerAccount) revert PerBuyerLimitReached();

        // Effects
        processedOrder[orderRef] = true;
        cfg.redeemedCount += 1;
        cfg.tokenEscrow -= cfg.tokenPerCopy;
        cfg.ethEscrow -= cfg.ethPerCopy;

        // Interaction: mint the key (controller is lock manager) and capture its token id.
        uint256 expiration = cfg.keyExpiration == UNLIMITED
            ? UNLIMITED
            : block.timestamp + cfg.keyExpiration;

        address[] memory recipients = new address[](1);
        recipients[0] = recipient;
        uint256[] memory exps = new uint256[](1);
        exps[0] = expiration;
        address[] memory mgrs = new address[](1);
        mgrs[0] = recipient;

        uint256[] memory ids = IPublicLockV14(lock).grantKeys(recipients, exps, mgrs);
        tokenId = ids[0];
        redeemed[lock][tokenId] = true;

        _payout(cfg, recipient);

        emit PassGrantedAndDispensed(
            lock,
            recipient,
            tokenId,
            orderRef,
            cfg.tokenPerCopy,
            cfg.ethPerCopy
        );
    }

    /**
     * @notice Deliver a pass's value for an already-minted, undispensed key.
     * @dev Permissionless: funds always go to ownerOf(tokenId). In V1 every key is dispensed
     *      atomically at grant time, so this is a recovery / forward-compat hook (e.g. future
     *      direct on-chain purchase or alternate payment rails).
     */
    function dispense(address lock, uint256 tokenId) public nonReentrant {
        PassConfig storage cfg = _cfg(lock);
        if (redeemed[lock][tokenId]) revert AlreadyRedeemed();
        if (!IPublicLockV14(lock).isValidKey(tokenId)) revert InvalidKey();
        if (cfg.redeemedCount >= cfg.maxCopies) revert SoldOut();

        address recipient = IPublicLockV14(lock).ownerOf(tokenId);
        if (recipient == address(0)) revert InvalidRecipient();

        redeemed[lock][tokenId] = true;
        cfg.redeemedCount += 1;
        cfg.tokenEscrow -= cfg.tokenPerCopy;
        cfg.ethEscrow -= cfg.ethPerCopy;

        _payout(cfg, recipient);

        emit PassDispensed(lock, recipient, tokenId, cfg.tokenPerCopy, cfg.ethPerCopy);
    }

    /// @notice Convenience: dispense the caller's next valid, undispensed key for a pass.
    function dispenseNext(address lock) external {
        (uint256 tokenId, bool found) = nextUnredeemedToken(lock, msg.sender);
        if (!found) revert InvalidKey();
        dispense(lock, tokenId);
    }

    // ---------------------------------------------------------------------------------------------
    // Creator controls
    // ---------------------------------------------------------------------------------------------

    /// @notice Creator kill-switch for platform issuance (the Ticket Pass analog of removing the
    ///         service manager). Stops new fiat fulfilment without touching escrow or sold passes.
    function setIssuanceEnabled(address lock, bool enabled) external {
        PassConfig storage cfg = _cfg(lock);
        if (msg.sender != cfg.creator) revert NotCreator();
        if (cfg.closed) revert AlreadyClosed();
        cfg.issuanceEnabled = enabled;
        emit IssuanceToggled(lock, enabled);
    }

    /**
     * @notice Close a pass: stop all sales and withdraw the unsold residual to the creator.
     * @dev Escrow backing keys that exist but have not been dispensed yet is reserved so holders
     *      can still redeem; the remainder is returned. In V1 (atomic grant+dispense) the reserved
     *      amount is zero, so the creator recovers all undsold escrow.
     */
    function closePass(address lock) external nonReentrant {
        PassConfig storage cfg = _cfg(lock);
        if (msg.sender != cfg.creator) revert NotCreator();
        if (cfg.closed) revert AlreadyClosed();

        cfg.closed = true;

        // Hard-stop further mints at the lock level (controller is a permanent manager).
        uint256 supply = IPublicLockV14(lock).totalSupply();
        uint256 currentExpiration = IPublicLockV14(lock).expirationDuration();
        IPublicLockV14(lock).updateLockConfig(currentExpiration, supply, 1);

        uint256 outstanding = supply - cfg.redeemedCount;
        (uint256 tokenResidual, uint256 ethResidual) = _residual(cfg, outstanding);

        cfg.tokenEscrow -= tokenResidual;
        cfg.ethEscrow -= ethResidual;

        _withdrawTo(cfg, cfg.creator, tokenResidual, ethResidual);

        emit PassClosed(lock, cfg.creator, tokenResidual, ethResidual);
    }

    /// @notice After close, sweep escrow freed up as previously-outstanding keys get dispensed/expire.
    function withdrawResidual(address lock) external nonReentrant {
        PassConfig storage cfg = _cfg(lock);
        if (msg.sender != cfg.creator) revert NotCreator();
        if (!cfg.closed) revert NotClosed();

        uint256 supply = IPublicLockV14(lock).totalSupply();
        uint256 outstanding = supply - cfg.redeemedCount;
        (uint256 tokenResidual, uint256 ethResidual) = _residual(cfg, outstanding);
        if (tokenResidual == 0 && ethResidual == 0) revert NothingToWithdraw();

        cfg.tokenEscrow -= tokenResidual;
        cfg.ethEscrow -= ethResidual;

        _withdrawTo(cfg, cfg.creator, tokenResidual, ethResidual);

        emit ResidualWithdrawn(lock, cfg.creator, tokenResidual, ethResidual);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function previewEscrowRequirement(
        uint256 maxCopies,
        uint256 tokenPerCopy,
        uint256 ethPerCopy
    ) external pure returns (uint256 tokenEscrow, uint256 ethEscrow) {
        tokenEscrow = _mul(tokenPerCopy, maxCopies);
        ethEscrow = _mul(ethPerCopy, maxCopies);
    }

    function isRedeemed(address lock, uint256 tokenId) external view returns (bool) {
        return redeemed[lock][tokenId];
    }

    function remainingCopies(address lock) external view returns (uint256) {
        PassConfig storage cfg = _cfgView(lock);
        return cfg.maxCopies - cfg.redeemedCount;
    }

    function nextUnredeemedToken(address lock, address owner)
        public
        view
        returns (uint256 tokenId, bool found)
    {
        _cfgView(lock);
        uint256 bal = IPublicLockV14(lock).balanceOf(owner);
        for (uint256 i = 0; i < bal; i++) {
            uint256 tid = IPublicLockV14(lock).tokenOfOwnerByIndex(owner, i);
            if (!redeemed[lock][tid] && IPublicLockV14(lock).isValidKey(tid)) {
                return (tid, true);
            }
        }
        return (0, false);
    }

    function withdrawablePreview(address lock)
        external
        view
        returns (uint256 tokenResidual, uint256 ethResidual)
    {
        PassConfig storage cfg = _cfgView(lock);
        uint256 supply = IPublicLockV14(lock).totalSupply();
        uint256 outstanding = supply - cfg.redeemedCount;
        return _residual(cfg, outstanding);
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _payout(PassConfig storage cfg, address recipient) internal {
        if (cfg.tokenPerCopy > 0) {
            bool ok = IERC20(cfg.payoutToken).transfer(recipient, cfg.tokenPerCopy);
            if (!ok) revert PayoutTokenTransferFailed();
        }
        if (cfg.ethPerCopy > 0) {
            (bool sent, ) = payable(recipient).call{value: cfg.ethPerCopy}("");
            if (!sent) revert PayoutNativeTransferFailed();
        }
    }

    function _withdrawTo(
        PassConfig storage cfg,
        address to,
        uint256 tokenAmt,
        uint256 ethAmt
    ) internal {
        if (tokenAmt > 0) {
            bool ok = IERC20(cfg.payoutToken).transfer(to, tokenAmt);
            if (!ok) revert ERC20WithdrawFailed();
        }
        if (ethAmt > 0) {
            (bool sent, ) = payable(to).call{value: ethAmt}("");
            if (!sent) revert NativeWithdrawFailed();
        }
    }

    function _residual(PassConfig storage cfg, uint256 outstanding)
        internal
        view
        returns (uint256 tokenResidual, uint256 ethResidual)
    {
        uint256 reservedToken = outstanding * cfg.tokenPerCopy;
        uint256 reservedEth = outstanding * cfg.ethPerCopy;
        tokenResidual = cfg.tokenEscrow > reservedToken ? cfg.tokenEscrow - reservedToken : 0;
        ethResidual = cfg.ethEscrow > reservedEth ? cfg.ethEscrow - reservedEth : 0;
    }

    function _mul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0 || b == 0) return 0;
        if (a > type(uint256).max / b) revert MathOverflow();
        return a * b;
    }

    function _cfg(address lock) internal view returns (PassConfig storage cfg) {
        cfg = passByLock[lock];
        if (!cfg.exists) revert UnknownPass();
    }

    function _cfgView(address lock) internal view returns (PassConfig storage cfg) {
        cfg = passByLock[lock];
        if (!cfg.exists) revert UnknownPass();
    }

    receive() external payable {}
}
