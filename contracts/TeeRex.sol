/**
 * SPDX-License-Identifier: MIT
 */
pragma solidity 0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import {IEAS} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import {
    EIP712Proxy,
    DelegatedProxyAttestationRequest,
    MultiDelegatedProxyAttestationRequest
} from "@ethereum-attestation-service/eas-contracts/contracts/eip712/proxy/EIP712Proxy.sol";

interface IUnlockV13 {
    function getHasValidKey(address _keyOwner) external view returns (bool);
    function balanceOf(address _keyOwner) external view returns (uint256);
    function keyExpirationTimestampFor(address _keyOwner) external view returns (uint256);
    function isLockManager(address _lockManager) external view returns (bool);
}

// Custom errors
error InvalidEASAddress();
error InvalidEventId();
error InvalidLockAddress();
error InvalidRecipient();
error InvalidBatchSize();
error InvalidSignatures();
error EventNotRegistered();
error EventAlreadyExists();
error LockAlreadyUsed();
error NotLockManager();
error NoValidKey();
error KeyExpired();
error SchemaNotEnabled();
error NotRegisteredCreator();
error NotAuthorized();
error DelegationExpired();
error NoAttestationsProvided();
error BatchSizeTooLarge();

/**
 * @title TeeRexAttestation
 * @notice Token-gated batch attestation contract for event management integrated with EAS proxy
 */
contract TeeRexAttestation is EIP712Proxy, Ownable, ReentrancyGuard, Pausable {
    IEAS public immutable eas;

    // Lock Address => Is Event Lock mapping
    mapping(address => bool) public isEventLock;

    // Schema UID => Enabled status
    mapping(bytes32 => bool) public enabledSchemas;

    // Lock addresses for access control
    address public creatorLock; // Lock that grants creator permissions
    address public adminLock;   // Lock that grants admin permissions

    // Maximum batch size to prevent gas issues
    uint256 public maxBatchSize = 50;

    event EventLockRegistered(address indexed lockAddress);
    event SchemaEnabled(bytes32 indexed schemaUID, bool enabled);
    event TeeRexAttestationCreated(
        address indexed lockAddress,
        bytes32 indexed schemaUID,
        address indexed attester,
        uint256 attestationCount
    );
    event CreatorLockUpdated(address indexed lockAddress);
    event AdminLockUpdated(address indexed lockAddress);
    event MaxBatchSizeUpdated(uint256 newMaxSize);

    constructor(address _eas, address _initialOwner, string memory domainName)
        EIP712Proxy(IEAS(_eas), domainName)
        Ownable(_initialOwner)
    {
        if (_eas == address(0)) revert InvalidEASAddress();
        eas = IEAS(_eas);
    }

    modifier onlyAdmin() {
        if (msg.sender != owner() && (adminLock == address(0) || !_hasValidKey(adminLock, msg.sender))) {
            revert NotAuthorized();
        }
        _;
    }

    modifier onlyCreators() {
        if (creatorLock == address(0) || !_hasValidKey(creatorLock, msg.sender)) {
            revert NotRegisteredCreator();
        }
        _;
    }

    modifier validSchema(bytes32 schemaUID) {
        if (!enabledSchemas[schemaUID]) revert SchemaNotEnabled();
        _;
    }

    modifier onlyKeyHolder(address lockAddress) {
        if (!isEventLock[lockAddress]) revert EventNotRegistered();
        IUnlockV13 lock = IUnlockV13(lockAddress);
        if (!lock.getHasValidKey(msg.sender)) revert NoValidKey();
        _;
    }

    // Internal function to check if address has valid key for a lock
    function _hasValidKey(address lockAddress, address keyHolder) internal view returns (bool) {
        IUnlockV13 lock = IUnlockV13(lockAddress);
        return lock.getHasValidKey(keyHolder);
    }

    /**
     * @dev Register a lock address as an event lock
     * @param lockAddress The Unlock Protocol lock address
     */
    function registerEventLock(address lockAddress) external onlyCreators {
        if (lockAddress == address(0)) revert InvalidLockAddress();
        if (isEventLock[lockAddress]) revert LockAlreadyUsed();
        // Verify caller is a manager of the lock
        IUnlockV13 lock = IUnlockV13(lockAddress);
        if (!lock.isLockManager(msg.sender)) revert NotLockManager();
        isEventLock[lockAddress] = true;
        emit EventLockRegistered(lockAddress);
    }

    /**
     * @dev Enable or disable a schema for attestations
     * @param schemaUID The schema identifier
     * @param enabled Whether the schema should be enabled
     */
    function setSchemaEnabled(bytes32 schemaUID, bool enabled) external onlyAdmin {
        enabledSchemas[schemaUID] = enabled;
        emit SchemaEnabled(schemaUID, enabled);
    }

    /**
     * @dev Set the creator lock address
     * @param lockAddress The Unlock Protocol lock address for creators
     */
    function setCreatorLock(address lockAddress) external onlyOwner {
        creatorLock = lockAddress;
        emit CreatorLockUpdated(lockAddress);
    }

    /**
     * @dev Set the admin lock address
     * @param lockAddress The Unlock Protocol lock address for admins
     */
    function setAdminLock(address lockAddress) external onlyOwner {
        adminLock = lockAddress;
        emit AdminLockUpdated(lockAddress);
    }

    /**
     * @dev Update maximum batch size
     * @param newMaxSize The new maximum batch size
     */
    function setMaxBatchSize(uint256 newMaxSize) external onlyAdmin {
        if (newMaxSize == 0 || newMaxSize > 100) revert InvalidBatchSize();
        maxBatchSize = newMaxSize;
        emit MaxBatchSizeUpdated(newMaxSize);
    }

    /**
     * @dev Internal helper to enforce that only authorized attesters can delegate
     */
    function _verifyAttester(address attester) internal view {
        if (attester == owner()) return;
        if (adminLock != address(0) && _hasValidKey(adminLock, attester)) return;
        if (creatorLock != address(0) && _hasValidKey(creatorLock, attester)) return;
        revert NotAuthorized();
    }

    /**
     * @dev Submit a single delegated attestation via proxy
     */
    function attestByDelegation(
        DelegatedProxyAttestationRequest calldata delegatedRequest
    ) public payable override returns (bytes32) {
        _verifyAttester(delegatedRequest.attester);
        // Ensure schema is enabled using delegatedRequest.schema
        if (!enabledSchemas[delegatedRequest.schema]) revert SchemaNotEnabled();
        return super.attestByDelegation(delegatedRequest);
    }

    /**
     * @dev Submit multiple delegated attestations via proxy
     */
    function multiAttestByDelegation(
        MultiDelegatedProxyAttestationRequest[] calldata multiDelegatedRequests
    ) public payable override returns (bytes32[] memory) {
        for (uint256 i = 0; i < multiDelegatedRequests.length; i++) {
            _verifyAttester(multiDelegatedRequests[i].attester);
            if (!enabledSchemas[multiDelegatedRequests[i].schema]) revert SchemaNotEnabled();
            if (multiDelegatedRequests[i].data.length > maxBatchSize) revert BatchSizeTooLarge();
        }
        return super.multiAttestByDelegation(multiDelegatedRequests);
    }

    /**
     * @dev Check if a schema is enabled
     * @param schemaUID The schema identifier
     */
    function isSchemaEnabled(bytes32 schemaUID) external view returns (bool) {
        return enabledSchemas[schemaUID];
    }
}
