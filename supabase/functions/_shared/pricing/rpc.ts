import { JsonRpcProvider } from "https://esm.sh/ethers@6.14.4";
import { resolvePricingRpcUrls } from "./rpc-urls.ts";

function publicRpcLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "configured RPC";
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "unknown error");
}

export async function withPricingProviderFallback<T>(params: {
  chainId: number;
  rpcUrl: string | null | undefined;
  label: string;
  action: (provider: JsonRpcProvider) => Promise<T>;
}): Promise<T> {
  const urls = resolvePricingRpcUrls(params.chainId, params.rpcUrl);
  if (urls.length === 0) throw new Error("RPC URL is not configured");

  let lastError: unknown;
  for (const url of urls) {
    const provider = new JsonRpcProvider(url);
    try {
      return await params.action(provider);
    } catch (error) {
      lastError = error;
      console.warn(`[pricing:rpc] ${params.label} failed`, {
        rpc_host: publicRpcLabel(url),
        error: errorMessage(error),
      });
    } finally {
      provider.destroy();
    }
  }

  throw new Error(`${params.label} failed across configured RPC endpoints: ${errorMessage(lastError)}`);
}
