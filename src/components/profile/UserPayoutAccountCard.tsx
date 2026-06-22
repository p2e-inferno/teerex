import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Banknote, Eye, EyeOff, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { useBanks } from '@/hooks/useBanks';
import { useResolveAccount } from '@/hooks/useResolveAccount';
import { useUserPayoutAccount } from '@/hooks/useUserPayoutAccount';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export const UserPayoutAccountCard: React.FC = () => {
  const { getAccessToken } = usePrivy();
  const { payoutAccount, isLoading, refreshPayoutAccount } = useUserPayoutAccount();
  const { data: banks = [], isLoading: banksLoading } = useBanks();
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealedNumber, setRevealedNumber] = useState<string | null>(null);
  const selectedBank = banks.find((bank) => bank.code === bankCode);
  const { data: resolvedAccount, isFetching: isResolving } = useResolveAccount(accountNumber, bankCode);

  const selectBank = (value: string) => {
    const bank = banks.find((item) => item.code === value);
    setBankCode(value);
    if (bank?.defaultAccountNumber) {
      setAccountNumber(bank.defaultAccountNumber);
    }
  };

  const save = async () => {
    if (!selectedBank) {
      toast.error('Select a bank');
      return;
    }
    if (!/^\d{10}$/.test(accountNumber)) {
      toast.error('Enter a valid account number');
      return;
    }
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      await callEdgeFunction('save-user-payout-account', {
        account_number: accountNumber,
        bank_code: selectedBank.code,
        bank_name: selectedBank.name,
      }, {
        privyToken: token,
        withAnonKey: true,
      });
      setAccountNumber('');
      setBankCode('');
      setRevealedNumber(null);
      refreshPayoutAccount();
      toast.success('Bank details saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save bank details');
    } finally {
      setIsSaving(false);
    }
  };

  const reveal = async () => {
    setIsRevealing(true);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('reveal-user-payout-account', {}, {
        privyToken: token,
        withAnonKey: true,
      });
      setRevealedNumber(data.payout_account?.account_number || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reveal bank details');
    } finally {
      setIsRevealing(false);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          DG Redemption Account
        </CardTitle>
        <CardDescription>Where we send Naira when you redeem DG rewards.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading bank details...
          </div>
        ) : payoutAccount ? (
          <div className="rounded-md border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{payoutAccount.account_holder_name}</p>
                  <Badge variant="secondary">{payoutAccount.currency}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{payoutAccount.bank_name}</p>
                <p className="mt-2 font-mono text-sm">
                  {revealedNumber || payoutAccount.account_number || `******${payoutAccount.account_number_last4}`}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={revealedNumber ? () => setRevealedNumber(null) : reveal}
                disabled={isRevealing}
              >
                {isRevealing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : revealedNumber ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Save bank details to enable Redeem DG.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Bank</Label>
            <Select value={bankCode} onValueChange={selectBank} disabled={banksLoading}>
              <SelectTrigger>
                <SelectValue placeholder={banksLoading ? 'Loading banks...' : 'Select bank'} />
              </SelectTrigger>
              <SelectContent>
                {banks.map((bank) => (
                  <SelectItem key={bank.code} value={bank.code}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Account Number</Label>
            <Input
              inputMode="numeric"
              maxLength={10}
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="0000000000"
            />
          </div>
        </div>

        <div className="min-h-[22px] text-sm">
          {isResolving && <span className="text-muted-foreground">Resolving account...</span>}
          {resolvedAccount?.account_name && (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">{resolvedAccount.account_name}</span>
          )}
        </div>

        <Button onClick={save} disabled={isSaving || !selectedBank || !resolvedAccount?.account_name} className="w-full">
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Bank Details
        </Button>
      </CardContent>
    </Card>
  );
};
