import { DIVVI_CONSUMER_ADDRESS } from './constants.ts';

type ReferralSdk = {
  getReferralTag: (args: { user: `0x${string}`; consumer: `0x${string}` }) => string;
  submitReferral: (args: { txHash: string; chainId: number }) => Promise<unknown>;
};

let cachedSdk: ReferralSdk | null = null;
async function loadSdk(): Promise<ReferralSdk> {
  if (cachedSdk) return cachedSdk;
  try {
    const mod = await import('npm:@divvi/referral-sdk@2.3.0');
    cachedSdk = mod as unknown as ReferralSdk;
    return cachedSdk;
  } catch {
    const mod = await import('https://esm.sh/@divvi/referral-sdk@2.3.0?target=deno');
    cachedSdk = mod as unknown as ReferralSdk;
    return cachedSdk;
  }
}

const isAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);
const strip0x = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex);
const isHex = (hex: unknown) => typeof hex === 'string' && /^0x[0-9a-fA-F]*$/.test(hex);

export function appendDivviTagToCalldata(args: {
  data: string | undefined;
  user: string;
  consumer?: string;
}): string | undefined {
  const consumer = args.consumer ?? DIVVI_CONSUMER_ADDRESS;
  if (!isAddress(consumer)) return args.data;
  if (!isAddress(args.user)) return args.data;
  if (!isHex(args.data) || args.data === '0x') return args.data;
  // Note: even-length hex is required; our calldata should always be even.
  if (strip0x(args.data).length % 2 !== 0) return args.data;

  // Load SDK lazily (Edge runtime caches modules).
  // We keep this function sync by returning unmodified data if the SDK isn't ready,
  // and rely on callers that need tagging to call `appendDivviTagToCalldataAsync`.
  return args.data;
}

export async function appendDivviTagToCalldataAsync(args: {
  data: string | undefined;
  user: `0x${string}`;
  consumer?: `0x${string}` | string;
}): Promise<string | undefined> {
  const consumer = (args.consumer ?? DIVVI_CONSUMER_ADDRESS) as string;
  if (!isAddress(consumer)) return args.data;
  if (!isAddress(args.user)) return args.data;
  if (!isHex(args.data) || args.data === '0x') return args.data;
  if (strip0x(args.data).length % 2 !== 0) return args.data;

  const { getReferralTag } = await loadSdk();
  const tag = getReferralTag({
    user: args.user,
    consumer: consumer as `0x${string}`,
  });

  // SDK may return tag with or without 0x prefix - handle both
  const tagHex = strip0x(tag);
  if (!tagHex || tagHex.length % 2 !== 0) return args.data;
  if (!/^[0-9a-fA-F]+$/.test(tagHex)) return args.data;

  return (args.data as string) + tagHex;
}

export async function submitDivviReferralBestEffort(args: { txHash: string; chainId: number }) {
  if (!args.txHash || !args.chainId) return;
  try {
    const { submitReferral } = await loadSdk();
    await submitReferral({ txHash: args.txHash, chainId: args.chainId });
  } catch (e) {
    console.warn('[divvi] submitReferral failed:', (e as Error)?.message ?? e);
  }
}

