/**
 * EAS delegated attestation submitter (Node.js, ethers v6)
 *
 * Purpose
 * - Submit a delegated attestation directly to the EAS contract via
 *   attestByDelegation(request).
 * - Uses a service/relayer wallet (UNLOCK_SERVICE_PRIVATE_KEY) to pay gas.
 * - Accepts the same values you see in the Admin UI debug panel so you can
 *   compare behavior vs the TeeRex path.
 *
 * Usage
 * 1) npm i ethers@6
 * 2) env:
 *    - RPC_URL=https://sepolia.base.org (or your target network)
 *    - UNLOCK_SERVICE_PRIVATE_KEY=0x...
 *    - EAS_ADDRESS=0x4200000000000000000000000000000000000021 (optional; default)
 * 3) Paste your input into the INPUT constant below
 * 4) node scripts/eas-submit.js
 */

import { ethers, Contract, JsonRpcProvider, Wallet } from 'ethers';

// ------------------------
// Paste your input below
// ------------------------

const INPUT = {
  // Option A: Provide values as they appear in Admin UI (structured)
  // payload: {
  //   schemaUID: "0x...",
  //   recipient: "0x...",
  //   data: "0x...", // encoded EAS data bytes
  //   expirationTime: 0 | "0",
  //   revocable: false,
  //   refUID: "0x00...00",
  //   value: 0 | "0", // usually 0
  //   signature: { v: 27, r: "0x...", s: "0x..." } | "0x...rsv",
  //   attester: "0x...", // signer of the typed data
  //   deadline: "17610..." | number
  // },

  // Option B: Provide a Remix-style args from Admin (positional) and we map it
  // remixArgs: [
  //   "0xd7aFBcE365813F4B5266d92B7798FC0a8E3Ce718",
  //   "0x16958320594b2f8aa79dac3b6367910768a06ced3cf64f6d7480febd90157fae",
  //   "0xd443188B33a13A24F63AC3A49d54DB97cf64349A",
  //   "0x00000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000d7afbce365813f4b5266d92b7798fc0a8e3ce71800000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000068f81c8a000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000000000000000000000000000000002466666633376539622d303435392d343230322d623766612d35313634383530333365643100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c48617070792050656f706c65000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000094d6574617665727365000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000065465655265780000000000000000000000000000000000000000000000000000",
  //   [
  //     27,
  //     "0xc96c9239db9b846f1a6ae0beb19b48ed9da9dbf5d5ec31dbd06ba7119e29f0b0",
  //     "0x744dc09df5bebce75ddb1c8151fad852fb3a668797c18ad79256c00ef50fc8f3"
  //   ],
  //   "0xd443188B33a13A24F63AC3A49d54DB97cf64349A",
  //   "1761094298",
  //   "0",
  //   false,
  //   "0x0000000000000000000000000000000000000000000000000000000000000000"
  // ],
  //   attester,
  //   deadline,
  //   expirationTime,
  //   revocable,
  //   refUID
  // ],

  payload: {"schemaUID":"0x16958320594b2f8aa79dac3b6367910768a06ced3cf64f6d7480febd90157fae","recipient":"0xd443188B33a13A24F63AC3A49d54DB97cf64349A","data":"0x00000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000d7afbce365813f4b5266d92b7798fc0a8e3ce71800000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000068f813aa000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000000000000000000000000000000002466666633376539622d303435392d343230322d623766612d35313634383530333365643100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c48617070792050656f706c65000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000094d6574617665727365000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000065465655265780000000000000000000000000000000000000000000000000000","signature":{"v":28,"r":"0x07b8277579fca19c3640bffb092d88ef9ebffb64dbdad5320382a4135e2f698a","s":"0x232af6647b7e211a096835a98f79aa9a65c2a46aececdecc2490da1c78d05bff"},"attester":"0xd443188B33a13A24F63AC3A49d54DB97cf64349A","deadline":"1761092026","expirationTime":"0","revocable":false,"refUID":"0x0000000000000000000000000000000000000000000000000000000000000000","value":"0"},
  remixArgs: [
    "0xd7aFBcE365813F4B5266d92B7798FC0a8E3Ce718",
    "0x16958320594b2f8aa79dac3b6367910768a06ced3cf64f6d7480febd90157fae",
    "0xd443188B33a13A24F63AC3A49d54DB97cf64349A",
    "0x00000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000d7afbce365813f4b5266d92b7798fc0a8e3ce71800000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000068f81c8a000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000001a0000000000000000000000000000000000000000000000000000000000000002466666633376539622d303435392d343230322d623766612d35313634383530333365643100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c48617070792050656f706c65000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000094d6574617665727365000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000065465655265780000000000000000000000000000000000000000000000000000",
    [
      27,
      "0xc96c9239db9b846f1a6ae0beb19b48ed9da9dbf5d5ec31dbd06ba7119e29f0b0",
      "0x744dc09df5bebce75ddb1c8151fad852fb3a668797c18ad79256c00ef50fc8f3"
    ],
    "0xd443188B33a13A24F63AC3A49d54DB97cf64349A",
    "1761094298",
    "0",
    false,
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  ]
};

// Minimal EAS ABI for fallback when SDK import fails
const EAS_ABI = [
  {
    type: 'function',
    name: 'attestByDelegation',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'request',
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

function toSigHex(sig) {
  if (!sig) throw new Error('Missing signature');
  if (typeof sig === 'string') return sig;
  const [v, r, s] = toSigTuple(sig);
  // ethers v6 Signature to hex (r || s || v)
  const vHex = '0x' + v.toString(16).padStart(2, '0');
  return ethers.concat([r, s, vHex]);
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
    throw new Error('remixArgs must be length 10 from Admin UI');
  }
  const [/* lockAddress (ignore) */ , schemaUID, recipient, data, sigTuple, attester, deadline, expirationTime, revocable, refUID] = remixArgs;
  return {
    schemaUID,
    recipient,
    data,
    signature: sigTuple,
    attester,
    deadline,
    expirationTime,
    revocable,
    refUID,
    value: 0,
  };
}

async function main() {
  const RPC_URL = process.env.RPC_URL || process.env.PRIMARY_RPC_URL || 'https://sepolia.base.org';
  const SERVICE_PK = process.env.UNLOCK_SERVICE_PRIVATE_KEY || process.env.SERVICE_WALLET_PRIVATE_KEY || process.env.SERVICE_PK;
  if (!SERVICE_PK) throw new Error('Missing UNLOCK_SERVICE_PRIVATE_KEY');
  const EAS_ADDRESS = process.env.EAS_ADDRESS || '0x4200000000000000000000000000000000000021';

  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(SERVICE_PK, provider);
  console.log('Service wallet:', await signer.getAddress());

  let p;
  if (INPUT.payload) {
    p = INPUT.payload;
  } else if (INPUT.remixArgs) {
    p = fromRemixArgs(INPUT.remixArgs);
  } else {
    throw new Error('Provide payload or remixArgs in INPUT');
  }

  const sigTuple = Array.isArray(p.signature) ? p.signature : toSigTuple(p.signature);
  const deadline = toBigIntish(p.deadline);
  const expirationTime = toBigIntish(p.expirationTime ?? 0);
  const revocable = normalizeBool(p.revocable);
  const value = toBigIntish(p.value ?? 0);

  // Try to use EAS SDK first; fallback to ABI if import fails
  let useSdk = false;
  let EASClass;
  try {
    ({ EAS: EASClass } = await import('@ethereum-attestation-service/eas-sdk'));
    useSdk = true;
  } catch (e) {
    console.warn('EAS SDK import failed; falling back to ABI:', (e?.message || e));
  }

  const request = {
    schema: p.schemaUID,
    data: {
      recipient: p.recipient,
      expirationTime,
      revocable,
      refUID: p.refUID ?? '0x' + '0'.repeat(64),
      data: p.data,
      value,
    },
    signature: toSigHex(p.signature),
    attester: p.attester,
    deadline,
  };

  if (useSdk) {
    const eas = new EASClass(EAS_ADDRESS);
    eas.connect(signer);
    console.log('Submitting EAS.attestByDelegation via SDK with request:');
    console.log({
      schema: request.schema,
      recipient: request.data.recipient,
      expirationTime: request.data.expirationTime.toString(),
      revocable: request.data.revocable,
      refUID: request.data.refUID,
      attester: request.attester,
      deadline: request.deadline.toString(),
    });
    const tx = await eas.attestByDelegation(request);
    const uid = await tx.wait();
    console.log('New attestation UID:', uid);
    console.log('Transaction receipt:', tx.receipt);
  } else {
    console.log('Submitting EAS.attestByDelegation via direct ABI with request:');
    console.log({
      schema: request.schema,
      recipient: request.data.recipient,
      expirationTime: request.data.expirationTime.toString(),
      revocable: request.data.revocable,
      refUID: request.data.refUID,
      attester: request.attester,
      deadline: request.deadline.toString(),
    });
    const eas = new Contract(EAS_ADDRESS, EAS_ABI, signer);
    const tx = await eas.attestByDelegation({
      schema: request.schema,
      data: request.data,
      signature: { v: sigTuple[0], r: sigTuple[1], s: sigTuple[2] },
      attester: request.attester,
      deadline: request.deadline,
    });
    const receipt = await tx.wait();
    console.log('Confirmed in block:', receipt.blockNumber);
    console.log('Status:', receipt.status);
  }
}

main().catch((e) => {
  console.error('Error:', e?.message || e);
  process.exit(1);
});






