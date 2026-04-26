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

    function protocolFee() external view returns (uint256);
}

interface IPublicLockV14 {
    function addLockManager(address account) external;
    function renounceLockManager() external;
    function setOwner(address account) external;
    function updateTransferFee(uint256 transferFeeBasisPoints) external;
    function updateRefundPenalty(
        uint256 freeTrialLength,
        uint256 refundPenaltyBasisPoints
    ) external;
    function setReferrerFee(address referrer, uint256 feeBasisPoint) external;
    function revokeRole(bytes32 role, address account) external;

    function totalSupply() external view returns (uint256);
    function isValidKey(uint256 tokenId) external view returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function getHasValidKey(address _user) external view returns (bool);
    function isLockManager(address account) external view returns (bool);

    function expireAndRefundFor(uint256 tokenId, uint256 amount) external;

    function expirationDuration() external view returns (uint256);

    function updateLockConfig(
        uint256 newExpirationDuration,
        uint256 maxNumberOfKeys,
        uint256 maxKeysPerAccount
    ) external;

    function updateKeyPricing(uint256 newKeyPrice, address tokenAddress_) external;
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract RefundableEventLockController is ReentrancyGuard, Ownable {
    bytes32 internal constant KEY_GRANTER_ROLE = keccak256("KEY_GRANTER");

    uint256 internal constant MAX_BOND_FEE_BUFFER_BPS = 500;
    uint256 internal constant BASIS_POINTS_DEN = 10_000;
    uint256 internal constant DISABLE_TRANSFERS_BPS = 10_000;
    uint256 internal constant ZERO_REFUND_BPS = 10_000;
    uint256 internal constant DEFAULT_POST_RELEASE_REFUND_PENALTY_BPS = 1000; // 10%
    uint256 internal constant POST_RELEASE_TRANSFER_FEE_BPS = 0;
    uint256 internal constant IMPRACTICAL_PRICE = type(uint256).max / 4;

    address public immutable unlockFactory;
    uint16 public immutable lockVersion;
    uint16 public bondFeeBufferBps;

    bool private _entered;

    struct EventConfig {
        bool exists;
        bool managerReleased;
        bool cancelInitiated;
        bool refundComplete;

        address creator;
        address currency;

        uint256 keyPrice;
        uint256 minAttendees;
        uint256 refundTriggerTime;
        uint256 eventStartTime;
        uint256 eventEndTime;

        uint256 protocolFeeBpsAtCreation;
        uint256 effectiveBondFeeBps;
        uint256 reserveBond;

        uint256 refundCursor;
        uint256 refundUpperTokenId;
    }

    mapping(address => EventConfig) public eventConfigByLock;

    error InvalidFactory();
    error InvalidLockVersion();
    error InvalidBondBuffer();
    error InvalidConfig();
    error ZeroKeyPrice();
    error ZeroMinAttendees();

    error UnknownLock();
    error Unauthorized();
    error TooEarly();
    error AlreadyReleased();
    error AlreadyCancelled();
    error RefundAlreadyComplete();
    error RefundNotComplete();
    error ThresholdAlreadyMet();
    error ThresholdNotMet();
    error InvalidBatchSize();

    error MathOverflow();
    error BondFundingFailed();
    error InsufficientRefundReserve();

    error NativeBondMismatch(uint256 required, uint256 provided);
    error UnexpectedNativeValue();
    error InsufficientTokenBondBalance(uint256 required, uint256 balance);
    error InsufficientTokenBondAllowance(uint256 required, uint256 allowance);
    error ERC20BondTransferFailed();

    error InvalidRecipient();
    error NativeWithdrawFailed();
    error ERC20WithdrawFailed();

    event FundsWithdrawn(address indexed token, address indexed to, uint256 amount, bool isNative);


    event ProtectedEventLockCreated(
        address indexed lock,
        address indexed creator,
        address indexed currency,
        uint256 keyPrice,
        uint256 minAttendees,
        uint256 refundTriggerTime,
        uint256 eventStartTime,
        uint256 eventEndTime,
        uint256 protocolFeeBpsAtCreation,
        uint256 effectiveBondFeeBps,
        uint256 reserveBond
    );

    event CancellationInitiated(
        address indexed lock,
        uint256 supplySnapshot,
        uint256 refundCursorStart
    );

    event RefundBatchProcessed(
        address indexed lock,
        uint256 processed,
        uint256 nextCursor,
        bool complete
    );

    event ManagerReleased(
        address indexed lock,
        address indexed creator
    );

    constructor(
        address _unlockFactory,
        uint16 _lockVersion,
        uint16 _bondFeeBufferBps,
        address _initialOwner
    ) Ownable(_initialOwner) {
        if (_unlockFactory == address(0)) revert InvalidFactory();
        if (_lockVersion == 0) revert InvalidLockVersion();
        if (_bondFeeBufferBps > MAX_BOND_FEE_BUFFER_BPS) revert InvalidBondBuffer();

        unlockFactory = _unlockFactory;
        lockVersion = _lockVersion;
        bondFeeBufferBps = _bondFeeBufferBps;
    }

    function setBondFeeBuffer(uint16 _bondFeeBufferBps) external onlyOwner {
        if (_bondFeeBufferBps > MAX_BOND_FEE_BUFFER_BPS) revert InvalidBondBuffer();
        bondFeeBufferBps = _bondFeeBufferBps;
    }

    function createProtectedEventLock(
        uint256 expirationDuration,
        address currency,
        uint256 keyPrice_,
        uint256 maxNumberOfKeys,
        string calldata lockName,
        uint256 minAttendees,
        uint256 refundTriggerTime,
        uint256 eventStartTime,
        uint256 eventEndTime,
        address eventCreator_
    ) external payable nonReentrant returns (address lock) {
        if (keyPrice_ == 0) revert ZeroKeyPrice();
        if (minAttendees == 0) revert ZeroMinAttendees();
        if (maxNumberOfKeys == 0) revert InvalidConfig();
        if (
            refundTriggerTime > eventStartTime ||
            eventStartTime >= eventEndTime ||
            expirationDuration == 0
        ) revert InvalidConfig();

        uint256 currentProtocolFeeBps = IUnlockFactory(unlockFactory).protocolFee();
        uint256 effectiveBondFeeBps = currentProtocolFeeBps + bondFeeBufferBps;
        address eventCreator = eventCreator_ == address(0) ? msg.sender : eventCreator_;

        uint256 reserveBond = _calculateReserveBond(
            minAttendees,
            keyPrice_,
            effectiveBondFeeBps
        );

        if (currency == address(0)) {
            if (msg.value != reserveBond) {
                revert NativeBondMismatch(reserveBond, msg.value);
            }
        } else {
            if (msg.value != 0) revert UnexpectedNativeValue();

            uint256 balance = IERC20(currency).balanceOf(msg.sender);
            if (balance < reserveBond) {
                revert InsufficientTokenBondBalance(reserveBond, balance);
            }

            uint256 allowance = IERC20(currency).allowance(msg.sender, address(this));
            if (allowance < reserveBond) {
                revert InsufficientTokenBondAllowance(reserveBond, allowance);
            }
        }

        bytes memory initData = abi.encodeWithSignature(
            "initialize(address,uint256,address,uint256,uint256,string)",
            unlockFactory,
            expirationDuration,
            currency,
            keyPrice_,
            maxNumberOfKeys,
            lockName
        );

        bytes[] memory txs = new bytes[](7);

        txs[0] = abi.encodeWithSignature(
            "addLockManager(address)",
            address(this)
        );

        txs[1] = abi.encodeWithSignature(
            "setOwner(address)",
            eventCreator
        );

        txs[2] = abi.encodeWithSignature(
            "updateTransferFee(uint256)",
            DISABLE_TRANSFERS_BPS
        );

        txs[3] = abi.encodeWithSignature(
            "updateRefundPenalty(uint256,uint256)",
            0,
            ZERO_REFUND_BPS
        );

        txs[4] = abi.encodeWithSignature(
            "setReferrerFee(address,uint256)",
            address(0),
            0
        );

        txs[5] = abi.encodeWithSignature(
            "revokeRole(bytes32,address)",
            KEY_GRANTER_ROLE,
            unlockFactory
        );

        txs[6] = abi.encodeWithSignature(
            "renounceLockManager()"
        );

        lock = IUnlockFactory(unlockFactory).createUpgradeableLockAtVersion(
            initData,
            lockVersion,
            txs
        );

        if (reserveBond > 0) {
            if (currency == address(0)) {
                (bool sent, ) = payable(lock).call{value: reserveBond}("");
                if (!sent) revert BondFundingFailed();
            } else {
                bool ok = IERC20(currency).transferFrom(msg.sender, lock, reserveBond);
                if (!ok) revert ERC20BondTransferFailed();
            }
        }

        eventConfigByLock[lock] = EventConfig({
            exists: true,
            managerReleased: false,
            cancelInitiated: false,
            refundComplete: false,
            creator: eventCreator,
            currency: currency,
            keyPrice: keyPrice_,
            minAttendees: minAttendees,
            refundTriggerTime: refundTriggerTime,
            eventStartTime: eventStartTime,
            eventEndTime: eventEndTime,
            protocolFeeBpsAtCreation: currentProtocolFeeBps,
            effectiveBondFeeBps: effectiveBondFeeBps,
            reserveBond: reserveBond,
            refundCursor: 0,
            refundUpperTokenId: 0
        });

        emit ProtectedEventLockCreated(
            lock,
            eventCreator,
            currency,
            keyPrice_,
            minAttendees,
            refundTriggerTime,
            eventStartTime,
            eventEndTime,
            currentProtocolFeeBps,
            effectiveBondFeeBps,
            reserveBond
        );
    }

    function releaseManagerToCreator(address lock) external nonReentrant {
        EventConfig storage cfg = _cfg(lock);

        if (msg.sender != cfg.creator) revert Unauthorized();
        if (cfg.managerReleased) revert AlreadyReleased();
        if (cfg.cancelInitiated && !cfg.refundComplete) revert RefundNotComplete();
        if (block.timestamp < cfg.refundTriggerTime) revert TooEarly();

        if (!cfg.cancelInitiated) {
            uint256 ticketsSold = IPublicLockV14(lock).totalSupply();
            if (ticketsSold < cfg.minAttendees) revert ThresholdNotMet();

            IPublicLockV14(lock).updateTransferFee(POST_RELEASE_TRANSFER_FEE_BPS);
            IPublicLockV14(lock).updateRefundPenalty(0, DEFAULT_POST_RELEASE_REFUND_PENALTY_BPS);
        }

        IPublicLockV14(lock).addLockManager(cfg.creator);
        IPublicLockV14(lock).renounceLockManager();

        cfg.managerReleased = true;

        emit ManagerReleased(lock, cfg.creator);
    }

    function cancelAndBatchRefundFailedEvent(
        address lock,
        uint256 batchSize
    ) external nonReentrant returns (uint256 processed, uint256 nextCursor, bool complete) {
        if (batchSize == 0) revert InvalidBatchSize();

        EventConfig storage cfg = _cfg(lock);

        if (cfg.managerReleased) revert AlreadyReleased();
        if (cfg.refundComplete) revert RefundAlreadyComplete();
        if (block.timestamp < cfg.refundTriggerTime) revert TooEarly();

        _requireCancelCallerAuthorized(lock, msg.sender, cfg);

        if (!cfg.cancelInitiated) {
            uint256 ticketsSold = IPublicLockV14(lock).totalSupply();
            if (ticketsSold >= cfg.minAttendees) revert ThresholdAlreadyMet();
            _initiateCancellation(lock, cfg, ticketsSold);
        }

        uint256 tokenId = cfg.refundCursor;
        uint256 upper = cfg.refundUpperTokenId;

        while (tokenId <= upper && processed < batchSize) {
            if (IPublicLockV14(lock).isValidKey(tokenId)) {
                IPublicLockV14(lock).expireAndRefundFor(tokenId, cfg.keyPrice);
                unchecked {
                    processed++;
                }
            }
            unchecked {
                tokenId++;
            }
        }

        cfg.refundCursor = tokenId;

        if (tokenId > upper) {
            cfg.refundComplete = true;
        }

        nextCursor = cfg.refundCursor;
        complete = cfg.refundComplete;

        emit RefundBatchProcessed(lock, processed, nextCursor, complete);
    }

    function previewReserveBond(
        uint256 minAttendees,
        uint256 keyPrice_
    ) external view returns (
        uint256 currentProtocolFeeBps,
        uint256 effectiveFeeBps,
        uint256 reserveBond
    ) {
        currentProtocolFeeBps = IUnlockFactory(unlockFactory).protocolFee();
        effectiveFeeBps = currentProtocolFeeBps + bondFeeBufferBps;
        reserveBond = _calculateReserveBond(minAttendees, keyPrice_, effectiveFeeBps);
    }

    function attendeeCountForThreshold(address lock) external view returns (uint256) {
        return IPublicLockV14(lock).totalSupply();
    }

    function thresholdMet(address lock) external view returns (bool) {
        EventConfig storage cfg = _cfgView(lock);
        return IPublicLockV14(lock).totalSupply() >= cfg.minAttendees;
    }

    function currentRefundReserve(address lock) public view returns (uint256) {
        EventConfig storage cfg = _cfgView(lock);
        if (cfg.currency == address(0)) {
            return lock.balance;
        }
        return IERC20(cfg.currency).balanceOf(lock);
    }

    function requiredFullRefundAtCurrentSupply(address lock) public view returns (uint256) {
        EventConfig storage cfg = _cfgView(lock);
        return IPublicLockV14(lock).totalSupply() * cfg.keyPrice;
    }

    function isAuthorizedRefundCaller(address lock, address account) external view returns (bool) {
        EventConfig storage cfg = _cfgView(lock);

        if (block.timestamp < cfg.refundTriggerTime) {
            return false;
        }

        if (block.timestamp >= cfg.eventEndTime) {
            return account == cfg.creator;
        }

        if (account == cfg.creator) return true;
        return IPublicLockV14(lock).getHasValidKey(account);
    }

    function _initiateCancellation(
        address lock,
        EventConfig storage cfg,
        uint256 ticketsSold
    ) internal {
        IPublicLockV14 p_lock = IPublicLockV14(lock);

        uint256 reserve = currentRefundReserve(lock);
        uint256 required = ticketsSold * cfg.keyPrice;
        if (reserve < required) revert InsufficientRefundReserve();

        uint256 currentExpiration = p_lock.expirationDuration();

        p_lock.updateLockConfig(currentExpiration, ticketsSold, 1);
        p_lock.updateKeyPricing(IMPRACTICAL_PRICE, cfg.currency);

        cfg.cancelInitiated = true;
        cfg.refundCursor = 1;
        cfg.refundUpperTokenId = ticketsSold;

        emit CancellationInitiated(lock, ticketsSold, 1);
    }

    function _requireCancelCallerAuthorized(
        address lock,
        address caller,
        EventConfig storage cfg
    ) internal view {
        if (block.timestamp >= cfg.eventEndTime) {
            if (caller != cfg.creator) revert Unauthorized();
            return;
        }
        bool callerHasValidTicket = IPublicLockV14(lock).getHasValidKey(caller);
        bool isAuthorized = callerHasValidTicket || caller == cfg.creator;

        if (isAuthorized) return;

        revert Unauthorized();
    }

    function _calculateReserveBond(
        uint256 minAttendees,
        uint256 keyPrice_,
        uint256 feeBps
    ) internal pure returns (uint256) {
        uint256 ticketsAtRisk = minAttendees - 1;

        if (ticketsAtRisk == 0 || keyPrice_ == 0 || feeBps == 0) {
            return 0;
        }

        if (keyPrice_ > type(uint256).max / ticketsAtRisk) revert MathOverflow();
        uint256 worstCaseFailedRevenue = ticketsAtRisk * keyPrice_;

        if (worstCaseFailedRevenue > type(uint256).max / feeBps) revert MathOverflow();
        uint256 numerator = worstCaseFailedRevenue * feeBps;

        uint256 bond = numerator / BASIS_POINTS_DEN;
        if (numerator % BASIS_POINTS_DEN != 0) {
            unchecked {
                bond += 1;
            }
        }

        return bond;
    }

    function _cfg(address lock) internal view returns (EventConfig storage cfg) {
        cfg = eventConfigByLock[lock];
        if (!cfg.exists) revert UnknownLock();
    }

    function _cfgView(address lock) internal view returns (EventConfig storage cfg) {
        cfg = eventConfigByLock[lock];
        if (!cfg.exists) revert UnknownLock();
    }

    receive() external payable {}

    function withdrawContractBalance(
        address token,
        address payable to
    ) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidRecipient();
        bool isNative = token == address(0);
        uint256 amount;

        if (isNative) {
            amount = address(this).balance;
            (bool sent, ) = to.call{value: amount}("");
            if (!sent) revert NativeWithdrawFailed();
        } else {
            amount = IERC20(token).balanceOf(address(this));
            bool ok = IERC20(token).transfer(to, amount);
            if (!ok) revert ERC20WithdrawFailed();
        }

        emit FundsWithdrawn(token, to, amount, isNative);
    }
}
