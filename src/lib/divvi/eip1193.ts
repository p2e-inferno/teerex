import {
  getReferralTag as sdkGetReferralTag,
  submitReferral as sdkSubmitReferral,
} from "@divvi/referral-sdk";
import { waitForReceipt, type Eip1193Provider } from "./receipt";

type ReferralTagFn = typeof sdkGetReferralTag;
type SubmitReferralFn = typeof sdkSubmitReferral;

export type DivviWrapOptions = {
  consumer: `0x${string}`;
  getUserAddress: (tx: any) => `0x${string}` | null;
  isWriteTx?: (tx: any) => boolean;
  onError?: (e: unknown, ctx: { phase: string; txHash?: string }) => void;
  getReferralTag?: ReferralTagFn;
  submitReferral?: SubmitReferralFn;
};

const WRAPPED_PROVIDERS = new WeakMap<Eip1193Provider, Eip1193Provider>();

const strip0x = (hex: string) => (hex.startsWith("0x") ? hex.slice(2) : hex);
const isHex = (hex: unknown): hex is `0x${string}` =>
  typeof hex === "string" && /^0x[0-9a-fA-F]*$/.test(hex);
const isEvenHexLength = (hex: string) => strip0x(hex).length % 2 === 0;
const isHexNo0x = (hex: unknown): hex is string =>
  typeof hex === "string" && /^[0-9a-fA-F]*$/.test(hex);

const normalizeReferralTagToRawHex = (tag: string): string | null => {
  // Divvi SDK returns a raw hex string (no 0x prefix) in v2.
  const raw = strip0x(tag);
  if (!raw) return null;
  if (!isHexNo0x(raw)) return null;
  if (raw.length % 2 !== 0) return null;
  return raw;
};

export function wrapEip1193ProviderWithDivvi(
  provider: Eip1193Provider,
  opts: DivviWrapOptions
): Eip1193Provider {
  const existing = WRAPPED_PROVIDERS.get(provider);
  if (existing) return existing;

  const getReferralTag = opts.getReferralTag ?? sdkGetReferralTag;
  const submitReferral: SubmitReferralFn = opts.submitReferral ?? sdkSubmitReferral;
  const defaultIsWriteTx = (tx: any) => Boolean(tx?.to);

  const wrapped: Eip1193Provider = {
    request: async ({ method, params }) => {
      if (method !== "eth_sendTransaction" || !params?.[0]) {
        return provider.request({ method, params });
      }

      const tx = { ...params[0] };

      let chainId: number | null = null;
      try {
        const chainIdHex: string = await provider.request({
          method: "eth_chainId",
        });
        chainId = Number.parseInt(chainIdHex, 16);
      } catch (e) {
        opts.onError?.(e, { phase: "chainId-pre" });
      }

      const user = opts.getUserAddress(tx);
      const data =
        typeof tx.data === "string"
          ? tx.data
          : typeof (tx as any).input === "string"
          ? (tx as any).input
          : undefined;

      const shouldTag =
        (opts.isWriteTx?.(tx) ?? defaultIsWriteTx(tx)) &&
        Boolean(tx.to) &&
        user &&
        isHex(data) &&
        data !== "0x" &&
        isEvenHexLength(data);

      let didAppendTag = false;
      if (shouldTag) {
        try {
          const tag = getReferralTag({ user, consumer: opts.consumer });
          const tagHex = normalizeReferralTagToRawHex(String(tag));
          if (!tagHex) {
            opts.onError?.(new Error("Divvi referral tag was invalid hex"), {
              phase: "tag",
            });
          } else {
            const newData = (data as string) + tagHex;
            (tx as any).data = newData;
            if ((tx as any).input !== undefined) (tx as any).input = newData;
            didAppendTag = true;
          }
        } catch (e) {
          opts.onError?.(e, { phase: "tag" });
        }
      }

      const txHash = (await provider.request({ method, params: [tx] })) as string;

      void (async () => {
        try {
          if (!didAppendTag) return;
          let effectiveChainId = chainId;
          if (!effectiveChainId || !Number.isFinite(effectiveChainId)) {
            const chainIdHex: string = await provider.request({
              method: "eth_chainId",
            });
            effectiveChainId = Number.parseInt(chainIdHex, 16);
          }

          if (!effectiveChainId || !Number.isFinite(effectiveChainId)) return;
          if (!isHex(txHash) || txHash === "0x") return;
          await waitForReceipt(provider, txHash);
          await submitReferral({ txHash, chainId: effectiveChainId });
        } catch (e) {
          opts.onError?.(e, { phase: "submitReferral", txHash });
        }
      })();

      return txHash;
    },
  };

  WRAPPED_PROVIDERS.set(provider, wrapped);
  return wrapped;
}
