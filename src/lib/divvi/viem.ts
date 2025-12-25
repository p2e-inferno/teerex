import type { Address, Hex } from 'viem';
import type { PublicClient, WalletClient } from 'viem';
import { getReferralTag, submitReferral } from '@divvi/referral-sdk';
import { DIVVI_CONSUMER_ADDRESS } from './config';

type DivviSdk = {
  getReferralTag: (args: { user: Address; consumer: Address }) => Hex;
  submitReferral: (args: { txHash: Hex; chainId: number }) => Promise<unknown>;
};

type Waiter = Pick<PublicClient, 'waitForTransactionReceipt'>;

type OnError = (e: unknown, ctx: { phase: string; txHash?: Hex }) => void;

type SendDivviTransactionOptions = {
  /**
   * The user address making the transaction.
   * In TeeRex, callers should pass the connected wallet address they already have.
   */
  account: Address;

  consumer?: Address;
  publicClient?: Waiter;

  /** When true, wait + submit before returning. Default: false (best-effort background). */
  awaitConfirmation?: boolean;

  /** When false, skip submitReferral entirely (still tags calldata). Default: true. */
  submit?: boolean;

  onError?: OnError;

  /** Test hook */
  sdk?: DivviSdk;
};

const isAddress = (v: unknown): v is Address =>
  typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);

const isHex = (v: unknown): v is Hex =>
  typeof v === 'string' && /^0x[0-9a-fA-F]*$/.test(v);

const strip0x = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex);
const ensure0x = (hex: string) => (hex.startsWith('0x') ? hex : `0x${hex}`);

const concatHex = (a: Hex, b: Hex): Hex => (`0x${strip0x(a)}${strip0x(b)}` as Hex);

export async function sendDivviTransaction(
  walletClient: WalletClient,
  request: { to?: Address; data?: Hex; value?: bigint } & Record<string, unknown>,
  opts: SendDivviTransactionOptions
): Promise<Hex> {
  const sdk: DivviSdk = opts.sdk ?? ({ getReferralTag, submitReferral } as unknown as DivviSdk);

  const submissionEnabled = opts.submit ?? true;

  const consumer =
    opts.consumer ??
    (isAddress(DIVVI_CONSUMER_ADDRESS) ? (DIVVI_CONSUMER_ADDRESS as Address) : undefined);

  const account = opts.account;
  if (!isAddress(account)) throw new Error('sendDivviTransaction: invalid `account`');

  // If submission is enabled, require a public client for receipt waiting.
  if (submissionEnabled && !opts.publicClient) {
    throw new Error('sendDivviTransaction: `publicClient` is required when submit is enabled');
  }

  let chainId: number | null = null;
  try {
    chainId = await walletClient.getChainId();
  } catch (e) {
    opts.onError?.(e, { phase: 'chainId-pre' });
  }

  // Default: tag only contract calls with non-empty calldata.
  let data = request.data;
  const shouldTag = Boolean(request.to) && isHex(data) && data !== '0x' && strip0x(data).length % 2 === 0;

  if (shouldTag && consumer && isAddress(consumer)) {
    try {
      const rawTag = sdk.getReferralTag({ user: account, consumer }) as unknown as string;
      const tag = ensure0x(String(rawTag)) as Hex;
      if (isHex(tag) && tag !== '0x' && strip0x(tag).length % 2 === 0) {
        data = concatHex(data as Hex, tag);
      } else {
        opts.onError?.(new Error('Divvi referral tag was invalid hex'), { phase: 'tag' });
      }
    } catch (e) {
      opts.onError?.(e, { phase: 'tag' });
    }
  }

  const txHash = await walletClient.sendTransaction({
    ...(request as any),
    account: account as any,
    data,
  });

  const doSubmit = async () => {
    if (!submissionEnabled) return;
    if (!consumer || !isAddress(consumer)) return;

    // Ensure chainId is available (best effort).
    let effectiveChainId = chainId;
    if (!effectiveChainId || !Number.isFinite(effectiveChainId)) {
      try {
        effectiveChainId = await walletClient.getChainId();
      } catch (e) {
        opts.onError?.(e, { phase: 'chainId-post', txHash });
        return;
      }
    }

    const publicClient = opts.publicClient;
    if (!publicClient) return; // should be unreachable due to precondition

    let receipt: any;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch (e) {
      opts.onError?.(e, { phase: 'waitForReceipt', txHash });
      return;
    }

    // Only submit on success.
    // viem uses `status: 'success' | 'reverted'`.
    if (receipt?.status && receipt.status !== 'success') {
      opts.onError?.(new Error('Transaction reverted; skipping submitReferral'), {
        phase: 'receipt-status',
        txHash,
      });
      return;
    }

    try {
      await sdk.submitReferral({ txHash, chainId: effectiveChainId });
    } catch (e) {
      opts.onError?.(e, { phase: 'submitReferral', txHash });
    }
  };

  if (opts.awaitConfirmation) {
    await doSubmit();
  } else {
    void doSubmit();
  }

  return txHash;
}
