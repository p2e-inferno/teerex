import { createPublicClient, fallback, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';
import { getNetworkConfigByChainId } from '@/lib/config/network-config';

/**
 * Singleton ENS client for Ethereum mainnet
 * Uses explicit browser-compatible RPC endpoints for ENS resolution
 */
let ensClient: { key: string; client: ReturnType<typeof createPublicClient> } | null = null;

const ETHEREUM_MAINNET_CHAIN_ID = 1;

export const ENS_PUBLIC_RPC_FALLBACK_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.flashbots.net',
] as const;

function appendRpcUrl(urls: string[], value: string | null | undefined): void {
  const url = typeof value === 'string' ? value.trim() : '';
  if (url && !urls.includes(url)) urls.push(url);
}

export async function resolveENSRpcUrls(): Promise<string[]> {
  const urls: string[] = [];

  try {
    const networkConfig = await getNetworkConfigByChainId(ETHEREUM_MAINNET_CHAIN_ID);
    appendRpcUrl(urls, networkConfig?.rpc_url);
  } catch (error) {
    console.warn('[ens] Failed to load configured Ethereum RPC URL:', error);
  }

  for (const url of ENS_PUBLIC_RPC_FALLBACK_URLS) {
    appendRpcUrl(urls, url);
  }

  return urls;
}

/**
 * Creates or returns the cached ENS public client
 * ENS resolution only works on Ethereum mainnet
 */
export function createENSClient(rpcUrls: readonly string[] = ENS_PUBLIC_RPC_FALLBACK_URLS) {
  const urls = rpcUrls.length > 0 ? rpcUrls : ENS_PUBLIC_RPC_FALLBACK_URLS;
  const key = urls.join('|');

  if (!ensClient || ensClient.key !== key) {
    ensClient = {
      key,
      client: createPublicClient({
        chain: mainnet,
        transport: fallback(
          urls.map((url) => http(url)),
          { rank: false }
        ),
      }),
    };
  }
  return ensClient.client;
}

/**
 * Validates if a string is a valid ENS name format
 *
 * @param input - The string to validate
 * @returns true if input appears to be an ENS name (.eth suffix)
 *
 * @example
 * isValidENSName('vitalik.eth') // true
 * isValidENSName('alice.eth') // true
 * isValidENSName('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb') // false
 * isValidENSName('invalid.com') // false
 */
export function isValidENSName(input: string): boolean {
  if (!input || typeof input !== 'string') return false;

  // Check for .eth suffix (case-insensitive)
  const hasEthSuffix = input.toLowerCase().endsWith('.eth');
  if (!hasEthSuffix) return false;

  // Basic length validation (minimum: a.eth = 5 chars)
  if (input.length < 5) return false;

  // Check for invalid characters (ENS names are alphanumeric + hyphens + dots)
  const validPattern = /^[a-z0-9-]+\.eth$/i;
  return validPattern.test(input);
}

/**
 * Resolves an ENS name to an Ethereum address
 *
 * @param name - The ENS name to resolve (e.g., 'vitalik.eth')
 * @returns The resolved Ethereum address, or null if resolution fails
 * @throws Error if ENS name is invalid format
 *
 * @example
 * const address = await resolveENS('vitalik.eth');
 * // Returns: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
 *
 * const notFound = await resolveENS('doesnotexist12345.eth');
 * // Returns: null
 */
export async function resolveENS(name: string): Promise<string | null> {
  if (!isValidENSName(name)) {
    throw new Error(`Invalid ENS name format: ${name}`);
  }

  try {
    const client = createENSClient(await resolveENSRpcUrls());

    // Normalize the name (handles special characters, etc.)
    const normalizedName = normalize(name);

    // Resolve ENS name to address
    const address = await client.getEnsAddress({
      name: normalizedName,
    });

    return address;
  } catch (error) {
    console.error('ENS resolution error:', error);
    // Return null on resolution failures (name not found, RPC issues, etc.)
    return null;
  }
}

/**
 * Performs reverse ENS lookup (address → name)
 *
 * @param address - The Ethereum address to lookup
 * @returns The primary ENS name for this address, or null if not set
 *
 * @example
 * const name = await reverseENS('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
 * // Returns: 'vitalik.eth'
 *
 * const noName = await reverseENS('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
 * // Returns: null (if no reverse record set)
 */
export async function reverseENS(address: string): Promise<string | null> {
  try {
    const client = createENSClient(await resolveENSRpcUrls());

    // Get the primary ENS name for this address
    const name = await client.getEnsName({
      address: address as `0x${string}`,
    });

    return name;
  } catch (error) {
    console.error('Reverse ENS lookup error:', error);
    return null;
  }
}
