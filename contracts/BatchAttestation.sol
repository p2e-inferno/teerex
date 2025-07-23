// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

interface IUnlockV13 {
    function getHasValidKey(address _keyOwner) external view returns (bool);
    function balanceOf(address _keyOwner) external view returns (uint256);
    function keyExpirationTimestampFor(address _keyOwner) external view returns (uint256);
}

interface IEAS {
    function attest(AttestationRequest calldata request) external returns (bytes32);
    function multiAttest(MultiAttestationRequest[] calldata multiRequests) external returns (bytes32[] memory);
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
    
    // Event ID => Lock Address mapping
    mapping(string => address) public eventLocks;
    
    // Schema UID => Enabled status
    mapping(bytes32 => bool) public enabledSchemas;
    
    // Admin addresses that can manage events and schemas
    mapping(address => bool) public admins;
    
    // Maximum batch size to prevent gas issues
    uint256 public maxBatchSize = 50;
    
    event EventLockRegistered(string indexed eventId, address indexed lockAddress);
    event SchemaEnabled(bytes32 indexed schemaUID, bool enabled);
    event BatchAttestationCreated(
        string indexed eventId,
        bytes32 indexed schemaUID,
        address indexed attester,
        uint256 attestationCount
    );
    event AdminUpdated(address indexed admin, bool enabled);
    event MaxBatchSizeUpdated(uint256 newMaxSize);

    modifier onlyAdmin() {
        require(admins[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    modifier onlyKeyHolder(string memory eventId) {
        address lockAddress = eventLocks[eventId];
        require(lockAddress != address(0), "Event not registered");
        
        IUnlockV13 lock = IUnlockV13(lockAddress);
        require(lock.getHasValidKey(msg.sender), "No valid key for this event");
        require(lock.keyExpirationTimestampFor(msg.sender) > block.timestamp, "Key expired");
        _;
    }

    modifier validSchema(bytes32 schemaUID) {
        require(enabledSchemas[schemaUID], "Schema not enabled");
        _;
    }

    constructor(address _eas, address _initialOwner) {
        require(_eas != address(0), "Invalid EAS address");
        eas = IEAS(_eas);
        _transferOwnership(_initialOwner);
        admins[_initialOwner] = true;
    }

    /**
     * @dev Register a lock address for an event
     * @param eventId The event identifier
     * @param lockAddress The Unlock Protocol lock address
     */
    function registerEventLock(
        string memory eventId,
        address lockAddress
    ) external onlyAdmin {
        require(bytes(eventId).length > 0, "Invalid event ID");
        require(lockAddress != address(0), "Invalid lock address");
        
        eventLocks[eventId] = lockAddress;
        emit EventLockRegistered(eventId, lockAddress);
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
     * @dev Set admin status for an address
     * @param admin The address to update
     * @param enabled Whether the address should be an admin
     */
    function setAdmin(address admin, bool enabled) external onlyOwner {
        require(admin != address(0), "Invalid admin address");
        admins[admin] = enabled;
        emit AdminUpdated(admin, enabled);
    }

    /**
     * @dev Update maximum batch size
     * @param newMaxSize The new maximum batch size
     */
    function setMaxBatchSize(uint256 newMaxSize) external onlyAdmin {
        require(newMaxSize > 0 && newMaxSize <= 100, "Invalid batch size");
        maxBatchSize = newMaxSize;
        emit MaxBatchSizeUpdated(newMaxSize);
    }

    /**
     * @dev Create batch attestations for event attendees
     * @param eventId The event identifier
     * @param schemaUID The schema to use for attestations
     * @param attestations Array of attestation data
     * @param revocable Whether attestations can be revoked
     */
    function createBatchAttestations(
        string memory eventId,
        bytes32 schemaUID,
        BatchAttestationData[] memory attestations,
        bool revocable
    ) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyKeyHolder(eventId)
        validSchema(schemaUID)
        returns (bytes32[] memory)
    {
        require(attestations.length > 0, "No attestations provided");
        require(attestations.length <= maxBatchSize, "Batch size too large");

        // Prepare attestation requests
        AttestationRequestData[] memory attestationData = new AttestationRequestData[](attestations.length);
        
        for (uint256 i = 0; i < attestations.length; i++) {
            require(attestations[i].recipient != address(0), "Invalid recipient");
            
            attestationData[i] = AttestationRequestData({
                recipient: attestations[i].recipient,
                expirationTime: attestations[i].expirationTime,
                revocable: revocable,
                refUID: attestations[i].refUID,
                data: attestations[i].data,
                value: 0
            });
        }

        // Create multi-attestation request
        MultiAttestationRequest[] memory multiRequests = new MultiAttestationRequest[](1);
        multiRequests[0] = MultiAttestationRequest({
            schema: schemaUID,
            data: attestationData
        });

        // Submit to EAS
        bytes32[] memory attestationUIDs = eas.multiAttest(multiRequests);

        emit BatchAttestationCreated(eventId, schemaUID, msg.sender, attestations.length);
        
        return attestationUIDs;
    }

    /**
     * @dev Create a single attestation
     * @param eventId The event identifier
     * @param schemaUID The schema to use
     * @param recipient The attestation recipient
     * @param data The attestation data
     * @param expirationTime When the attestation expires
     * @param revocable Whether the attestation can be revoked
     * @param refUID Reference to another attestation
     */
    function createAttestation(
        string memory eventId,
        bytes32 schemaUID,
        address recipient,
        bytes memory data,
        uint64 expirationTime,
        bool revocable,
        bytes32 refUID
    ) 
        external 
        nonReentrant 
        whenNotPaused 
        onlyKeyHolder(eventId)
        validSchema(schemaUID)
        returns (bytes32)
    {
        require(recipient != address(0), "Invalid recipient");

        AttestationRequest memory request = AttestationRequest({
            schema: schemaUID,
            data: AttestationRequestData({
                recipient: recipient,
                expirationTime: expirationTime,
                revocable: revocable,
                refUID: refUID,
                data: data,
                value: 0
            })
        });

        bytes32 attestationUID = eas.attest(request);

        emit BatchAttestationCreated(eventId, schemaUID, msg.sender, 1);
        
        return attestationUID;
    }

    /**
     * @dev Check if an address has a valid key for an event
     * @param eventId The event identifier
     * @param keyHolder The address to check
     */
    function hasValidKeyForEvent(
        string memory eventId,
        address keyHolder
    ) external view returns (bool) {
        address lockAddress = eventLocks[eventId];
        if (lockAddress == address(0)) return false;
        
        IUnlockV13 lock = IUnlockV13(lockAddress);
        return lock.getHasValidKey(keyHolder) && 
               lock.keyExpirationTimestampFor(keyHolder) > block.timestamp;
    }

    /**
     * @dev Get key expiration for an address and event
     * @param eventId The event identifier
     * @param keyHolder The address to check
     */
    function getKeyExpiration(
        string memory eventId,
        address keyHolder
    ) external view returns (uint256) {
        address lockAddress = eventLocks[eventId];
        require(lockAddress != address(0), "Event not registered");
        
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
     * @dev Get the lock address for an event
     * @param eventId The event identifier
     */
    function getEventLock(string memory eventId) external view returns (address) {
        return eventLocks[eventId];
    }

    /**
     * @dev Check if a schema is enabled
     * @param schemaUID The schema identifier
     */
    function isSchemaEnabled(bytes32 schemaUID) external view returns (bool) {
        return enabledSchemas[schemaUID];
    }
}