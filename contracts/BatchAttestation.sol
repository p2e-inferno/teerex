// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

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

interface IEAS {
    function attest(AttestationRequest calldata request) external returns (bytes32);
    function attestByDelegation(DelegatedAttestationRequest calldata delegatedRequest) external returns (bytes32);
    function multiAttestByDelegation(MultiDelegatedAttestationRequest[] calldata multiDelegatedRequests) external returns (bytes32[] memory);
}

struct AttestationRequest {
    bytes32 schema;
    AttestationRequestData data;
}

struct AttestationRequestData {
    address recipient;
    uint64 expirationTime;
    bool revocable;
    bytes32 refUID;
    bytes data;
    uint256 value;
}

struct MultiAttestationRequest {
    bytes32 schema;
    AttestationRequestData[] data;
}

struct DelegatedAttestationRequest {
    bytes32 schema;
    AttestationRequestData data;
    Signature signature;
    address attester;
    uint64 deadline;
}

struct MultiDelegatedAttestationRequest {
    bytes32 schema;
    AttestationRequestData[] data;
    Signature[] signatures;
    address attester;
    uint64 deadline;
}

struct Signature {
    uint8 v;
    bytes32 r;
    bytes32 s;
}

struct BatchAttestationData {
    address recipient;
    bytes data;
    uint64 expirationTime;
    bytes32 refUID;
}

/**
 * @title BatchAttestation
 * @dev Token-gated batch attestation contract for event management
 * @notice Allows holders of Unlock Protocol keys to create batch attestations
 */
contract BatchAttestation is Ownable, ReentrancyGuard, Pausable {
    IEAS public immutable eas;
    
    // Lock Address => Is Event Lock mapping
    mapping(address => bool) public isEventLock;
    
    // Schema UID => Enabled status
    mapping(bytes32 => bool) public enabledSchemas;
    
    // Lock addresses for access control
    address public creatorLock;  // Lock that grants creator permissions
    address public adminLock;    // Lock that grants admin permissions
    
    // Maximum batch size to prevent gas issues
    uint256 public maxBatchSize = 50;
    
    event EventLockRegistered(address indexed lockAddress);
    event SchemaEnabled(bytes32 indexed schemaUID, bool enabled);
    event BatchAttestationCreated(
        address indexed lockAddress,
        bytes32 indexed schemaUID,
        address indexed attester,
        uint256 attestationCount
    );
    event CreatorLockUpdated(address indexed lockAddress);
    event AdminLockUpdated(address indexed lockAddress);
    event MaxBatchSizeUpdated(uint256 newMaxSize);

    modifier onlyAdmin() {
        if (msg.sender != owner() && 
            (adminLock == address(0) || !_hasValidKey(adminLock, msg.sender))) {
            revert NotAuthorized();
        }
        _;
    }

    modifier onlyKeyHolder(address lockAddress) {
        if (!isEventLock[lockAddress]) revert EventNotRegistered();
        
        IUnlockV13 lock = IUnlockV13(lockAddress);
        if (!lock.getHasValidKey(msg.sender)) revert NoValidKey();
        _;
    }

    modifier validSchema(bytes32 schemaUID) {
        if (!enabledSchemas[schemaUID]) revert SchemaNotEnabled();
        _;
    }

    modifier onlyCreators() {
        if (creatorLock == address(0) || !_hasValidKey(creatorLock, msg.sender)) {
            revert NotRegisteredCreator();
        }
        _;
    }

    constructor(address _eas, address _initialOwner) Ownable(_initialOwner) {
        if (_eas == address(0)) revert InvalidEASAddress();
        eas = IEAS(_eas);
    }

    /**
     * @dev Register a lock address as an event lock
     * @param lockAddress The Unlock Protocol lock address
     */
    function registerEventLock(
        address lockAddress
    ) external onlyCreators {
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
    function setSchemaEnabled(
        bytes32 schemaUID,
        bool enabled
    ) external onlyAdmin {
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
     * @dev Internal function to check if address has valid key for a lock
     * @param lockAddress The lock to check against
     * @param keyHolder The address to check
     */
    function _hasValidKey(address lockAddress, address keyHolder) internal view returns (bool) {
        IUnlockV13 lock = IUnlockV13(lockAddress);
        return lock.getHasValidKey(keyHolder);
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
     * @dev Create batch attestations for event attendees using delegation
     * @param lockAddress The event lock address
     * @param schemaUID The schema to use for attestations
     * @param attestations Array of attestation data
     * @param signatures Array of signatures from users delegating attestation
     * @param attester The address that users are delegating to (should be this contract)
     * @param deadline The deadline for the delegation
     * @param revocable Whether attestations can be revoked
     */
    function createBatchAttestationsByDelegation(
        address lockAddress,
        bytes32 schemaUID,
        BatchAttestationData[] memory attestations,
        Signature[] memory signatures,
        address attester,
        uint64 deadline,
        bool revocable
    ) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyCreators()
        validSchema(schemaUID)
        returns (bytes32[] memory)
    {
        if (attestations.length == 0) revert NoAttestationsProvided();
        if (attestations.length > maxBatchSize) revert BatchSizeTooLarge();
        if (signatures.length != attestations.length) revert InvalidSignatures();
        if (block.timestamp > deadline) revert DelegationExpired();

        // Prepare attestation requests
        AttestationRequestData[] memory attestationData = new AttestationRequestData[](attestations.length);
        
        for (uint256 i = 0; i < attestations.length; i++) {
            if (attestations[i].recipient == address(0)) revert InvalidRecipient();
            
            attestationData[i] = AttestationRequestData({
                recipient: attestations[i].recipient,
                expirationTime: attestations[i].expirationTime,
                revocable: revocable,
                refUID: attestations[i].refUID,
                data: attestations[i].data,
                value: 0
            });
        }

        // Create multi-delegated attestation request
        MultiDelegatedAttestationRequest[] memory multiDelegatedRequests = new MultiDelegatedAttestationRequest[](1);
        multiDelegatedRequests[0] = MultiDelegatedAttestationRequest({
            schema: schemaUID,
            data: attestationData,
            signatures: signatures,
            attester: attester,
            deadline: deadline
        });

        // Submit to EAS using delegation
        bytes32[] memory attestationUIDs = eas.multiAttestByDelegation(multiDelegatedRequests);

        emit BatchAttestationCreated(lockAddress, schemaUID, msg.sender, attestations.length);
        
        return attestationUIDs;
    }

    /**
     * @dev Create a single attestation using delegation
     * @param lockAddress The event lock address
     * @param schemaUID The schema to use
     * @param recipient The attestation recipient
     * @param data The attestation data
     * @param signature The signature from user delegating attestation
     * @param attester The address that user is delegating to
     * @param deadline The deadline for the delegation
     * @param expirationTime When the attestation expires
     * @param revocable Whether the attestation can be revoked
     * @param refUID Reference to another attestation
     */
    function createAttestationByDelegation(
        address lockAddress,
        bytes32 schemaUID,
        address recipient,
        bytes memory data,
        Signature memory signature,
        address attester,
        uint64 deadline,
        uint64 expirationTime,
        bool revocable,
        bytes32 refUID
    ) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyCreators()
        validSchema(schemaUID)
        returns (bytes32)
    {
        if (recipient == address(0)) revert InvalidRecipient();
        if (block.timestamp > deadline) revert DelegationExpired();

        DelegatedAttestationRequest memory delegatedRequest = DelegatedAttestationRequest({
            schema: schemaUID,
            data: AttestationRequestData({
                recipient: recipient,
                expirationTime: expirationTime,
                revocable: revocable,
                refUID: refUID,
                data: data,
                value: 0
            }),
            signature: signature,
            attester: attester,
            deadline: deadline
        });

        bytes32 attestationUID = eas.attestByDelegation(delegatedRequest);

        emit BatchAttestationCreated(lockAddress, schemaUID, msg.sender, 1);
        
        return attestationUID;
    }

    /**
     * @dev Check if an address has a valid key for an event lock
     * @param lockAddress The event lock address
     * @param keyHolder The address to check
     */
    function hasValidKeyForEvent(
        address lockAddress,
        address keyHolder
    ) external view returns (bool) {
        if (!isEventLock[lockAddress]) return false;
        
        IUnlockV13 lock = IUnlockV13(lockAddress);
        return lock.getHasValidKey(keyHolder);
    }

    /**
     * @dev Get key expiration for an address and event lock
     * @param lockAddress The event lock address
     * @param keyHolder The address to check
     */
    function getKeyExpiration(
        address lockAddress,
        address keyHolder
    ) external view returns (uint256) {
        if (!isEventLock[lockAddress]) revert EventNotRegistered();
        
        IUnlockV13 lock = IUnlockV13(lockAddress);
        return lock.keyExpirationTimestampFor(keyHolder);
    }

    /**
     * @dev Emergency pause function
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause function
     */
    function unpause() external onlyOwner {
        _unpause();
    }


    /**
     * @dev Check if a schema is enabled
     * @param schemaUID The schema identifier
     */
    function isSchemaEnabled(bytes32 schemaUID) external view returns (bool) {
        return enabledSchemas[schemaUID];
    }
}
