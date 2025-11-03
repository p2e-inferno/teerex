# TeeRex Multi-Schema Resolver Implementation Guide

## Overview

This document provides a complete implementation plan for adding EAS Schema Resolver support to TeeRex. The resolver will validate that attesters have valid Unlock Protocol keys for event-gated attestations across multiple schema types.

## Architecture

### Current State
- **TeeRex Contract**: EIP712Proxy for delegated attestations (gas abstraction)
- **Validation**: Done in edge functions + basic on-chain checks
- **Schemas**: No on-chain validation of lock ownership

### Target State
- **TeeRex Contract**: Remains as EIP712Proxy (unchanged)
- **New Resolver Contract**: Standalone SchemaResolver for key validation
- **Validation**: Two-layer approach
  - TeeRex Proxy: Manages delegated attestations, schema enablement
  - Resolver: Validates attester has valid key for specific schemas
- **Schemas**: New schema UIDs registered with resolver address

---

## Problem: Multi-Schema Support

Different schemas have different data structures, but all contain a `lockAddress` field:

```solidity
// Event Attendance Schema
string eventId, address lockAddress, string eventTitle, uint256 timestamp, string location, string platform

// Future Schema Example 1
address lockAddress, string description, uint256 value, bool active

// Future Schema Example 2
uint256 id, address lockAddress, bytes32 hash, address creator
```

**Challenge**: `abi.decode()` requires knowing the exact type structure at compile time.

**Solution**: Schema registry pattern with type-specific decoders.

---

## Solution: TeeRexMultiSchemaResolver

### Design Principles

1. **Separate Contract**: Resolver is standalone, not integrated into TeeRex proxy
2. **Multi-Schema Support**: Registry-based pattern for multiple schema types
3. **Extensible**: Easy to add new schema decoders without redeployment
4. **Read-Only**: Resolver reads state from TeeRex contract
5. **EAS Standard**: Follows official EAS SchemaResolver pattern

### Contract Structure

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {SchemaResolver} from "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";
import {IEAS, Attestation} from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

interface ITeeRex {
    function isEventLock(address lockAddress) external view returns (bool);
}

interface IUnlockV13 {
    function getHasValidKey(address _keyOwner) external view returns (bool);
}

contract TeeRexMultiSchemaResolver is SchemaResolver {
    // Schema types supported by this resolver
    enum SchemaType {
        EVENT_ATTENDANCE,      // string eventId, address lockAddress, string eventTitle, ...
        FUTURE_SCHEMA_1,       // Reserved for future use
        FUTURE_SCHEMA_2        // Reserved for future use
    }

    struct SchemaConfig {
        SchemaType schemaType;
        bool requiresKeyValidation;
        bool enabled;
    }

    // State
    ITeeRex public teeRexContract;
    address public admin;
    mapping(bytes32 => SchemaConfig) public registeredSchemas;

    // Events
    event SchemaRegistered(bytes32 indexed schemaUID, SchemaType schemaType, bool requiresKeyValidation);
    event SchemaUpdated(bytes32 indexed schemaUID, SchemaConfig config);
    event TeeRexContractUpdated(address indexed newTeeRex);

    // Errors
    error NotAdmin();
    error SchemaNotRegistered();
    error InvalidLockAddress();
    error LockNotRegistered();
    error NoValidKey();
    error UnsupportedSchemaType();

    constructor(IEAS eas, ITeeRex _teeRexContract) SchemaResolver(eas) {
        teeRexContract = _teeRexContract;
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    function registerSchema(
        bytes32 schemaUID,
        SchemaType schemaType,
        bool requiresKeyValidation
    ) external onlyAdmin {
        registeredSchemas[schemaUID] = SchemaConfig({
            schemaType: schemaType,
            requiresKeyValidation: requiresKeyValidation,
            enabled: true
        });
        emit SchemaRegistered(schemaUID, schemaType, requiresKeyValidation);
    }

    function updateSchemaConfig(
        bytes32 schemaUID,
        SchemaConfig calldata config
    ) external onlyAdmin {
        registeredSchemas[schemaUID] = config;
        emit SchemaUpdated(schemaUID, config);
    }

    function setTeeRexContract(ITeeRex newTeeRex) external onlyAdmin {
        teeRexContract = newTeeRex;
        emit TeeRexContractUpdated(address(newTeeRex));
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        admin = newAdmin;
    }

    // ============================================
    // RESOLVER LOGIC (Called by EAS)
    // ============================================

    function onAttest(
        Attestation calldata attestation,
        uint256 /*value*/
    ) internal override returns (bool) {
        SchemaConfig memory config = registeredSchemas[attestation.schema];

        // Check schema is registered
        if (!config.enabled) revert SchemaNotRegistered();

        // Skip validation if not required for this schema
        if (!config.requiresKeyValidation) {
            return true;
        }

        // Extract lockAddress based on schema type
        address lockAddress = _extractLockAddress(attestation.schema, attestation.data);

        // Validate lock address
        if (lockAddress == address(0)) revert InvalidLockAddress();
        if (!teeRexContract.isEventLock(lockAddress)) revert LockNotRegistered();

        // Validate attester has valid key
        IUnlockV13 lock = IUnlockV13(lockAddress);
        if (!lock.getHasValidKey(attestation.attester)) revert NoValidKey();

        return true;
    }

    function onRevoke(
        Attestation calldata /*attestation*/,
        uint256 /*value*/
    ) internal pure override returns (bool) {
        // Allow all revocations (no special logic needed)
        return true;
    }

    // ============================================
    // SCHEMA DECODERS
    // ============================================

    function _extractLockAddress(
        bytes32 schemaUID,
        bytes memory data
    ) internal view returns (address) {
        SchemaConfig memory config = registeredSchemas[schemaUID];

        if (config.schemaType == SchemaType.EVENT_ATTENDANCE) {
            return _decodeEventAttendance(data);
        } else if (config.schemaType == SchemaType.FUTURE_SCHEMA_1) {
            return _decodeFutureSchema1(data);
        } else if (config.schemaType == SchemaType.FUTURE_SCHEMA_2) {
            return _decodeFutureSchema2(data);
        }

        revert UnsupportedSchemaType();
    }

    /// @dev Decode Event Attendance schema
    /// Schema: string eventId, address lockAddress, string eventTitle, uint256 timestamp, string location, string platform
    function _decodeEventAttendance(bytes memory data)
        internal
        pure
        returns (address lockAddress)
    {
        (, lockAddress, , , , ) = abi.decode(
            data,
            (string, address, string, uint256, string, string)
        );
    }

    /// @dev Placeholder for future schema type 1
    function _decodeFutureSchema1(bytes memory data)
        internal
        pure
        returns (address lockAddress)
    {
        // Example: address lockAddress, string description, uint256 value
        (lockAddress, , ) = abi.decode(data, (address, string, uint256));
    }

    /// @dev Placeholder for future schema type 2
    function _decodeFutureSchema2(bytes memory data)
        internal
        pure
        returns (address lockAddress)
    {
        // Example: uint256 id, address lockAddress, bytes32 hash
        (, lockAddress, ) = abi.decode(data, (uint256, address, bytes32));
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    function isSchemaSupported(bytes32 schemaUID) external view returns (bool) {
        return registeredSchemas[schemaUID].enabled;
    }

    function getSchemaConfig(bytes32 schemaUID) external view returns (SchemaConfig memory) {
        return registeredSchemas[schemaUID];
    }
}
```

---

## Implementation Steps

### Step 1: Update TeeRex Contract (Optional)

Add a public getter if `isEventLock` is not already public:

```solidity
// In TeeRex.sol

/// @dev Public getter for resolver to check if lock is registered
function isLockRegistered(address lockAddress) external view returns (bool) {
    return isEventLock[lockAddress];
}
```

**Note**: If `isEventLock` is already a public mapping, this getter is not needed.

### Step 2: Create Resolver Contract

Create `contracts/TeeRexMultiSchemaResolver.sol` with the complete implementation above.

### Step 3: Create Deployment Script

Create `scripts/deploy-resolver.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  console.log("Deploying TeeRexMultiSchemaResolver...");

  // Get deployment addresses
  const EAS_ADDRESS = process.env.EAS_ADDRESS || "0x4200000000000000000000000000000000000021"; // Base
  const TEEREX_ADDRESS = process.env.VITE_TEEREX_ADDRESS_BASE_SEPOLIA;

  if (!TEEREX_ADDRESS) {
    throw new Error("TEEREX_ADDRESS not found in environment");
  }

  // Deploy resolver
  const TeeRexMultiSchemaResolver = await ethers.getContractFactory("TeeRexMultiSchemaResolver");
  const resolver = await TeeRexMultiSchemaResolver.deploy(EAS_ADDRESS, TEEREX_ADDRESS);
  await resolver.deployed();

  console.log("✅ TeeRexMultiSchemaResolver deployed to:", resolver.address);

  // Register Event Attendance schema (example)
  const EVENT_ATTENDANCE_SCHEMA_UID = process.env.EVENT_ATTENDANCE_SCHEMA_UID;
  if (EVENT_ATTENDANCE_SCHEMA_UID) {
    console.log("Registering Event Attendance schema...");
    const tx = await resolver.registerSchema(
      EVENT_ATTENDANCE_SCHEMA_UID,
      0, // SchemaType.EVENT_ATTENDANCE
      true // requiresKeyValidation
    );
    await tx.wait();
    console.log("✅ Schema registered");
  }

  console.log("\n📝 Next steps:");
  console.log("1. Add resolver address to .env:");
  console.log(`   TEEREX_RESOLVER_ADDRESS_BASE_SEPOLIA=${resolver.address}`);
  console.log("2. Register new schema in EAS SchemaRegistry with this resolver address");
  console.log("3. Update frontend schema constants");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

### Step 4: Register Schema with Resolver in EAS

Create `scripts/register-schema-with-resolver.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  console.log("Registering new schema with resolver in EAS SchemaRegistry...");

  const SCHEMA_REGISTRY_ADDRESS = "0x4200000000000000000000000000000000000020"; // Base
  const RESOLVER_ADDRESS = process.env.TEEREX_RESOLVER_ADDRESS_BASE_SEPOLIA;

  if (!RESOLVER_ADDRESS) {
    throw new Error("TEEREX_RESOLVER_ADDRESS_BASE_SEPOLIA not found in environment");
  }

  // Schema definition
  const schema = "string eventId,address lockAddress,string eventTitle,uint256 timestamp,string location,string platform";
  const revocable = true;

  // Get SchemaRegistry contract
  const schemaRegistry = await ethers.getContractAt(
    "ISchemaRegistry",
    SCHEMA_REGISTRY_ADDRESS
  );

  // Register schema
  const tx = await schemaRegistry.register(schema, RESOLVER_ADDRESS, revocable);
  const receipt = await tx.wait();

  // Parse Registered event to get schema UID
  const event = receipt.events?.find((e: any) => e.event === "Registered");
  const schemaUID = event?.args?.uid;

  console.log("✅ Schema registered with resolver!");
  console.log("Schema UID:", schemaUID);
  console.log("Resolver:", RESOLVER_ADDRESS);
  console.log("\n📝 Add to .env:");
  console.log(`EVENT_ATTENDANCE_SCHEMA_UID_V2=${schemaUID}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

### Step 5: Frontend Integration

Create `src/lib/config/schema-config.ts`:

```typescript
export const SCHEMA_UIDS = {
  // Old schemas (no resolver validation)
  EVENT_ATTENDANCE_V1: '0x16958320594b2f8aa79dac3b6367910768a06ced3cf64f6d7480febd90157fae',

  // New schemas (with resolver validation)
  EVENT_ATTENDANCE_V2: import.meta.env.VITE_EVENT_ATTENDANCE_SCHEMA_UID_V2 || '',
} as const;

export const RESOLVER_ADDRESSES = {
  84532: import.meta.env.VITE_TEEREX_RESOLVER_ADDRESS_BASE_SEPOLIA || '', // Base Sepolia
  8453: import.meta.env.VITE_TEEREX_RESOLVER_ADDRESS_BASE_MAINNET || '',  // Base Mainnet
} as const;

export const DEFAULT_SCHEMA_VERSION = 'V2' as const;
```

Update `src/hooks/useAttestationEncoding.ts`:

```typescript
import { SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { SCHEMA_UIDS, DEFAULT_SCHEMA_VERSION } from '@/lib/config/schema-config';

export const useAttestationEncoding = () => {
  const encodeEventAttendanceData = (
    eventId: string,
    lockAddress: string,
    eventTitle: string,
    timestamp: number = Math.floor(Date.now() / 1000),
    location: string = 'Metaverse',
    platform: string = 'TeeRex',
    schemaVersion: 'V1' | 'V2' = DEFAULT_SCHEMA_VERSION
  ): { data: string; schemaUID: string } => {
    const schema = 'string eventId,address lockAddress,string eventTitle,uint256 timestamp,string location,string platform';
    const encoder = new SchemaEncoder(schema);

    const data = encoder.encodeData([
      { name: 'eventId', type: 'string', value: eventId },
      { name: 'lockAddress', type: 'address', value: lockAddress },
      { name: 'eventTitle', type: 'string', value: eventTitle },
      { name: 'timestamp', type: 'uint256', value: BigInt(timestamp) },
      { name: 'location', type: 'string', value: location },
      { name: 'platform', type: 'string', value: platform },
    ]);

    const schemaUID = schemaVersion === 'V2'
      ? SCHEMA_UIDS.EVENT_ATTENDANCE_V2
      : SCHEMA_UIDS.EVENT_ATTENDANCE_V1;

    return { data, schemaUID };
  };

  return {
    encodeEventAttendanceData,
  };
};
```

### Step 6: Update Edge Function

Update `supabase/functions/attest-by-delegation/index.ts` to support schema version:

```typescript
// Allow schemaUid to be passed from frontend
const schemaUid: string | undefined = body.schemaUid;

// Use the schemaUid from request (could be V1 or V2)
// V2 schemas will trigger resolver validation automatically via EAS
```

### Step 7: Testing

Create `test/TeeRexMultiSchemaResolver.test.ts`:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";

describe("TeeRexMultiSchemaResolver", function () {
  let resolver, teeRex, eas, mockLock;
  let owner, attester, recipient;

  beforeEach(async function () {
    [owner, attester, recipient] = await ethers.getSigners();

    // Deploy mocks
    const MockEAS = await ethers.getContractFactory("MockEAS");
    eas = await MockEAS.deploy();

    const MockTeeRex = await ethers.getContractFactory("MockTeeRex");
    teeRex = await MockTeeRex.deploy();

    const MockUnlock = await ethers.getContractFactory("MockUnlockV13");
    mockLock = await MockUnlock.deploy();

    // Deploy resolver
    const Resolver = await ethers.getContractFactory("TeeRexMultiSchemaResolver");
    resolver = await Resolver.deploy(eas.address, teeRex.address);

    // Setup: Register lock in TeeRex
    await teeRex.setEventLock(mockLock.address, true);
  });

  it("should validate attester with valid key", async function () {
    const schemaUID = ethers.utils.formatBytes32String("test");

    // Register schema
    await resolver.registerSchema(schemaUID, 0, true); // EVENT_ATTENDANCE type

    // Setup: Attester has valid key
    await mockLock.setHasValidKey(attester.address, true);

    // Encode attestation data
    const data = ethers.utils.defaultAbiCoder.encode(
      ["string", "address", "string", "uint256", "string", "string"],
      ["event-1", mockLock.address, "Test Event", 1234567890, "Virtual", "TeeRex"]
    );

    // Create attestation
    const attestation = {
      uid: ethers.utils.formatBytes32String("att-1"),
      schema: schemaUID,
      time: Math.floor(Date.now() / 1000),
      expirationTime: 0,
      revocationTime: 0,
      refUID: ethers.constants.HashZero,
      recipient: recipient.address,
      attester: attester.address,
      revocable: true,
      data: data,
    };

    // Should succeed
    const result = await resolver.connect(eas.address).callStatic.attest(attestation, 0);
    expect(result).to.be.true;
  });

  it("should reject attester without valid key", async function () {
    // Same setup but attester has NO key
    await mockLock.setHasValidKey(attester.address, false);

    // Should revert with NoValidKey
    await expect(
      resolver.connect(eas.address).attest(attestation, 0)
    ).to.be.revertedWith("NoValidKey");
  });

  it("should reject unregistered lock address", async function () {
    const unregisteredLock = "0x0000000000000000000000000000000000000001";

    // Encode data with unregistered lock
    const data = ethers.utils.defaultAbiCoder.encode(
      ["string", "address", "string", "uint256", "string", "string"],
      ["event-1", unregisteredLock, "Test Event", 1234567890, "Virtual", "TeeRex"]
    );

    // Should revert with LockNotRegistered
    await expect(
      resolver.connect(eas.address).attest(attestation, 0)
    ).to.be.revertedWith("LockNotRegistered");
  });
});
```

---

## Adding New Schema Types

### Example: Adding a "Workshop Certificate" Schema

**1. Define the schema structure**:
```
address lockAddress, string workshopName, uint256 completionDate, bytes32 certificateHash
```

**2. Add to SchemaType enum** (requires contract upgrade):
```solidity
enum SchemaType {
    EVENT_ATTENDANCE,
    WORKSHOP_CERTIFICATE  // New type
}
```

**3. Add decoder function**:
```solidity
function _decodeWorkshopCertificate(bytes memory data)
    internal
    pure
    returns (address lockAddress)
{
    (lockAddress, , , ) = abi.decode(data, (address, string, uint256, bytes32));
}
```

**4. Update router**:
```solidity
function _extractLockAddress(bytes32 schemaUID, bytes memory data) {
    // ...existing code...
    } else if (config.schemaType == SchemaType.WORKSHOP_CERTIFICATE) {
        return _decodeWorkshopCertificate(data);
    }
    // ...
}
```

**5. Register in EAS SchemaRegistry**:
```bash
# Deploy new schema with resolver address
npx hardhat run scripts/register-workshop-schema.ts
```

**6. Register in Resolver**:
```typescript
await resolver.registerSchema(
  workshopSchemaUID,
  SchemaType.WORKSHOP_CERTIFICATE,
  true // requires key validation
);
```

---

## Deployment Checklist

### Base Sepolia (Testnet)

- [ ] Deploy TeeRexMultiSchemaResolver
- [ ] Register Event Attendance V2 schema in EAS SchemaRegistry with resolver
- [ ] Register schema UID in resolver contract
- [ ] Add resolver address to `.env`: `VITE_TEEREX_RESOLVER_ADDRESS_BASE_SEPOLIA`
- [ ] Add schema UID to `.env`: `VITE_EVENT_ATTENDANCE_SCHEMA_UID_V2`
- [ ] Update frontend to use V2 schema by default
- [ ] Test full attestation flow
- [ ] Verify on-chain: attester without key should fail
- [ ] Verify on-chain: attester with key should succeed

### Base Mainnet (Production)

- [ ] Deploy TeeRexMultiSchemaResolver
- [ ] Register schema in EAS SchemaRegistry
- [ ] Register schema UID in resolver
- [ ] Add addresses to `.env`
- [ ] Update frontend production config
- [ ] Test on mainnet with small amount
- [ ] Monitor gas costs
- [ ] Document schema UIDs publicly

---

## Gas Cost Analysis

### Without Resolver (Current)
- Attestation: ~150k gas
- Validation: Off-chain (free)

### With Resolver
- Attestation: ~200-250k gas (+50-100k for resolver)
- Validation: On-chain (secure)

**Breakdown of resolver costs**:
- Schema lookup: ~2.1k gas
- Lock address decode: ~5-10k gas (depending on schema complexity)
- TeeRex.isEventLock read: ~2.1k gas
- Unlock.getHasValidKey read: ~30-40k gas (external contract call)
- Resolver overhead: ~10k gas

**Total additional cost**: ~50-60k gas per attestation = ~$0.001-0.002 at 1 gwei

---

## Security Considerations

### Resolver Security
✅ Only EAS can call `onAttest()` (via `onlyEAS` modifier from SchemaResolver base)
✅ Admin functions protected by `onlyAdmin` modifier
✅ Stateless validation (no storage manipulation)
✅ Read-only access to TeeRex state

### Attack Vectors

**1. Malicious Schema Registration**
- Risk: Admin registers wrong decoder for schema
- Mitigation: Multi-sig admin wallet, governance process

**2. TeeRex Contract Replacement**
- Risk: Admin points to malicious TeeRex
- Mitigation: Time-lock on admin functions, community oversight

**3. Lock Address Manipulation**
- Risk: Attester encodes fake lock address
- Mitigation: Resolver validates lock is registered in TeeRex

**4. Key Expiration Race**
- Risk: Key expires between signature and execution
- Mitigation: Deadline in signature prevents long delays

---

## Migration Strategy

### For Existing Attestations
- **No action needed** - existing schemas without resolvers continue to work
- Old attestations remain valid

### For New Attestations
- **Option 1**: Default to V2 (with resolver)
  - Better security, on-chain validation
  - Higher gas cost

- **Option 2**: User choice
  - Let users select V1 (no resolver) or V2 (with resolver)
  - Add UI toggle in attestation flow

### Recommended Approach
Start with V2 as default for new events, keep V1 for backward compatibility.

---

## Monitoring & Maintenance

### Metrics to Track
- Attestations created per schema
- Resolver validation failures
- Gas costs per attestation
- Schema registration requests

### Maintenance Tasks
- Add new schema decoders as needed
- Monitor for failed validations
- Update TeeRex reference if contract upgraded
- Transfer admin to multi-sig or DAO

---

## Future Enhancements

### Potential Features
1. **Dynamic Schema Registry**: Register schemas without contract upgrade
2. **Generic Decoder**: Use assembly to extract lock address by position
3. **Multi-Lock Support**: Validate attester has key to ANY of multiple locks
4. **Timestamp Validation**: Check attestation timestamp against event dates
5. **Resolver Marketplace**: Multiple resolver implementations for different use cases
6. **Gasless Resolver Calls**: Service wallet covers resolver gas too

---

## References

- [EAS Documentation](https://docs.attest.org/)
- [EAS Contracts Repository](https://github.com/ethereum-attestation-service/eas-contracts)
- [SchemaResolver Base Contract](https://github.com/ethereum-attestation-service/eas-contracts/blob/master/contracts/resolver/SchemaResolver.sol)
- [Resolver Examples](https://github.com/ethereum-attestation-service/eas-contracts/tree/master/contracts/resolver/examples)
- [Gitcoin Passport Decoder Example](https://github.com/gitcoinco/eas-proxy/blob/main/contracts/GitcoinPassportDecoder.sol)

---

## Support

For questions or issues with resolver implementation:
1. Check EAS documentation
2. Review resolver examples in eas-contracts
3. Test on Base Sepolia testnet first
4. Monitor gas costs before mainnet deployment

---

**Last Updated**: 2025-10-30
**Status**: Implementation Guide
**Next Steps**: Deploy resolver to testnet and test full flow
