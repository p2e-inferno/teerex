// TEMP helper for building Remix-ready payloads for createAttestationByDelegation
// Remove after testing
import { ethers } from 'ethers';

export const ZERO32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function encodeAttendanceData(params: {
  eventId: string;
  lockAddress: string; // address
  eventTitle: string;
  timestamp?: number; // seconds
  location?: string;
  platform?: string;
}): string {
  const types = ['string', 'address', 'string', 'uint256', 'string', 'string'];
  const now = Math.floor(Date.now() / 1000);
  const values = [
    params.eventId,
    params.lockAddress,
    params.eventTitle,
    BigInt(params.timestamp ?? now),
    params.location ?? 'Metaverse',
    params.platform ?? 'TeeRex',
  ];
  return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
}

export function decodeAttendanceData(encoded: string): {
  eventId: string;
  lockAddress: string;
  eventTitle: string;
  timestamp: bigint;
  location: string;
  platform: string;
} {
  const types = ['string', 'address', 'string', 'uint256', 'string', 'string'];
  const [eventId, lockAddress, eventTitle, timestamp, location, platform] =
    ethers.AbiCoder.defaultAbiCoder().decode(types as any, encoded as any);
  return {
    eventId: String(eventId),
    lockAddress: String(lockAddress),
    eventTitle: String(eventTitle),
    timestamp: BigInt(timestamp),
    location: String(location),
    platform: String(platform),
  };
}

export function encodeTicketPurchaseData(params: {
  eventId: string;
  lockAddress: string; // NOTE: your schema states string; change to 'address' here if needed
  tokenId: bigint | number | string;
  price: bigint | number | string;
  timestamp?: number; // seconds
  purchaser: string; // address
}): string {
  const types = ['string', 'string', 'uint256', 'uint256', 'uint256', 'address'];
  const now = Math.floor(Date.now() / 1000);
  const values = [
    params.eventId,
    params.lockAddress,
    BigInt(params.tokenId),
    BigInt(params.price),
    BigInt(params.timestamp ?? now),
    params.purchaser,
  ];
  return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
}

export function toRemixSignature(sigHex: string): { v: number; r: string; s: string } {
  if (!sigHex || !sigHex.startsWith('0x')) throw new Error('Invalid signature');
  const bytes = sigHex.slice(2);
  if (bytes.length !== 130) throw new Error('Invalid signature length');
  const r = '0x' + bytes.slice(0, 64);
  const s = '0x' + bytes.slice(64, 128);
  let v = parseInt(bytes.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}

export function toRemixSignatureTuple(sigHex: string): [number, string, string] {
  const { v, r, s } = toRemixSignature(sigHex);
  return [v, r, s];
}

export function buildRemixPayloadFromExistingSignature(params: {
  teerexAddress: string;
  chainId: number;
  lockAddress: string;
  schemaUid: string;
  recipient: string;
  data: string;
  signatureHex: string; // 0x rsv
  attester?: string; // defaults to recipient
  deadline: number | string | bigint; // seconds
  expirationTime?: number | string | bigint;
  revocable?: boolean;
  refUID?: string;
}) {
  const signature = toRemixSignature(params.signatureHex);
  const signatureTuple = toRemixSignatureTuple(params.signatureHex);
  const deadlineStr = String(params.deadline);
  const expirationStr = String(params.expirationTime ?? 0);
  const payload = {
    lockAddress: params.lockAddress,
    schemaUID: params.schemaUid,
    recipient: params.recipient,
    data: params.data,
    signature, // object { v, r, s }
    signatureTuple, // Remix-friendly tuple [v, r, s]
    attester: params.attester || params.recipient,
    deadline: deadlineStr,
    expirationTime: expirationStr,
    revocable: Boolean(params.revocable ?? false),
    refUID: params.refUID || ZERO32,
    _context: { teerexAddress: params.teerexAddress, chainId: params.chainId },
    // Positional args array for Remix "Parameters" UI
    _remixArgs: [
      params.lockAddress,
      params.schemaUid,
      params.recipient,
      params.data,
      signatureTuple,
      params.attester || params.recipient,
      deadlineStr,
      expirationStr,
      Boolean(params.revocable ?? false),
      params.refUID || ZERO32,
    ] as [
      string,
      string,
      string,
      string,
      [number, string, string],
      string,
      string,
      string,
      boolean,
      string
    ],
  } as const;
  return payload;
}

// Sign delegated EAS including nonce (for standalone debugging if needed)
export async function signDelegatedEASWithNonce(params: {
  signer: ethers.Signer;
  provider?: ethers.Provider; // optional; will use signer.provider if not provided
  chainId: number;
  schemaUid: string;
  recipient: string;
  data: string;
  expirationTime?: bigint | number | string;
  revocable?: boolean;
  refUID?: string;
  deadlineSecondsFromNow?: number;
  easAddress?: string; // defaults Base EAS
}) {
  const {
    signer, provider, chainId, schemaUid, recipient, data,
    expirationTime = 0n, revocable = false, refUID = ZERO32,
    deadlineSecondsFromNow = 3600, easAddress = '0x4200000000000000000000000000000000000021',
  } = params;

  const prov = provider || (signer.provider as ethers.Provider);
  if (!prov) throw new Error('Provider required for nonce');

  const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.max(1, deadlineSecondsFromNow));
  const EAS_NONCE_ABI = ['function getNonce(address) view returns (uint256)'];
  const eas = new ethers.Contract(easAddress, EAS_NONCE_ABI, prov);
  const attester = await signer.getAddress();
  const nonce: bigint = await eas.getNonce(attester);

  const domain = { name: 'EAS', version: '1.0.0', chainId, verifyingContract: easAddress } as const;
  const types = {
    DelegatedAttestation: [
      { name: 'schema', type: 'bytes32' },
      { name: 'data', type: 'AttestationRequestData' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
    ],
    AttestationRequestData: [
      { name: 'recipient', type: 'address' },
      { name: 'expirationTime', type: 'uint64' },
      { name: 'revocable', type: 'bool' },
      { name: 'refUID', type: 'bytes32' },
      { name: 'data', type: 'bytes' },
      { name: 'value', type: 'uint256' },
    ],
  } as const;
  const value = {
    schema: schemaUid,
    data: {
      recipient,
      expirationTime: BigInt(expirationTime || 0),
      revocable: Boolean(revocable),
      refUID,
      data,
      value: 0n,
    },
    nonce,
    deadline,
  } as const;

  let sig: string;
  try {
    // ethers v6 signTypedData compatibility
    sig = await (signer as any).signTypedData(domain, types, value);
  } catch {
    // ethers v5 _signTypedData fallback
    sig = await (signer as any)._signTypedData(domain, types, value);
  }
  const signatureTuple = toRemixSignatureTuple(sig);
  return { signatureHex: sig, signatureTuple, deadline };
}

// Build EAS nested typed data + digest (no signing)
export function buildDelegatedTypedData(params: {
  chainId: number;
  schemaUid: string;
  recipient: string;
  data: string;
  attester: string;
  deadline: number | bigint | string;
  expirationTime?: number | bigint | string;
  revocable?: boolean;
  refUID?: string;
  easAddress?: string;
  nonce?: number | bigint | string; // optional for digest preview
}) {
  const {
    chainId,
    schemaUid,
    recipient,
    data,
    attester,
    deadline,
    expirationTime = 0,
    revocable = false,
    refUID = ZERO32,
    easAddress = '0x4200000000000000000000000000000000000021',
    nonce = 0,
  } = params;

  const domain = { name: 'EAS', version: '1.0.0', chainId, verifyingContract: easAddress } as const;
  const types = {
    DelegatedAttestation: [
      { name: 'schema', type: 'bytes32' },
      { name: 'data', type: 'AttestationRequestData' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
    ],
    AttestationRequestData: [
      { name: 'recipient', type: 'address' },
      { name: 'expirationTime', type: 'uint64' },
      { name: 'revocable', type: 'bool' },
      { name: 'refUID', type: 'bytes32' },
      { name: 'data', type: 'bytes' },
      { name: 'value', type: 'uint256' },
    ],
  } as const;
  const value = {
    schema: schemaUid,
    data: {
      recipient,
      expirationTime: BigInt(expirationTime || 0),
      revocable: Boolean(revocable),
      refUID,
      data,
      value: 0n,
    },
    nonce: BigInt(nonce || 0),
    deadline: BigInt(deadline),
  } as const;

  let digest: string | undefined;
  try {
    digest = (ethers as any).TypedDataEncoder?.hash(domain as any, types as any, value as any);
  } catch (_) {
    digest = undefined;
  }
  return { domain, types, value, digest };
}
