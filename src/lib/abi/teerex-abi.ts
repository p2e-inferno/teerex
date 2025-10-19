// Minimal ABI for BatchAttestation/ TeeRex contract based on guide
// Extend as the on-chain contract evolves
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
  {
    type: 'function',
    name: 'createBatchAttestationsByDelegation',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'requests',
        type: 'tuple[]',
        components: [
          { name: 'schemaUID', type: 'bytes32' },
          { name: 'recipient', type: 'address' },
          { name: 'data', type: 'bytes' },
          { name: 'deadline', type: 'uint256' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'uids', type: 'bytes32[]' }],
  },
  {
    type: 'function',
    name: 'createAttestationByDelegation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'schemaUID', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'uid', type: 'bytes32' }],
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

