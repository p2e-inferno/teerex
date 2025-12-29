import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QRCodeDisplay } from './QRCodeDisplay';
import { AddressDisplay } from './AddressDisplay';
import { Wallet, Shield, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WalletIdentityCardProps {
  address: string;
  walletType: 'embedded' | 'connected';
  allAddresses?: string[];
  chainId?: number;
}

export const WalletIdentityCard: React.FC<WalletIdentityCardProps> = ({
  address,
  walletType,
  allAddresses = [],
  chainId,
}) => {
  const otherAddresses = allAddresses.filter(
    (addr) => addr.toLowerCase() !== address.toLowerCase()
  );

  return (
    <Card className="h-full overflow-hidden border-0 shadow-xl bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 flex flex-col">
      {/* Header Section */}
      <div className="relative px-6 pt-6 pb-4">
        <div className="flex items-start justify-between">
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
              'px-3 py-1 text-xs font-medium rounded-full',
              walletType === 'embedded'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            )}
          >
            {walletType === 'embedded' ? (
              <>
                <Shield className="w-3 h-3 mr-1" />
                Privy
              </>
            ) : (
              <>
                <Link2 className="w-3 h-3 mr-1" />
                External
              </>
            )}
          </Badge>
        </div>
      </div>

      <CardContent className="px-6 pb-6 space-y-6">
        {/* Address Display */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
          <AddressDisplay
            address={address}
            chainId={chainId}
            showCopy
            showExplorer
            className="text-base"
          />
        </div>

        {/* QR Code Section */}
        <div className="flex justify-center">
          <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <QRCodeDisplay address={address} size={160} chainId={chainId} />
          </div>
        </div>

        {/* Connected Wallets */}
        {otherAddresses.length > 0 && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {otherAddresses.length} other wallet{otherAddresses.length > 1 ? 's' : ''} connected
              </span>
            </div>
            <div className="space-y-2">
              {otherAddresses.map((addr) => (
                <div
                  key={addr}
                  className="p-3 rounded-lg bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-700/50"
                >
                  <AddressDisplay
                    address={addr}
                    chainId={chainId}
                    showCopy
                    showExplorer
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
