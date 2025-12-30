import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Loader2,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Wallet,
  Ban,
  CreditCard,
  Hash,
  ChevronsUpDown,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useBanks } from '@/hooks/useBanks';
import { useResolveAccount } from '@/hooks/useResolveAccount';
import { useDebounce } from '@/hooks/useDebounce';

interface PayoutAccount {
  id: string;
  provider: string;
  business_name: string;
  account_holder_name: string | null;
  settlement_bank_code: string | null;
  settlement_bank_name: string | null;
  account_number: string;
  currency: string;
  percentage_charge: number;
  status: 'pending_verification' | 'verified' | 'verification_failed' | 'suspended';
  is_verified: boolean;
  verification_status: string | null;
  submitted_at: string;
  verified_at: string | null;
  settlement_schedule: string | null;
  has_subaccount: boolean;
  verification_error?: string;
  can_retry?: boolean;
  suspended_at?: string;
  suspension_reason?: string;
}

const VendorPayoutAccount: React.FC = () => {
  const { authenticated, ready, getAccessToken, login } = usePrivy();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  // React Query hooks
  const { data: banks = [], isLoading: banksLoading, error: banksError } = useBanks();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
  const [canReceiveFiat, setCanReceiveFiat] = useState(false);

  // Form state
  const [selectedBankCode, setSelectedBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [entryMethod, setEntryMethod] = useState<'bank-first' | 'account-first'>('bank-first');
  const [bankPopoverOpen, setBankPopoverOpen] = useState(false);

  // Get selected bank name for display
  const selectedBankName = useMemo(() => {
    return banks.find((b) => b.code === selectedBankCode)?.name || '';
  }, [banks, selectedBankCode]);

  // Debounce account number for real-time resolution
  const debouncedAccountNumber = useDebounce(accountNumber, 500);

  // Real-time account resolution (only when valid)
  const {
    data: resolvedAccount,
    isLoading: isResolving,
    error: resolveError,
  } = useResolveAccount(debouncedAccountNumber, selectedBankCode);

  // Fetch payout account status
  const fetchPayoutAccount = useCallback(async () => {
    if (!authenticated) return;

    setIsLoading(true);
    try {
      const token = await getAccessToken();
      const { data, error } = await supabase.functions.invoke('get-vendor-payout-account', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;

      if (data?.ok) {
        setPayoutAccount(data.payout_account);
        setCanReceiveFiat(data.can_receive_fiat_payments);
      } else {
        throw new Error(data?.error || 'Failed to fetch payout account');
      }
    } catch (err) {
      console.error('Error fetching payout account:', err);
      toast.error('Failed to load payout account status');
    } finally {
      setIsLoading(false);
    }
  }, [authenticated, getAccessToken, anonKey]);

  // Initial load
  useEffect(() => {
    if (ready && authenticated) {
      fetchPayoutAccount();
    } else if (ready && !authenticated) {
      setIsLoading(false);
    }
  }, [ready, authenticated, fetchPayoutAccount]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBankCode) {
      toast.error('Please select a bank');
      return;
    }
    if (!/^\d{10}$/.test(accountNumber)) {
      toast.error('Account number must be exactly 10 digits');
      return;
    }
    if (!resolvedAccount) {
      toast.error('Please wait for account verification');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      const selectedBank = banks.find((b) => b.code === selectedBankCode);

      // Use the verified account holder name from Paystack as the business name
      const { data, error } = await supabase.functions.invoke('submit-payout-account', {
        body: {
          business_name: resolvedAccount.account_name, // Use verified name
          settlement_bank_code: selectedBankCode,
          settlement_bank_name: selectedBank?.name,
          account_number: accountNumber,
        },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;

      if (data?.ok) {
        toast.success('Account verified successfully! You can now receive fiat payments.');
        setPayoutAccount(data.payout_account);
        setCanReceiveFiat(true);
      } else {
        // Handle verification failure
        if (data?.can_retry) {
          toast.error(data.error || 'Verification failed', {
            description: data.retry_hint || 'Please check your details and try again',
          });
          setPayoutAccount(data.payout_account);
        } else {
          toast.error(data?.error || 'Failed to submit payout account');
        }
      }
    } catch (err) {
      console.error('Error submitting payout account:', err);
      toast.error('Failed to submit payout account');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle retry
  const handleRetry = async () => {
    if (!payoutAccount) return;
    if (!resolvedAccount) {
      toast.error('Please verify your account details first');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      const selectedBank = banks.find((b) => b.code === selectedBankCode);

      const { data, error } = await supabase.functions.invoke('retry-payout-verification', {
        body: {
          payout_account_id: payoutAccount.id,
          business_name: resolvedAccount.account_name, // Use verified name
          settlement_bank_code: selectedBankCode || undefined,
          settlement_bank_name: selectedBank?.name,
          account_number: accountNumber || undefined,
        },
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-Privy-Authorization': `Bearer ${token}`,
        },
      });

      if (error) throw error;

      if (data?.ok) {
        toast.success('Account verified successfully!');
        setPayoutAccount(data.payout_account);
        setCanReceiveFiat(true);
      } else {
        toast.error(data?.error || 'Verification failed', {
          description: data?.retry_hint,
        });
        if (data?.payout_account) {
          setPayoutAccount(data.payout_account);
        }
      }
    } catch (err) {
      console.error('Error retrying verification:', err);
      toast.error('Failed to retry verification');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get status badge
  const getStatusBadge = (status: PayoutAccount['status']) => {
    switch (status) {
      case 'verified':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Verified
          </Badge>
        );
      case 'verification_failed':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Verification Failed
          </Badge>
        );
      case 'pending_verification':
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Verifying...
          </Badge>
        );
      case 'suspended':
        return (
          <Badge variant="destructive">
            <Ban className="w-3 h-3 mr-1" />
            Suspended
          </Badge>
        );
      default:
        return null;
    }
  };

  // Loading state
  if (!ready || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto shadow-xl shadow-violet-500/20">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
          <p className="text-slate-500 font-medium">Loading payout account...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card className="shadow-xl">
            <CardContent className="pt-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-violet-500/20">
                <Wallet className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Connect to Continue
              </h2>
              <p className="text-slate-500 mb-6">
                Connect your wallet to manage your payout account.
              </p>
              <Button
                onClick={login}
                className="w-full h-12 text-base font-medium rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/25"
              >
                Connect Wallet
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-3xl">
        {/* Page Header */}
        <div className="mb-8 sm:mb-12">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl shadow-violet-500/20">
              <Building2 className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                Payout Account
              </h1>
              <p className="text-slate-500 mt-1">
                Manage your bank account for receiving fiat payments
              </p>
            </div>
          </div>
        </div>

        {/* Status Card - If account exists */}
        {payoutAccount && (
          <Card className="mb-8 shadow-lg border-0">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Account Status</CardTitle>
                {getStatusBadge(payoutAccount.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Business Name</p>
                  <p className="font-medium">{payoutAccount.business_name}</p>
                </div>
                <div>
                  <p className="text-slate-500">Account Number</p>
                  <p className="font-medium font-mono">{payoutAccount.account_number}</p>
                </div>
                <div>
                  <p className="text-slate-500">Bank</p>
                  <p className="font-medium">{payoutAccount.settlement_bank_name || '-'}</p>
                </div>
                {payoutAccount.account_holder_name && (
                  <div>
                    <p className="text-slate-500">Account Holder</p>
                    <p className="font-medium">{payoutAccount.account_holder_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-slate-500">Platform Commission</p>
                  <p className="font-medium">{payoutAccount.percentage_charge}%</p>
                </div>
                {payoutAccount.verified_at && (
                  <div>
                    <p className="text-slate-500">Verified At</p>
                    <p className="font-medium">
                      {new Date(payoutAccount.verified_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>

              {/* Verification Failed Message */}
              {payoutAccount.status === 'verification_failed' && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Verification Failed</AlertTitle>
                  <AlertDescription>
                    {payoutAccount.verification_error ||
                      'Bank account verification failed. Please check your details and try again.'}
                  </AlertDescription>
                </Alert>
              )}

              {/* Suspended Message */}
              {payoutAccount.status === 'suspended' && (
                <Alert variant="destructive">
                  <Ban className="h-4 w-4" />
                  <AlertTitle>Account Suspended</AlertTitle>
                  <AlertDescription>
                    {payoutAccount.suspension_reason ||
                      'Your payout account has been suspended. Please contact support.'}
                  </AlertDescription>
                </Alert>
              )}

              {/* Verified Success Message */}
              {payoutAccount.status === 'verified' && canReceiveFiat && (
                <Alert className="bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Ready to Receive Payments</AlertTitle>
                  <AlertDescription>
                    Your account is verified. You can now receive fiat payments for your events.
                    Payments will be settled to your bank account automatically.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Retry Form - If verification failed */}
        {payoutAccount?.status === 'verification_failed' && payoutAccount.can_retry && (
          <Card className="shadow-lg border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Retry Verification
              </CardTitle>
              <CardDescription>
                Update your details below and retry verification
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); handleRetry(); }} className="space-y-6">
                <div className="space-y-2">
                  <Label>Bank</Label>
                  <Popover open={bankPopoverOpen} onOpenChange={setBankPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={bankPopoverOpen}
                        className="w-full justify-between font-normal"
                        disabled={banksLoading}
                      >
                        {banksLoading
                          ? 'Loading banks...'
                          : selectedBankName || 'Search and select your bank...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search banks..." />
                        <CommandList>
                          <CommandEmpty>No bank found.</CommandEmpty>
                          <CommandGroup>
                            {banks.map((bank, index) => (
                              <CommandItem
                                key={`${bank.code}-${index}`}
                                value={bank.name}
                                onSelect={() => {
                                  setSelectedBankCode(bank.code);
                                  setBankPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selectedBankCode === bank.code ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {bank.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retry-account-number">Account Number</Label>
                  <Input
                    id="retry-account-number"
                    placeholder="Enter 10-digit account number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                    pattern="\d{10}"
                  />

                  {/* Real-time account resolution */}
                  {isResolving && accountNumber.length === 10 && selectedBankCode && (
                    <div className="flex items-center gap-2 text-sm text-slate-500 mt-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Verifying account...</span>
                    </div>
                  )}
                  {resolvedAccount && accountNumber.length === 10 && selectedBankCode && !isResolving && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-4 h-4" />
                      <div>
                        <p className="font-medium">Account Verified</p>
                        <p className="text-xs">{resolvedAccount.account_name}</p>
                      </div>
                    </div>
                  )}
                  {resolveError && accountNumber.length === 10 && selectedBankCode && !isResolving && (
                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                      <XCircle className="w-4 h-4" />
                      <span>Could not verify account. Please check details.</span>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    isSubmitting ||
                    (accountNumber.length === 10 && selectedBankCode.length > 0 && !resolvedAccount)
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry Verification
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* New Account Form - If no account exists */}
        {!payoutAccount && (
          <Card className="shadow-lg border-0">
            <CardHeader>
              <CardTitle>Add Payout Account</CardTitle>
              <CardDescription>
                Enter your Nigerian bank account details to receive fiat payments for your events.
                Your account will be verified automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Bank list error */}
              {banksError && (
                <Alert variant="destructive" className="mb-6">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error Loading Banks</AlertTitle>
                  <AlertDescription>
                    Failed to load bank list. Please refresh the page.
                  </AlertDescription>
                </Alert>
              )}

              <Tabs value={entryMethod} onValueChange={(v) => setEntryMethod(v as typeof entryMethod)} className="mb-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="bank-first" className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Select Bank First
                  </TabsTrigger>
                  <TabsTrigger value="account-first" className="flex items-center gap-2">
                    <Hash className="w-4 h-4" />
                    Enter Account First
                  </TabsTrigger>
                </TabsList>

                {/* Method 1: Bank First */}
                <TabsContent value="bank-first" className="space-y-6 mt-6">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="bank-combobox-1">
                        Bank <span className="text-red-500">*</span>
                      </Label>
                      <Popover open={bankPopoverOpen} onOpenChange={setBankPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            id="bank-combobox-1"
                            variant="outline"
                            role="combobox"
                            aria-expanded={bankPopoverOpen}
                            className="w-full justify-between font-normal"
                            disabled={banksLoading}
                          >
                            {banksLoading
                              ? 'Loading banks...'
                              : selectedBankName || 'Search and select your bank...'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search banks..." />
                            <CommandList>
                              <CommandEmpty>No bank found.</CommandEmpty>
                              <CommandGroup>
                                {banks.map((bank, index) => (
                                  <CommandItem
                                    key={`${bank.code}-${index}`}
                                    value={bank.name}
                                    onSelect={() => {
                                      setSelectedBankCode(bank.code);
                                      setBankPopoverOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        selectedBankCode === bank.code ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    {bank.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <p className="text-xs text-slate-500">Type to search for your bank</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="account-number-1">
                        Account Number <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="account-number-1"
                        placeholder="Enter 10-digit account number"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        maxLength={10}
                        pattern="\d{10}"
                        required
                      />
                      <p className="text-xs text-slate-500">
                        Nigerian bank account numbers are 10 digits
                      </p>

                      {/* Real-time account resolution */}
                      {isResolving && accountNumber.length === 10 && selectedBankCode && (
                        <div className="flex items-center gap-2 text-sm text-slate-500 mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifying account...</span>
                        </div>
                      )}
                      {resolvedAccount && accountNumber.length === 10 && selectedBankCode && !isResolving && (
                        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                          <div>
                            <p className="font-medium">Account Verified</p>
                            <p className="text-xs">{resolvedAccount.account_name}</p>
                          </div>
                        </div>
                      )}
                      {resolveError && accountNumber.length === 10 && selectedBankCode && !isResolving && (
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                          <XCircle className="w-4 h-4" />
                          <span>Could not verify account. Please check your bank and account number.</span>
                        </div>
                      )}
                    </div>

                    <Alert className="bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700">
                      <AlertDescription className="text-sm">
                        <strong>Platform Commission:</strong> 5% of each fiat transaction will be retained
                        as platform commission. You will receive 95% of the ticket price.
                      </AlertDescription>
                    </Alert>

                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-medium"
                      disabled={
                        isSubmitting ||
                        !selectedBankCode ||
                        accountNumber.length !== 10 ||
                        !resolvedAccount
                      }
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Verifying Account...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Add Account
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>

                {/* Method 2: Account First */}
                <TabsContent value="account-first" className="space-y-6 mt-6">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="account-number-2">
                        Account Number <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="account-number-2"
                        placeholder="Enter 10-digit account number"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        maxLength={10}
                        pattern="\d{10}"
                        required
                      />
                      <p className="text-xs text-slate-500">
                        Enter your account number first, then select your bank
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bank-combobox-2">
                        Bank <span className="text-red-500">*</span>
                      </Label>
                      <Popover open={bankPopoverOpen} onOpenChange={setBankPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            id="bank-combobox-2"
                            variant="outline"
                            role="combobox"
                            aria-expanded={bankPopoverOpen}
                            className="w-full justify-between font-normal"
                            disabled={banksLoading || accountNumber.length !== 10}
                          >
                            {accountNumber.length !== 10
                              ? 'Enter account number first'
                              : banksLoading
                                ? 'Loading banks...'
                                : selectedBankName || 'Search and select your bank...'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search banks..." />
                            <CommandList>
                              <CommandEmpty>No bank found.</CommandEmpty>
                              <CommandGroup>
                                {banks.map((bank, index) => (
                                  <CommandItem
                                    key={`${bank.code}-${index}`}
                                    value={bank.name}
                                    onSelect={() => {
                                      setSelectedBankCode(bank.code);
                                      setBankPopoverOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        selectedBankCode === bank.code ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    {bank.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <p className="text-xs text-slate-500">
                        {accountNumber.length === 10
                          ? 'Type to search for your bank'
                          : 'Complete account number to search banks'}
                      </p>

                      {/* Real-time account resolution */}
                      {isResolving && accountNumber.length === 10 && selectedBankCode && (
                        <div className="flex items-center gap-2 text-sm text-slate-500 mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifying account...</span>
                        </div>
                      )}
                      {resolvedAccount && accountNumber.length === 10 && selectedBankCode && !isResolving && (
                        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                          <div>
                            <p className="font-medium">Account Verified</p>
                            <p className="text-xs">{resolvedAccount.account_name}</p>
                          </div>
                        </div>
                      )}
                      {resolveError && accountNumber.length === 10 && selectedBankCode && !isResolving && (
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                          <XCircle className="w-4 h-4" />
                          <span>Could not verify account. Please check your bank selection.</span>
                        </div>
                      )}
                    </div>

                    <Alert className="bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700">
                      <AlertDescription className="text-sm">
                        <strong>Platform Commission:</strong> 5% of each fiat transaction will be retained
                        as platform commission. You will receive 95% of the ticket price.
                      </AlertDescription>
                    </Alert>

                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-medium"
                      disabled={
                        isSubmitting ||
                        !selectedBankCode ||
                        accountNumber.length !== 10 ||
                        !resolvedAccount
                      }
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Verifying Account...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Add Account
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VendorPayoutAccount;
