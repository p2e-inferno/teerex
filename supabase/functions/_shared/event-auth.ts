/* deno-lint-ignore-file no-explicit-any */
import { getUserWalletAddresses } from "./privy.ts";
import { validateChain } from "./network-helpers.ts";
import { isAnyUserWalletIsLockManagerParallel } from "./unlock.ts";

export const EVENT_MANAGER_PERMISSIONS = [
  "manage_access",
  "manage_waitlist",
  "manage_discussions",
] as const;

export type EventManagerPermission = typeof EVENT_MANAGER_PERMISSIONS[number];

export type EventAuthResult = {
  authorized: boolean;
  isCreator: boolean;
  isOnchainManager: boolean;
  isOffchainManager: boolean;
  managerId?: string;
  managerWallet?: string;
  permissions: Record<EventManagerPermission, boolean>;
  userWallets: string[];
};

export function normalizeWalletAddress(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export function normalizePermissions(input: unknown): Record<EventManagerPermission, boolean> {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const out = {} as Record<EventManagerPermission, boolean>;
  for (const permission of EVENT_MANAGER_PERMISSIONS) {
    out[permission] = source[permission] === true;
  }
  return out;
}

export function hasAnyPermission(permissions: Record<EventManagerPermission, boolean>): boolean {
  return EVENT_MANAGER_PERMISSIONS.some((permission) => permissions[permission]);
}

export function parseManagerPermissions(input: unknown): Record<EventManagerPermission, boolean> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("permissions must be an object with known boolean permission keys");
  }

  const source = input as Record<string, unknown>;
  const allowed = new Set<string>(EVENT_MANAGER_PERMISSIONS);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown manager permission: ${key}`);
    }
    if (typeof source[key] !== "boolean") {
      throw new Error(`Manager permission ${key} must be a boolean`);
    }
  }

  return normalizePermissions(source);
}

function forbidden(message: string): Error & { status?: number } {
  const error = new Error(message) as Error & { status?: number };
  error.status = 403;
  return error;
}

export async function getEventAuthorization(params: {
  supabase: any;
  event: any;
  privyUserId: string;
  permission?: EventManagerPermission;
  allowOnchainManager?: boolean;
  userWallets?: string[];
}): Promise<EventAuthResult> {
  const {
    supabase,
    event,
    privyUserId,
    permission,
    allowOnchainManager = true,
    userWallets: providedWallets,
  } = params;

  const isCreator = Boolean(event?.creator_id && event.creator_id === privyUserId);
  const shouldLoadWallets = !isCreator || Boolean(providedWallets);
  const userWallets = (providedWallets || (shouldLoadWallets ? await getUserWalletAddresses(privyUserId) : []))
    .map((addr) => normalizeWalletAddress(addr))
    .filter((addr): addr is string => Boolean(addr));
  const uniqueWallets = Array.from(new Set(userWallets));

  let isOnchainManager = false;
  let onchainManagerWallet: string | undefined;
  if (!isCreator && allowOnchainManager && uniqueWallets.length > 0 && event?.lock_address && event?.chain_id) {
    const networkConfig = await validateChain(supabase, event.chain_id);
    if (networkConfig?.rpc_url) {
      const result = await isAnyUserWalletIsLockManagerParallel(
        event.lock_address,
        uniqueWallets,
        networkConfig.rpc_url,
      );
      isOnchainManager = Boolean(result.anyIsManager);
      onchainManagerWallet = result.manager;
    }
  }

  let isOffchainManager = false;
  let managerId: string | undefined;
  let managerWallet: string | undefined;
  let permissions = normalizePermissions({});

  if (!isCreator && !isOnchainManager && uniqueWallets.length > 0) {
    const { data: managerRows, error } = await supabase
      .from("event_managers")
      .select("id, wallet_address, permissions")
      .eq("event_id", event.id)
      .is("revoked_at", null)
      .in("wallet_address", uniqueWallets)
      .limit(1);

    if (error) {
      throw error;
    }

    const row = Array.isArray(managerRows) ? managerRows[0] : null;
    if (row) {
      isOffchainManager = true;
      managerId = row.id;
      managerWallet = row.wallet_address;
      permissions = normalizePermissions(row.permissions);
    }
  }

  const authorized = Boolean(
    isCreator ||
    isOnchainManager ||
    (isOffchainManager && (!permission || permissions[permission])),
  );

  return {
    authorized,
    isCreator,
    isOnchainManager,
    isOffchainManager,
    managerId,
    managerWallet: managerWallet || onchainManagerWallet,
    permissions,
    userWallets: uniqueWallets,
  };
}

export async function requireEventAuthorization(params: {
  supabase: any;
  event: any;
  privyUserId: string;
  permission?: EventManagerPermission;
  allowOnchainManager?: boolean;
  userWallets?: string[];
  errorMessage?: string;
}): Promise<EventAuthResult> {
  const auth = await getEventAuthorization(params);
  if (!auth.authorized) {
    throw forbidden(params.errorMessage || "Unauthorized");
  }
  return auth;
}
