// Full ABI for BatchAttestation (TeeRex) contract matching contracts/BatchAttestation.sol
export const TEEREX_ABI = [
  // Write functions
  {
    type: 'function',
    name: 'registerEventLock',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'lockAddress', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setSchemaEnabled',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'schemaUID', type: 'bytes32' },
      { name: 'enabled', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setCreatorLock',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'lockAddress', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setAdminLock',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'lockAddress', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setMaxBatchSize',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newMaxSize', type: 'uint256' }],
    outputs: [],
  },
  // EIP712Proxy delegated attestation functions
  {
    type: 'function',
    name: 'attestByDelegation',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'delegatedRequest',
        type: 'tuple',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
          {
            name: 'signature',
            type: 'tuple',
            components: [
              { name: 'v', type: 'uint8' },
              { name: 'r', type: 'bytes32' },
              { name: 's', type: 'bytes32' },
            ],
          },
          { name: 'attester', type: 'address' },
          { name: 'deadline', type: 'uint64' },
        ],
      },
    ],
    outputs: [{ name: 'uid', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'multiAttestByDelegation',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'multiDelegatedRequests',
        type: 'tuple[]',
        components: [
          { name: 'schema', type: 'bytes32' },
          {
            name: 'data',
            type: 'tuple[]',
            components: [
              { name: 'recipient', type: 'address' },
              { name: 'expirationTime', type: 'uint64' },
              { name: 'revocable', type: 'bool' },
              { name: 'refUID', type: 'bytes32' },
              { name: 'data', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
          {
            name: 'signatures',
            type: 'tuple[]',
            components: [
              { name: 'v', type: 'uint8' },
              { name: 'r', type: 'bytes32' },
              { name: 's', type: 'bytes32' },
            ],
          },
          { name: 'attester', type: 'address' },
          { name: 'deadline', type: 'uint64' },
        ],
      },
    ],
    outputs: [{ name: 'uids', type: 'bytes32[]' }],
  },
  { type: 'function', name: 'pause', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'unpause', stateMutability: 'nonpayable', inputs: [], outputs: [] },

  // Read functions
  {
    type: 'function',
    name: 'isSchemaEnabled',
    stateMutability: 'view',
    inputs: [{ name: 'schemaUID', type: 'bytes32' }],
    outputs: [{ name: 'enabled', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'hasValidKeyForEvent',
    stateMutability: 'view',
    inputs: [
      { name: 'lockAddress', type: 'address' },
      { name: 'keyHolder', type: 'address' },
    ],
    outputs: [{ name: 'hasKey', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getKeyExpiration',
    stateMutability: 'view',
    inputs: [
      { name: 'lockAddress', type: 'address' },
      { name: 'keyHolder', type: 'address' },
    ],
    outputs: [{ name: 'expiration', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isEventLock',
    stateMutability: 'view',
    inputs: [{ name: 'lockAddress', type: 'address' }],
    outputs: [{ name: 'registered', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'maxBatchSize',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'size', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'creatorLock',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'addr', type: 'address' }],
  },
  {
    type: 'function',
    name: 'adminLock',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'addr', type: 'address' }],
  },
];

export default TEEREX_ABI;
