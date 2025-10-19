/* deno-lint-ignore-file no-explicit-any */
import { Contract, JsonRpcProvider } from "https://esm.sh/ethers@6.14.4";
import PublicLockV15 from "../_shared/abi/PublicLockV15.json" assert { type: "json" };

/**
 * Checks in parallel if any address in `addresses` holds a valid key
 * for the given `lockAddress` using the provided `rpcUrl`.
 */
export async function isAnyUserWalletHasValidKeyParallel(
  lockAddress: string,
  addresses: string[],
  rpcUrl: string,
): Promise<{ anyHasKey: boolean; holder?: string }> {
  if (!lockAddress || !rpcUrl || !Array.isArray(addresses) || addresses.length === 0) {
    return { anyHasKey: false };
  }
  const provider = new JsonRpcProvider(rpcUrl);
  const lock = new Contract(lockAddress, PublicLockV15 as any, provider);
  const checks = await Promise.all(
    addresses.map(async (addr) => {
      try {
        const ok = await lock.getHasValidKey(addr);
        return { addr, ok: Boolean(ok) };
      } catch (_) {
        return { addr, ok: false };
      }
    })
  );
  const hit = checks.find((c) => c.ok);
  return { anyHasKey: Boolean(hit), holder: hit?.addr };
}
