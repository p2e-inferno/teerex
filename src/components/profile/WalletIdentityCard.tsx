import React, { useMemo, useState } from 'react';
import { usePrivy, type LinkedAccountWithMetadata } from '@privy-io/react-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QRCodeDisplay } from './QRCodeDisplay';
import { AddressDisplay } from './AddressDisplay';
import { useToast } from '@/hooks/use-toast';
import {
  formatShortWalletAddress,
  getPrivyWalletLabel,
  isPrivyEmailAccount,
  isPrivyWalletAccount,
  normalizeWalletAddress,
  type PrivyEmailAccount,
  type PrivyWalletAccount,
} from '@/lib/wallet/privyWalletIdentity';
import { Link2, Loader2, Mail, Plus, Shield, Unlink, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WalletIdentityCardProps {
  address: string;
  walletType: 'embedded' | 'connected';
  allAddresses?: string[];
  chainId?: number;
}

const LOGIN_ACCOUNT_TYPES = new Set<LinkedAccountWithMetadata['type']>([
  'wallet',
  'email',
  'phone',
  'google_oauth',
  'twitter_oauth',
  'discord_oauth',
  'github_oauth',
  'spotify_oauth',
  'instagram_oauth',
  'tiktok_oauth',
  'line_oauth',
  'linkedin_oauth',
  'apple_oauth',
  'custom_auth',
  'farcaster',
  'passkey',
  'telegram',
  'cross_app',
]);
const EMPTY_LINKED_ACCOUNTS: LinkedAccountWithMetadata[] = [];

const formatLinkedAt = (date?: Date | null) => {
  if (!date) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export const WalletIdentityCard: React.FC<WalletIdentityCardProps> = ({
  address,
  walletType,
  allAddresses = [],
  chainId,
}) => {
  const { user, linkEmail, linkWallet, unlinkEmail, unlinkWallet } = usePrivy();
  const { toast } = useToast();
  const [pendingAccount, setPendingAccount] = useState<string | null>(null);

  const linkedAccounts = user?.linkedAccounts ?? EMPTY_LINKED_ACCOUNTS;
  const emailAccounts = useMemo(() => linkedAccounts.filter(isPrivyEmailAccount), [linkedAccounts]);
  const walletAccounts = useMemo(() => linkedAccounts.filter(isPrivyWalletAccount), [linkedAccounts]);
  const loginAccountCount = useMemo(
    () => linkedAccounts.filter((account) => LOGIN_ACCOUNT_TYPES.has(account.type)).length,
    [linkedAccounts]
  );
  const canUnlinkLoginAccount = loginAccountCount > 1;
  const canLinkEmail = emailAccounts.length === 0;
  const canUnlinkWalletAccount = walletAccounts.length > 1 && canUnlinkLoginAccount;
  const linkedWalletAddressSet = useMemo(
    () => new Set(walletAccounts.map((wallet) => normalizeWalletAddress(wallet.address))),
    [walletAccounts]
  );
  const fallbackWalletAddresses = useMemo(() => {
    const addresses = allAddresses.length > 0 ? allAddresses : [address];
    return addresses.filter((addr) => !linkedWalletAddressSet.has(normalizeWalletAddress(addr)));
  }, [address, allAddresses, linkedWalletAddressSet]);

  const linkEmailAccount = async () => {
    if (!canLinkEmail || pendingAccount !== null) return;

    setPendingAccount('link:email');
    try {
      await linkEmail();
    } catch (error) {
      toast({
        title: 'Could not link email',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setPendingAccount(null);
    }
  };

  const linkWalletAccount = async () => {
    if (pendingAccount !== null) return;

    setPendingAccount('link:wallet');
    try {
      await linkWallet({ walletChainType: 'ethereum-only' });
    } catch (error) {
      toast({
        title: 'Could not link wallet',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setPendingAccount(null);
    }
  };

  const unlinkEmailAccount = async (account: PrivyEmailAccount) => {
    if (!canUnlinkLoginAccount || pendingAccount !== null) return;
    if (!window.confirm(`Unlink ${account.address} from your account?`)) return;

    const accountKey = `email:${account.address}`;
    setPendingAccount(accountKey);
    try {
      await unlinkEmail(account.address);
      toast({ title: 'Email unlinked', description: `${account.address} was removed.` });
    } catch (error) {
      toast({
        title: 'Could not unlink email',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setPendingAccount(null);
    }
  };

  const unlinkWalletAccount = async (account: PrivyWalletAccount) => {
    if (!canUnlinkWalletAccount || pendingAccount !== null) return;
    if (!window.confirm(`Unlink ${formatShortWalletAddress(account.address)} from your account?`)) return;

    const accountKey = `wallet:${account.address}`;
    setPendingAccount(accountKey);
    try {
      await unlinkWallet(account.address);
      toast({ title: 'Wallet unlinked', description: `${formatShortWalletAddress(account.address)} was removed.` });
    } catch (error) {
      toast({
        title: 'Could not unlink wallet',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setPendingAccount(null);
    }
  };

  const renderUnlinkButton = (
    accountKey: string,
    label: string,
    onClick: () => void,
    disabled: boolean,
    disabledTitle: string
  ) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-center text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300 sm:w-auto"
      disabled={disabled || pendingAccount !== null}
      onClick={onClick}
      aria-label={label}
      title={disabled ? disabledTitle : label}
    >
      {pendingAccount === accountKey ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Unlink className="mr-2 h-4 w-4" />
      )}
      Remove
    </Button>
  );

  const walletTypeBadge =
    walletType === 'embedded' ? (
      <>
        <Shield className="w-3 h-3 mr-1" />
        Privy
      </>
    ) : (
      <>
        <Link2 className="w-3 h-3 mr-1" />
        External
      </>
    );

  return (
    <Card className="flex h-full flex-col overflow-hidden border-0 bg-gradient-to-b from-white to-slate-50/80 shadow-xl dark:from-slate-900 dark:to-slate-900/80 lg:max-h-[560px]">
      <div className="relative px-6 pt-6 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Wallet</h3>
              <p className="text-sm text-slate-500 mt-0.5">Your primary address</p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'w-fit px-3 py-1 text-xs font-medium rounded-full',
              walletType === 'embedded'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            )}
          >
            {walletTypeBadge}
          </Badge>
        </div>
      </div>

      <CardContent className="space-y-6 px-6 pb-6 lg:overflow-y-auto">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
          <AddressDisplay
            address={address}
            chainId={chainId}
            showCopy
            showExplorer
            className="min-w-0 text-sm sm:text-base"
          />
        </div>

        <div className="flex justify-center">
          <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <QRCodeDisplay address={address} size={160} chainId={chainId} />
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Linked accounts</h4>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                disabled={!canLinkEmail || pendingAccount !== null}
                onClick={linkEmailAccount}
                title={canLinkEmail ? 'Link email' : 'An email is already linked'}
              >
                {pendingAccount === 'link:email' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Link Email
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                disabled={pendingAccount !== null}
                onClick={linkWalletAccount}
                title="Link wallet"
              >
                {pendingAccount === 'link:wallet' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Link Wallet
              </Button>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                <Mail className="h-4 w-4" />
                Email
              </div>
              {emailAccounts.length > 0 ? (
                emailAccounts.map((account) => {
                  const accountKey = `email:${account.address}`;
                  const linkedAt = formatLinkedAt(account.firstVerifiedAt ?? account.verifiedAt);

                  return (
                    <div
                      key={account.address}
                      className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                          {account.address}
                        </p>
                        {linkedAt && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Linked {linkedAt}
                          </p>
                        )}
                      </div>
                      {renderUnlinkButton(
                        accountKey,
                        `Unlink ${account.address}`,
                        () => unlinkEmailAccount(account),
                        !canUnlinkLoginAccount,
                        'Link another login method before removing this email'
                      )}
                    </div>
                  );
                })
              ) : (
                <div
                  className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
                >
                  No email linked
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                <Wallet className="h-4 w-4" />
                Wallets
              </div>
              {walletAccounts.map((account) => {
                const accountKey = `wallet:${account.address}`;
                const linkedAt = formatLinkedAt(account.firstVerifiedAt ?? account.verifiedAt);
                const isPrimary = normalizeWalletAddress(account.address) === normalizeWalletAddress(address);

                return (
                  <div
                    key={account.address}
                    className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {getPrivyWalletLabel(account)}
                        </Badge>
                        {isPrimary && (
                          <Badge variant="outline" className="text-xs">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <AddressDisplay
                        address={account.address}
                        chainId={chainId}
                        showCopy
                        showExplorer
                        className="min-w-0 text-sm"
                      />
                      {linkedAt && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Linked {linkedAt}
                        </p>
                      )}
                    </div>
                    {renderUnlinkButton(
                      accountKey,
                      `Unlink ${formatShortWalletAddress(account.address)}`,
                      () => unlinkWalletAccount(account),
                      !canUnlinkWalletAccount,
                      walletAccounts.length <= 1
                        ? 'Link another wallet before removing this one'
                        : 'Link another login method before removing this wallet'
                    )}
                  </div>
                );
              })}
              {fallbackWalletAddresses.map((addr) => {
                const isPrimary = normalizeWalletAddress(addr) === normalizeWalletAddress(address);

                return (
                  <div
                    key={addr}
                    className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          Connected
                        </Badge>
                        {isPrimary && (
                          <Badge variant="outline" className="text-xs">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <AddressDisplay
                        address={addr}
                        chainId={chainId}
                        showCopy
                        showExplorer
                        className="min-w-0 text-sm"
                      />
                    </div>
                  </div>
                );
              })}
              {walletAccounts.length === 0 && fallbackWalletAddresses.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No wallet linked
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
