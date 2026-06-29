import { BASE_MAINNET_CHAIN_ID } from "./base-defaults.ts";

const BASE_PUBLIC_RPC_FALLBACKS = [
  "https://mainnet.base.org",
  "https://1rpc.io/base",
] as const;

function configuredString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function appendUrl(urls: string[], value: string | null | undefined): void {
  const url = configuredString(value);
  if (url && !urls.includes(url)) urls.push(url);
}

function env(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  };
  return runtime.Deno?.env?.get?.(name);
}

export function resolvePricingRpcUrls(chainId: number, configuredUrl: string | null | undefined): string[] {
  const urls: string[] = [];

  appendUrl(urls, configuredUrl);
  appendUrl(urls, env("RPC_URL"));

  if (chainId === BASE_MAINNET_CHAIN_ID) {
    appendUrl(urls, env("BASE_MAINNET_RPC_URL"));
    appendUrl(urls, env("BASE_RPC_URL"));
    for (const url of BASE_PUBLIC_RPC_FALLBACKS) appendUrl(urls, url);
  }

  return urls;
}
