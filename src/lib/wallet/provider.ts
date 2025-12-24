import { ethers } from "ethers";
import { DIVVI_CONSUMER_ADDRESS } from "@/lib/divvi/config";
import { wrapEip1193ProviderWithDivvi } from "@/lib/divvi/eip1193";

type Eip1193Provider = { request: (args: { method: string; params?: any[] }) => Promise<any> };

const isAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);

export async function getDivviEip1193Provider(wallet: any): Promise<Eip1193Provider> {
  const raw = await wallet.getEthereumProvider();
  if (!isAddress(DIVVI_CONSUMER_ADDRESS)) return raw;

  return wrapEip1193ProviderWithDivvi(raw, {
    consumer: DIVVI_CONSUMER_ADDRESS as `0x${string}`,
    getUserAddress: (tx) =>
      tx?.from ? (String(tx.from).toLowerCase() as `0x${string}`) : null,
    onError: (e, ctx) => console.warn("[divvi]", ctx.phase, ctx.txHash ?? "", e),
  });
}

export async function getDivviBrowserProvider(wallet: any) {
  const provider = await getDivviEip1193Provider(wallet);
  return new ethers.BrowserProvider(provider);
}
