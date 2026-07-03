import React, { useMemo, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { shortAddress } from './types';

interface UsdcDestinationSelectProps {
  value: string;
  onChange: (address: string) => void;
  defaultAddress: string;
  disabled?: boolean;
}

export const UsdcDestinationSelect: React.FC<UsdcDestinationSelectProps> = ({
  value,
  onChange,
  defaultAddress,
  disabled,
}) => {
  const { wallets } = useWallets();
  const [isChanging, setIsChanging] = useState(false);

  const linkedAddresses = useMemo(() => {
    const addresses = (wallets || [])
      .map((wallet) => String(wallet.address || '').toLowerCase())
      .filter((address) => /^0x[a-f0-9]{40}$/.test(address));
    const unique = [...new Set([defaultAddress.toLowerCase(), ...addresses])];
    return unique.filter(Boolean);
  }, [wallets, defaultAddress]);

  const selected = (value || defaultAddress).toLowerCase();
  const canChange = linkedAddresses.length > 1;

  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-muted-foreground">USDC sent to</div>
      {isChanging && canChange ? (
        <Select
          value={selected}
          onValueChange={(next) => {
            onChange(next);
            setIsChanging(false);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="mt-1 h-8 font-mono text-xs">
            <SelectValue placeholder="Choose a linked wallet" />
          </SelectTrigger>
          <SelectContent>
            {linkedAddresses.map((address) => (
              <SelectItem key={address} value={address} className="font-mono text-xs">
                {shortAddress(address)}
                {address === defaultAddress.toLowerCase() ? ' (active wallet)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono font-medium">{shortAddress(selected)}</div>
          {canChange && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setIsChanging(true)}
              disabled={disabled}
            >
              Change
            </Button>
          )}
        </div>
      )}
      <div className="mt-1 text-[11px] text-muted-foreground">Linked wallets only.</div>
    </div>
  );
};
