/**
 * TeeRex delegated attestation submitter (Node.js, ethers v6)
 *
 * What it does
 * - Uses a service wallet (UNLOCK_SERVICE_PRIVATE_KEY) to call
 *   createAttestationByDelegation(...) on the TeeRex contract.
 * - Accepts either a "remixArgs" positional array (from the Admin UI debug panel)
 *   or a structured "payload" object with named fields.
 * - Prints tx hash, receipt status and parses Attested events for UIDs if present.
 *
 * Usage
 * 1) Install: npm i ethers@6
 * 2) Set env:
 *    - RPC_URL=https://sepolia.base.org (or your target network)
 *    - UNLOCK_SERVICE_PRIVATE_KEY=0x...
 * 3) Paste your input into the INPUT constant below (either remixArgs or payload).
 * 4) Run: node scripts/teerex-submit.js
 */

import { ethers, Contract, JsonRpcProvider, Wallet } from 'ethers';

// ------------------------
// Paste your input below
// ------------------------

const INPUT = {
  // Option A: positional args array from Admin UI (remixArgs)
  // remixArgs: [
  //   lockAddress,
  //   schemaUID,
  //   recipient,
  //   data,
  //   [v, r, s],
  //   attester,
  //   deadline,
  //   expirationTime,
  //   revocable,
  //   refUID
  // ],

  // Option B: structured payload
  // payload: {
  //   contractAddress: "0xTeeRex...", // required
  //   lockAddress: "0x...",
  //   schemaUID: "0x...",
  //   recipient: "0x...",
  //   data: "0x...",
  //   signature: { v: 27, r: "0x...", s: "0x..." } | "0x...rsv",
  //   attester: "0x...",
  //   deadline: "17610..." | number,
  //   expirationTime: 0 | "0",
  //   revocable: false,
  //   refUID: "0x00...00"
  // },

  // Uncomment one and paste your values
  remixArgs: [
    "0xd7aFBcE365813F4B5266d92B7798FC0a8E3Ce718",
    "0x16958320594b2f8aa79dac3b6367910768a06ced3cf64f6d7480febd90157fae",
    "0xd443188B33a13A24F63AC3A49d54DB97cf64349A",
    "0x00000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000d7afbce365813f4b5266d92b7798fc0a8e3ce71800000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000068f813aa000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000000000000000000000000000000002466666633376539622d303435392d343230322d623766612d35313634383530333365643100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c48617070792050656f706c65000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000094d6574617665727365000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000065465655265780000000000000000000000000000000000000000000000000000",
    [
      28,
      "0x07b8277579fca19c3640bffb092d88ef9ebffb64dbdad5320382a4135e2f698a",
      "0x232af6647b7e211a096835a98f79aa9a65c2a46aececdecc2490da1c78d05bff"
    ],
    "0xd443188B33a13A24F63AC3A49d54DB97cf64349A",
    "1761092026",
    "0",
    false,
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  ],
  // payload: {},

  // Optional explicit contract address override (if using remixArgs)
  contractAddress: "0xfA1e99323f0C7d8f587e3050a498A3Cf0011aff6"
};

// Minimal ABI for the TeeRex contract
const TEEREX_ABI = [
  {
    type: 'function',
    name: 'createAttestationByDelegation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'lockAddress', type: 'address' },
      { name: 'schemaUID', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
      { name: 'data', type: 'bytes' },
      {
        name: 'signature', type: 'tuple', components: [
          { name: 'v', type: 'uint8' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' },
        ]
      },
      { name: 'attester', type: 'address' },
      { name: 'deadline', type: 'uint64' },
      { name: 'expirationTime', type: 'uint64' },
      { name: 'revocable', type: 'bool' },
      { name: 'refUID', type: 'bytes32' },
    ],
    outputs: [{ name: 'uid', type: 'bytes32' }]
  }
];

function toSigTuple(sig) {
  if (!sig) throw new Error('Missing signature');
  if (typeof sig === 'string') {
    const hex = sig.startsWith('0x') ? sig.slice(2) : sig;
    if (hex.length !== 130) throw new Error('Invalid signature hex length');
    const r = '0x' + hex.slice(0, 64);
    const s = '0x' + hex.slice(64, 128);
    let v = parseInt(hex.slice(128, 130), 16);
    if (v < 27) v += 27;
    return [v, r, s];
  }
  const { v, r, s } = sig;
  if (typeof v !== 'number') throw new Error('signature.v must be a number');
  return [v, r, s];
}

function normalizeBool(x) {
  if (typeof x === 'boolean') return x;
  if (typeof x === 'string') return x.toLowerCase() === 'true';
  return Boolean(x);
}

function toBigIntish(x) {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'number') return BigInt(x);
  if (typeof x === 'string') return BigInt(x);
  throw new Error('Cannot coerce to BigInt: ' + x);
}

function fromRemixArgs(remixArgs) {
  if (!Array.isArray(remixArgs) || remixArgs.length !== 10) {
    throw new Error('remixArgs must be an array of length 10 (see Admin UI debug panel)');
  }
  const [lockAddress, schemaUID, recipient, data, sigTuple, attester, deadline, expirationTime, revocable, refUID] = remixArgs;
  return {
    lockAddress,
    schemaUID,
    recipient,
    data,
    signature: sigTuple,
    attester,
    deadline,
    expirationTime,
    revocable,
    refUID,
  };
}

async function main() {
  const RPC_URL = process.env.RPC_URL || process.env.PRIMARY_RPC_URL || 'https://sepolia.base.org';
  const SERVICE_PK = process.env.UNLOCK_SERVICE_PRIVATE_KEY || process.env.SERVICE_WALLET_PRIVATE_KEY || process.env.SERVICE_PK;
  if (!SERVICE_PK) throw new Error('Missing UNLOCK_SERVICE_PRIVATE_KEY in env');

  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(SERVICE_PK, provider);
  console.log('Service wallet:', await signer.getAddress());

  // Prepare inputs
  let args;
  let contractAddress = INPUT.contractAddress;

  if (INPUT.remixArgs) {
    args = fromRemixArgs(INPUT.remixArgs);
  } else if (INPUT.payload) {
    const p = INPUT.payload;
    if (!p) throw new Error('Provide payload or remixArgs in INPUT');
    args = {
      lockAddress: p.lockAddress,
      schemaUID: p.schemaUID,
      recipient: p.recipient,
      data: p.data,
      signature: p.signature,
      attester: p.attester,
      deadline: p.deadline,
      expirationTime: p.expirationTime ?? 0,
      revocable: p.revocable ?? false,
      refUID: p.refUID ?? '0x' + '0'.repeat(64),
    };
    contractAddress = p.contractAddress || contractAddress;
  } else {
    throw new Error('Paste your remixArgs or payload into INPUT');
  }

  if (!contractAddress) throw new Error('Missing TeeRex contract address (contractAddress)');

  // Normalize
  const sigTuple = Array.isArray(args.signature) ? args.signature : toSigTuple(args.signature);
  const deadline = toBigIntish(args.deadline);
  const expirationTime = toBigIntish(args.expirationTime ?? 0);
  const revocable = normalizeBool(args.revocable);

  const contract = new Contract(contractAddress, TEEREX_ABI, signer);

  console.log('Submitting createAttestationByDelegation...');
  console.log({
    contractAddress,
    lockAddress: args.lockAddress,
    schemaUID: args.schemaUID,
    recipient: args.recipient,
    attester: args.attester,
    deadline: deadline.toString(),
    expirationTime: expirationTime.toString(),
    revocable,
  });

  const tx = await contract.createAttestationByDelegation(
    args.lockAddress,
    args.schemaUID,
    args.recipient,
    args.data,
    sigTuple,
    args.attester,
    deadline,
    expirationTime,
    revocable,
    args.refUID
  );
  console.log('Tx submitted:', tx.hash);
  const receipt = await tx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);

  try {
    const IFACE = new ethers.Interface([
      'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schema)'
    ]);
    const uids = [];
    for (const log of receipt.logs || []) {
      try {
        const parsed = IFACE.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'Attested') {
          const uid = parsed?.args?.uid;
          if (typeof uid === 'string') uids.push(uid);
        }
      } catch {}
    }
    if (uids.length) console.log('Parsed EAS UIDs:', uids);
  } catch {}
}

main().catch((e) => {
  console.error('Error:', e?.message || e);
  process.exit(1);
});



