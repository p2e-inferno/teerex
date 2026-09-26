/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { Contract, JsonRpcProvider, formatUnits } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { verifyPrivyToken, getUserWalletAddresses } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { isAnyUserWalletIsLockManagerParallel } from "../_shared/unlock.ts";
import { resolveDisplayName } from "../_shared/profiles.ts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const LOCK_ABI = [
  { inputs: [], name: "maxNumberOfKeys", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "maxKeysPerAddress", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "totalSupply", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "tokenAddress", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "keyPrice", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

const ERC20_ABI = [
  { inputs: [], name: "decimals", outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" },
] as const;

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isAddress = (value: unknown) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
const normalizeAddress = (value: unknown) => String(value || "").trim().toLowerCase();
const allowedCurrencies = new Set(["ETH", "USDC", "DG", "G", "UP"]);

function validateCommon(input: any) {
  const name = String(input?.name || "").trim();
  const image = String(input?.image_url || "").trim();
  const price = Number(input?.price);
  const supply = Number(input?.max_supply);
  const perWallet = Number(input?.max_keys_per_address ?? 1);
  const currency = String(input?.currency || "");
  if (!name || name.length > 120) throw new Error("A valid collectible name is required.");
  if (!image) throw new Error("A collectible image is required.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Price must be greater than zero.");
  if (!Number.isInteger(supply) || supply < 1) throw new Error("Supply must be a positive whole number.");
  if (!Number.isInteger(perWallet) || perWallet < 1 || perWallet > supply) throw new Error("Per-person limit must be between 1 and total supply.");
  if (!allowedCurrencies.has(currency)) throw new Error("Unsupported collectible currency.");
  if (Boolean(input?.is_claimable) && !String(input?.fulfillment_note || "").trim()) {
    throw new Error("Fulfillment terms are required when a physical item is available.");
  }
}

function configuredTokenAddress(network: any, currency: string): string | null {
  switch (currency) {
    case "ETH": return ZERO_ADDRESS;
    case "USDC": return network?.usdc_token_address || null;
    case "DG": return network?.dg_token_address || null;
    case "G": return network?.g_token_address || null;
    case "UP": return network?.up_token_address || null;
    default: return null;
  }
}

function mapRow(row: any, displayName: string | null = null) {
  return {
    ...row,
    chain_id: Number(row.chain_id),
    price: Number(row.price),
    max_supply: Number(row.max_supply),
    max_keys_per_address: Number(row.max_keys_per_address || 1),
    creator_display_name: displayName,
  };
}

async function requireManagedCollectible(supabase: any, id: string, userId: string, wallets: string[]) {
  const { data: collectible, error } = await supabase
    .from("collectibles")
    .select("*")
    .eq("id", id)
    .eq("creator_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!collectible) throw Object.assign(new Error("Collectible not found."), { status: 404 });

  const network = await validateChain(supabase, Number(collectible.chain_id));
  if (!network?.rpc_url) throw new Error("Collectible network is not active.");
  const { anyIsManager } = await isAnyUserWalletIsLockManagerParallel(
    collectible.lock_address,
    wallets,
    network.rpc_url,
  );
  if (!anyIsManager) throw Object.assign(new Error("You are not a manager of this collectible lock."), { status: 403 });
  return { collectible, network };
}

async function readLockState(lockAddress: string, rpcUrl: string) {
  const provider = new JsonRpcProvider(rpcUrl);
  const lock = new Contract(lockAddress, LOCK_ABI, provider);
  const [maxSupply, perWallet, totalSupply, tokenAddress, rawPrice] = await Promise.all([
    lock.maxNumberOfKeys(),
    lock.maxKeysPerAddress(),
    lock.totalSupply(),
    lock.tokenAddress(),
    lock.keyPrice(),
  ]);
  let decimals = 18;
  if (String(tokenAddress).toLowerCase() !== ZERO_ADDRESS) {
    const token = new Contract(tokenAddress, ERC20_ABI, provider);
    decimals = Number(await token.decimals());
  }
  return {
    maxSupply: Number(maxSupply),
    perWallet: Number(perWallet) || 1,
    totalSupply: Number(totalSupply),
    tokenAddress: String(tokenAddress).toLowerCase(),
    rawPrice: BigInt(rawPrice),
    price: Number(formatUnits(rawPrice, decimals)),
    decimals,
  };
}

function pricesMatch(actual: number, submitted: number) {
  return Number.isFinite(submitted) && submitted > 0 && Math.abs(actual - submitted) <= Math.max(1e-12, submitted * 1e-9);
}

async function handleMine(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("collectibles")
    .select("*")
    .eq("creator_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const displayName = await resolveDisplayName(supabase, userId);
  return json({ ok: true, collectibles: (data ?? []).map((row: any) => mapRow(row, displayName)) });
}

async function handleCreate(supabase: any, userId: string, wallets: string[], body: any) {
  const input = body.collectible ?? {};
  validateCommon(input);
  const creatorAddress = normalizeAddress(input.creator_address);
  const lockAddress = normalizeAddress(input.lock_address);
  const chainId = Number(input.chain_id);
  if (!isAddress(creatorAddress) || !wallets.includes(creatorAddress)) {
    throw Object.assign(new Error("Creator wallet is not linked to this account."), { status: 403 });
  }
  if (!isAddress(lockAddress)) throw new Error("A valid lock address is required.");

  const network = await validateChain(supabase, chainId);
  if (!network?.rpc_url) throw new Error("Unsupported or inactive network.");
  const expectedToken = configuredTokenAddress(network, String(input.currency));
  if (!expectedToken) throw new Error("Token is not configured on this network.");

  const { anyIsManager } = await isAnyUserWalletIsLockManagerParallel(lockAddress, wallets, network.rpc_url);
  if (!anyIsManager) throw Object.assign(new Error("Authenticated user is not a manager of this lock."), { status: 403 });

  const state = await readLockState(lockAddress, network.rpc_url);
  if (state.tokenAddress !== expectedToken.toLowerCase()) throw new Error("On-chain payment token does not match the collectible submission.");
  if (!pricesMatch(state.price, Number(input.price))) throw new Error("On-chain price does not match the collectible submission.");
  if (state.maxSupply !== Number(input.max_supply)) throw new Error("On-chain supply does not match the collectible submission.");
  if (state.perWallet !== Number(input.max_keys_per_address)) throw new Error("On-chain per-person limit does not match the collectible submission.");

  const { data: existing } = await supabase
    .from("collectibles")
    .select("*")
    .eq("chain_id", chainId)
    .ilike("lock_address", lockAddress)
    .maybeSingle();
  if (existing) {
    const displayName = await resolveDisplayName(supabase, userId);
    return json({ ok: true, collectible: mapRow(existing, displayName), reused: true });
  }

  const row = {
    creator_id: userId,
    creator_address: creatorAddress,
    name: String(input.name).trim(),
    description: String(input.description || "").trim() || null,
    image_url: String(input.image_url),
    chain_id: chainId,
    currency: String(input.currency),
    price: state.price,
    max_supply: state.maxSupply,
    max_keys_per_address: state.perWallet,
    lock_address: lockAddress,
    transaction_hash: String(input.transaction_hash || ""),
    is_claimable: Boolean(input.is_claimable),
    fulfillment_note: String(input.fulfillment_note || "").trim() || null,
    is_public: true,
    transferable: true,
    nft_metadata_set: Boolean(input.nft_metadata_set),
    nft_base_uri: input.nft_base_uri || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("collectibles").insert(row).select("*").single();
  if (error) {
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("collectibles")
        .select("*")
        .eq("chain_id", chainId)
        .ilike("lock_address", lockAddress)
        .maybeSingle();
      if (raced) return json({ ok: true, collectible: mapRow(raced), reused: true });
    }
    throw new Error(error.message);
  }
  const displayName = await resolveDisplayName(supabase, userId);
  return json({ ok: true, collectible: mapRow(data, displayName) });
}

async function handleUpdate(supabase: any, userId: string, wallets: string[], body: any) {
  const id = String(body.id || "").trim();
  if (!id) throw new Error("Collectible id is required.");
  const updates = body.updates ?? {};
  const { collectible, network } = await requireManagedCollectible(supabase, id, userId, wallets);

  const next: Record<string, any> = {};
  if (updates.name !== undefined) {
    const name = String(updates.name).trim();
    if (!name || name.length > 120) throw new Error("A valid collectible name is required.");
    next.name = name;
  }
  if (updates.description !== undefined) next.description = String(updates.description || "").trim() || null;
  if (updates.image_url !== undefined) {
    const image = String(updates.image_url || "").trim();
    if (!image) throw new Error("A collectible image is required.");
    next.image_url = image;
  }

  const nextClaimable = updates.is_claimable !== undefined ? Boolean(updates.is_claimable) : Boolean(collectible.is_claimable);
  const nextTerms = updates.fulfillment_note !== undefined
    ? String(updates.fulfillment_note || "").trim() || null
    : collectible.fulfillment_note;
  if (nextClaimable && !nextTerms) throw new Error("Fulfillment terms are required when a physical item is available.");
  if (updates.is_claimable !== undefined) next.is_claimable = nextClaimable;
  if (updates.fulfillment_note !== undefined) next.fulfillment_note = nextTerms;
  if (updates.nft_metadata_set !== undefined) next.nft_metadata_set = Boolean(updates.nft_metadata_set);
  if (updates.nft_base_uri !== undefined) next.nft_base_uri = updates.nft_base_uri || null;

  if (updates.price !== undefined || updates.max_supply !== undefined || updates.max_keys_per_address !== undefined) {
    const state = await readLockState(collectible.lock_address, network.rpc_url);
    const expectedToken = configuredTokenAddress(network, String(collectible.currency));
    if (!expectedToken || state.tokenAddress !== expectedToken.toLowerCase()) {
      throw new Error("On-chain payment token no longer matches this collectible.");
    }
    if (updates.price !== undefined) {
      const submitted = Number(updates.price);
      if (!pricesMatch(state.price, submitted)) throw new Error("On-chain price has not been updated to the submitted value.");
      next.price = submitted;
    }
    if (updates.max_supply !== undefined) {
      const submitted = Number(updates.max_supply);
      if (!Number.isInteger(submitted) || submitted < state.totalSupply || submitted !== state.maxSupply) {
        throw new Error("On-chain max supply does not match the submitted value.");
      }
      next.max_supply = submitted;
    }
    if (updates.max_keys_per_address !== undefined) {
      const submitted = Number(updates.max_keys_per_address);
      if (!Number.isInteger(submitted) || submitted < 1 || submitted !== state.perWallet || submitted > state.maxSupply) {
        throw new Error("On-chain per-person limit does not match the submitted value.");
      }
      next.max_keys_per_address = submitted;
    }
  }

  if (Object.keys(next).length === 0) throw new Error("No supported changes were supplied.");
  next.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("collectibles")
    .update(next)
    .eq("id", id)
    .eq("creator_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const displayName = await resolveDisplayName(supabase, userId);
  return json({ ok: true, collectible: mapRow(data, displayName) });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  try {
    const token = req.headers.get("X-Privy-Authorization");
    const userId = await verifyPrivyToken(token);
    const wallets = (await getUserWalletAddresses(userId)).map((value: string) => value.toLowerCase());
    if (wallets.length === 0) return json({ ok: false, error: "No wallet is linked to this account." }, 403);

    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    switch (String(body.action || "")) {
      case "mine": return await handleMine(supabase, userId);
      case "create": return await handleCreate(supabase, userId, wallets, body);
      case "update": return await handleUpdate(supabase, userId, wallets, body);
      default: return json({ ok: false, error: "Unknown collectible management action." }, 400);
    }
  } catch (error: any) {
    console.error("[collectible-management]", error);
    const status = Number(error?.status) || 400;
    return json({ ok: false, error: error?.message || "Internal error." }, status);
  }
});
