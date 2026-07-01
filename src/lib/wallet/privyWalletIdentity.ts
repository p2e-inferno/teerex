import type { LinkedAccountWithMetadata } from '@privy-io/react-auth';

export interface PrivyWalletIdentitySource {
  address?: string | null;
  chainType?: string | null;
  connectorType?: string | null;
  imported?: boolean | null;
  type?: string | null;
  walletClientType?: string | null;
  walletIndex?: number | null;
}

export type PrivyEmailAccount = Extract<LinkedAccountWithMetadata, { type: 'email' }>;
export type PrivyWalletAccount = Extract<LinkedAccountWithMetadata, { type: 'wallet' }>;

const EMBEDDED_WALLET_CLIENT_TYPES = new Set(['privy', 'privy-v2']);

export const normalizeWalletAddress = (address?: string | null) =>
  address?.toLowerCase() ?? null;

export const formatShortWalletAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export const isPrivyEmailAccount = (
  account: LinkedAccountWithMetadata
): account is PrivyEmailAccount => account.type === 'email';

export const isPrivyWalletAccount = (
  account: LinkedAccountWithMetadata
): account is PrivyWalletAccount => account.type === 'wallet';

export const getPrivyLinkedWallets = (linkedAccounts?: LinkedAccountWithMetadata[] | null) =>
  (linkedAccounts ?? []).filter(isPrivyWalletAccount);

export const getPrivyLinkedWalletAddressSet = (linkedAccounts?: LinkedAccountWithMetadata[] | null) =>
  new Set(
    getPrivyLinkedWallets(linkedAccounts)
      .map((wallet) => normalizeWalletAddress(wallet.address))
      .filter((address): address is string => Boolean(address))
  );

export const isPrivyWalletAddressLinked = (
  linkedAccounts: LinkedAccountWithMetadata[] | null | undefined,
  address?: string | null
) => {
  const normalizedAddress = normalizeWalletAddress(address);
  if (!normalizedAddress) return false;
  return getPrivyLinkedWalletAddressSet(linkedAccounts).has(normalizedAddress);
};

export const isPrivyEmbeddedWallet = (wallet?: PrivyWalletIdentitySource | null) => {
  if (!wallet) return false;
  return (
    EMBEDDED_WALLET_CLIENT_TYPES.has(wallet.walletClientType ?? '') ||
    wallet.connectorType === 'embedded'
  );
};

export const isPrivyExternalWallet = (wallet?: PrivyWalletIdentitySource | null) =>
  Boolean(wallet?.address) && !isPrivyEmbeddedWallet(wallet);

export const getPrivyWalletByAddress = <T extends PrivyWalletIdentitySource>(
  wallets: T[],
  address?: string | null
) => {
  const normalizedAddress = normalizeWalletAddress(address);
  if (!normalizedAddress) return undefined;
  return wallets.find((wallet) => normalizeWalletAddress(wallet.address) === normalizedAddress);
};

export const getPreferredPrivyLinkedConnectedWallet = <T extends PrivyWalletIdentitySource>(
  linkedAccounts: LinkedAccountWithMetadata[] | null | undefined,
  connectedWallets: T[]
) => {
  const linkedWallets = getPrivyLinkedWalletAddressSet(linkedAccounts);
  const linkedConnectedWallets = connectedWallets.filter((wallet) => {
    const normalizedAddress = normalizeWalletAddress(wallet.address);
    return Boolean(normalizedAddress && linkedWallets.has(normalizedAddress));
  });

  return (
    linkedConnectedWallets.find(isPrivyEmbeddedWallet) ??
    linkedConnectedWallets[0] ??
    null
  );
};

const toTitleLabel = (value?: string | null) => {
  if (!value) return 'External';
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const getPrivyWalletLabel = (
  wallet: Pick<PrivyWalletIdentitySource, 'connectorType' | 'imported' | 'walletClientType'>
) => {
  if (isPrivyEmbeddedWallet(wallet)) {
    return wallet.imported ? 'Imported Privy' : 'Privy';
  }
  return toTitleLabel(wallet.walletClientType ?? wallet.connectorType);
};
