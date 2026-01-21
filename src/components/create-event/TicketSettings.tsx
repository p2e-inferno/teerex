
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Shield, Zap, Ticket, CreditCard, Info, Loader2, AlertCircle, AlertTriangle, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { EventFormData } from '@/pages/CreateEvent';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { useMultipleTokenMetadata, tokenMetadataQueryKeys, fetchTokenMetadata } from '@/hooks/useTokenMetadata';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { validateCryptoPrice, validateFiatPrice, getPricePlaceholder, getPriceStep, MIN_NATIVE_TOKEN_PRICE, MIN_NGN_PRICE, getWholeNumberTokenMinimum } from '@/utils/priceUtils';
import type { CryptoCurrency } from '@/types/currency';
import { usesWholeNumberPricing } from '@/types/currency';
import { supabase } from '@/integrations/supabase/client';
import { useQueries } from '@tanstack/react-query';
import { CACHE_TIMES } from '@/lib/config/react-query-config';

interface PayoutAccountInfo {
  id: string;
  provider: string;
  business_name: string;
  account_holder_name?: string;
  settlement_bank_code: string;
  settlement_bank_name?: string;
  account_number: string; // Already masked from server
  currency: string;
  percentage_charge: number;
  status: string;
  is_verified: boolean;
  verified_at?: string;
  has_subaccount: boolean;
}

interface TicketSettingsProps {
  formData: EventFormData;
  updateFormData: (updates: Partial<EventFormData>) => void;
  onNext: () => void;
}

export const TicketSettings: React.FC<TicketSettingsProps> = ({
  formData,
  updateFormData,
}) => {
  const { authenticated, getAccessToken } = usePrivy();
  const { networks, isLoading, error, getNetworkByChainId, getAvailableTokens, getTokenAddress } = useNetworkConfigs();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  // Check if current network supports selected currency
  const currentChainId = (formData as any).chainId;

  // Fetch token metadata for all available tokens on current chain
  const availableTokens = currentChainId ? getAvailableTokens(currentChainId) : ['ETH'];
  const tokenAddresses = useMemo(() => {
    if (!currentChainId) return [];
    return availableTokens
      .filter(token => token !== 'ETH') // Skip native token
      .map(token => getTokenAddress(currentChainId, token as 'USDC' | 'DG' | 'G' | 'UP'));
  }, [currentChainId, availableTokens, getTokenAddress]);

  const { metadataMap } = useMultipleTokenMetadata(currentChainId, tokenAddresses);

  const tokensRequiringOnChainName = useMemo(() => {
    if (!currentChainId) return [];

    return availableTokens
      .filter(token => token !== 'ETH')
      .map(token => {
        const address = getTokenAddress(currentChainId, token as 'USDC' | 'DG' | 'G' | 'UP');
        return {
          token,
          address,
        };
      })
      .filter(entry => typeof entry.address === 'string' && !metadataMap[entry.address.toLowerCase()]?.name) as {
        token: string;
        address: string;
      }[];
  }, [currentChainId, availableTokens, getTokenAddress, metadataMap]);

  const onChainNameQueries = useQueries({
    queries: tokensRequiringOnChainName.map(entry => ({
      queryKey: tokenMetadataQueryKeys.byToken(currentChainId!, entry.address),
      queryFn: () => fetchTokenMetadata(currentChainId!, entry.address),
      enabled: Boolean(currentChainId && entry.address),
      staleTime: CACHE_TIMES.TOKEN_METADATA.STALE_TIME_MS,
      gcTime: CACHE_TIMES.TOKEN_METADATA.GARBAGE_COLLECTION_TIME_MS,
      retry: 2,
    })),
  });

  const onChainNameMap = useMemo(
    () =>
      Object.fromEntries(
        tokensRequiringOnChainName
        .map((entry, index) => [
            entry.address.toLowerCase(),
            onChainNameQueries[index].data?.name,
          ])
          .filter(([, name]) => Boolean(name))
      ) as Record<string, string>,
    [tokensRequiringOnChainName, onChainNameQueries]
  );

  const fiatEnabled = useMemo(() => {
    const raw = (import.meta as any).env?.VITE_ENABLE_FIAT;
    if (raw === undefined || raw === null || raw === '') return false;
    return String(raw).toLowerCase() === 'true';
  }, []);

  // Check if user has verified payout account for fiat payments
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccountInfo | null>(null);
  const [hasPayoutAccount, setHasPayoutAccount] = useState<boolean | null>(null);
  const [payoutAccountLoading, setPayoutAccountLoading] = useState(false);
  const [showPayoutDetails, setShowPayoutDetails] = useState(false);

  const checkPayoutAccount = useCallback(async () => {
    if (!authenticated || !fiatEnabled) return;
    setPayoutAccountLoading(true);
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

      setHasPayoutAccount(data?.can_receive_fiat_payments === true);

      if (data?.payout_account) {
        setPayoutAccount(data.payout_account as PayoutAccountInfo);
      } else {
        setPayoutAccount(null);
      }
    } catch {
      setHasPayoutAccount(false);
      setPayoutAccount(null);
    } finally {
      setPayoutAccountLoading(false);
    }
  }, [authenticated, fiatEnabled, getAccessToken, anonKey]);

  useEffect(() => {
    checkPayoutAccount();
  }, [checkPayoutAccount]);

  // Initialize chainId from first available network if not set
  useEffect(() => {
    if (!(formData as any).chainId && networks.length > 0) {
      updateFormData({ chainId: networks[0].chain_id } as any);
    }
  }, [networks, formData, updateFormData]);

  // Validation state for real-time feedback
  const [priceError, setPriceError] = useState<string>('');
  const [fiatPriceError, setFiatPriceError] = useState<string>('');

  useEffect(() => {
    // If selected currency is not available on current network, switch to ETH
    if (currentChainId && formData.paymentMethod === 'crypto') {
      const availableTokens = getAvailableTokens(currentChainId);
      if (!availableTokens.includes(formData.currency)) {
        updateFormData({ currency: 'ETH' });
      }
    }
  }, [currentChainId, formData.currency, formData.paymentMethod, getAvailableTokens, updateFormData]);

  // Re-validate price when currency changes
  useEffect(() => {
    if (formData.paymentMethod === 'crypto' && formData.price > 0) {
      const nativeCurrency = getNetworkByChainId(currentChainId)?.native_currency_symbol;
      const { error } = validateCryptoPrice(formData.price, formData.currency, nativeCurrency);
      setPriceError(error);
    }
  }, [formData.currency, formData.price, formData.paymentMethod, currentChainId, getNetworkByChainId]);

  useEffect(() => {
    if (!fiatEnabled && formData.paymentMethod === 'fiat') {
      updateFormData({ paymentMethod: 'free' });
    }
  }, [fiatEnabled, formData.paymentMethod, updateFormData]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Ticket Configuration</h2>
      </div>

      {/* Unlock Protocol Integration */}
      <Card className="border-purple-200 bg-purple-50/50">
        <CardHeader>
          {/* <CardTitle className="flex items-center gap-2 text-purple-900">
            <Shield className="w-5 h-5" />
            Unlock Protocol Integration
          </CardTitle> */}
          <CardDescription className="text-purple-700">
            Your tickets will be minted as NFTs on the blockchain for verification and authenticity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:items-center sm:text-left sm:justify-start">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <Zap className="w-3 h-3 mr-1" />
              Blockchain Enabled
            </Badge>
            <span className="text-sm text-gray-600"> Verifiable tickets</span>
          </div>
        </CardContent>
      </Card>

      {/* Network and Ticket Duration */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Ticket Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Ticket Duration</Label>
            <Select
              value={formData.ticketDuration}
              onValueChange={(value) => {
                updateFormData({
                  ticketDuration: value as any,
                  // Reset custom duration if switching away from custom
                  customDurationDays: value === 'custom' ? formData.customDurationDays : undefined
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="event">Until event ends</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
                <SelectItem value="unlimited">Unlimited</SelectItem>
                <SelectItem value="custom">Custom duration</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Network</Label>
            {isLoading ? (
              <div className="flex items-center gap-2 h-10 px-3 py-2 border rounded-md bg-gray-50">
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                <span className="text-sm text-gray-500">Loading networks...</span>
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : networks.length === 0 ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>No active networks available. Please contact administrator.</AlertDescription>
              </Alert>
            ) : (
              <Select
                value={currentChainId?.toString() || ''}
                onValueChange={(value) => updateFormData({ chainId: parseInt(value) } as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select network" />
                </SelectTrigger>
                <SelectContent>
                  {networks.map((network) => (
                    <SelectItem
                      key={network.chain_id}
                      value={network.chain_id.toString()}
                      disabled={!network.unlock_factory_address}
                    >
                      <div className="flex items-center gap-2">
                        <span>{network.chain_name}</span>
                        {network.is_mainnet && (
                          <Badge variant="secondary" className="text-xs">Mainnet</Badge>
                        )}
                        {!network.unlock_factory_address && (
                          <span className="text-xs text-amber-600">(No factory address)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {currentChainId && getNetworkByChainId(currentChainId) && !getNetworkByChainId(currentChainId)?.unlock_factory_address && (
              <p className="text-xs text-amber-600">
                This network does not have an Unlock factory address configured. Deployment may fail.
              </p>
            )}
          </div>

          {formData.ticketDuration === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="custom-duration">Custom Duration (days)</Label>
              <Input
                id="custom-duration"
                type="number"
                placeholder="Enter number of days"
                value={formData.customDurationDays || ''}
                onChange={(e) => updateFormData({ customDurationDays: parseInt(e.target.value) || 1 })}
                min="1"
                step="1"
              />
            </div>
          )}
        </div>
      </div>

      {/* Payment Method */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Payment Method</h3>
        <RadioGroup
          value={formData.paymentMethod}
          onValueChange={(v) => updateFormData({ paymentMethod: v as any })}
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem id="pm-free" value="free" />
            <Label htmlFor="pm-free">Free</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem id="pm-crypto" value="crypto" />
            <Label htmlFor="pm-crypto" className="flex items-center gap-2">
              <Shield className="w-4 h-4" /> Crypto
            </Label>
          </div>
          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-2">
              <RadioGroupItem id="pm-fiat" value="fiat" disabled={!fiatEnabled} />
              <Label
                htmlFor="pm-fiat"
                className={`flex items-center gap-2 ${!fiatEnabled ? 'text-gray-400' : ''}`}
              >
                <CreditCard className="w-4 h-4" /> Fiat (NGN via Paystack)
              </Label>
            </div>
            {!fiatEnabled && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Fiat checkout status"
                    className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 rounded-full p-1 transition-colors"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="text-sm font-medium text-gray-700 max-w-xs">
                  Fiat checkout is temporarily unavailable.
                </PopoverContent>
              </Popover>
            )}
          </div>
        </RadioGroup>
      </div>

      {/* Crypto Pricing */}
      {formData.paymentMethod === 'crypto' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Crypto Pricing</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => updateFormData({ currency: value as CryptoCurrency })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTokens.map(token => {
                    // For native token (ETH), use network's native currency symbol
                    if (token === 'ETH') {
                      const nativeSymbol = getNetworkByChainId(currentChainId)?.native_currency_symbol || 'ETH';
                      const nativeName = getNetworkByChainId(currentChainId)?.native_currency_name || 'Ethereum';
                      return (
                        <SelectItem key={token} value={token}>
                          <div className="flex items-baseline gap-2">
                            <span>{nativeSymbol}</span>
                            <span className="text-xs text-gray-500">{nativeName}</span>
                          </div>
                        </SelectItem>
                      );
                    }

                    // For ERC20 tokens, fetch metadata from contracts
                    const tokenAddr = getTokenAddress(currentChainId, token as 'USDC' | 'DG' | 'G' | 'UP');
                    const metadata = tokenAddr ? metadataMap[tokenAddr.toLowerCase()] : null;
                    const displayName =
                      (tokenAddr && onChainNameMap[tokenAddr.toLowerCase()]) || metadata?.name;

                    return (
                      <SelectItem key={token} value={token}>
                        <div className="flex items-baseline gap-2">
                          <span>{metadata?.symbol || token}</span>
                          {displayName && (
                            <span className="text-xs text-gray-500">{displayName}</span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">
                Price
                {usesWholeNumberPricing(formData.currency) && (
                  <span className="text-xs text-gray-500 ml-2">(min: {getWholeNumberTokenMinimum(formData.currency)} {formData.currency})</span>
                )}
                {!usesWholeNumberPricing(formData.currency) && (
                  <span className="text-xs text-gray-500 ml-2">(min: {MIN_NATIVE_TOKEN_PRICE} {getNetworkByChainId(currentChainId)?.native_currency_symbol || 'native'})</span>
                )}
              </Label>
              <Input
                id="price"
                type="number"
                placeholder={getPricePlaceholder(formData.currency)}
                value={formData.price}
                onChange={(e) => {
                  const newPrice = parseFloat(e.target.value) || 0;
                  updateFormData({ price: newPrice });
                  // Clear error on change
                  if (priceError) setPriceError('');
                }}
                onBlur={() => {
                  // Validate on blur
                  const nativeCurrency = getNetworkByChainId(currentChainId)?.native_currency_symbol;
                  const { error } = validateCryptoPrice(formData.price || 0, formData.currency, nativeCurrency);
                  setPriceError(error);
                }}
                min={usesWholeNumberPricing(formData.currency) ? getWholeNumberTokenMinimum(formData.currency).toString() : MIN_NATIVE_TOKEN_PRICE.toString()}
                step={getPriceStep(formData.currency)}
                className={priceError ? 'border-red-500' : ''}
              />
              {priceError && (
                <p className="text-xs text-red-600">
                  {priceError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NGN Pricing */}
      {formData.paymentMethod === 'fiat' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Fiat Pricing (NGN)</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ngn-price">
                Price (NGN)
                <span className="text-xs text-gray-500 ml-2">(min: ₦{MIN_NGN_PRICE.toLocaleString()})</span>
              </Label>
              <Input
                id="ngn-price"
                type="number"
                placeholder={MIN_NGN_PRICE.toString()}
                value={formData.ngnPrice}
                onChange={(e) => {
                  const newPrice = parseFloat(e.target.value) || 0;
                  updateFormData({ ngnPrice: newPrice });
                  if (fiatPriceError) setFiatPriceError('');
                }}
                onBlur={() => {
                  const { error } = validateFiatPrice(formData.ngnPrice || 0);
                  setFiatPriceError(error);
                }}
                min={MIN_NGN_PRICE}
                step="100"
                className={fiatPriceError ? 'border-red-500' : ''}
              />
              {fiatPriceError && (
                <p className="text-xs text-red-600">
                  {fiatPriceError}
                </p>
              )}
            </div>

            {/* Paystack key is provided via env; no input */}
          </div>

          {/* Payout Account Status */}
          {payoutAccountLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking payout account status...
            </div>
          )}

          {/* Payout Account Warning - No verified account */}
          {hasPayoutAccount === false && !payoutAccountLoading && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Payout Account Required</AlertTitle>
              <AlertDescription className="text-amber-700">
                To receive fiat payments, you need a verified payout account.
                You can still create this event as a draft, but fiat payments won't work until you set up your payout account.
                <Link
                  to="/vendor/payout-account"
                  className="block mt-2 font-medium text-amber-900 hover:underline"
                >
                  Set up Payout Account →
                </Link>
              </AlertDescription>
            </Alert>
          )}

          {/* Payout Account Info - Verified account */}
          {hasPayoutAccount === true && payoutAccount && !payoutAccountLoading && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <h4 className="font-medium text-green-900 flex items-center gap-2">
                      Payout Account Verified
                      <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                        {payoutAccount.provider.toUpperCase()}
                      </Badge>
                    </h4>
                    <div className="mt-2 text-sm text-green-800 space-y-1">
                      <p className="flex items-center gap-2">
                        <span className="text-green-600 font-medium">Account:</span>
                        <span className="font-mono">{payoutAccount.account_number}</span>
                      </p>
                      {payoutAccount.settlement_bank_name && (
                        <p className="flex items-center gap-2">
                          <span className="text-green-600 font-medium">Bank:</span>
                          <span>{payoutAccount.settlement_bank_name}</span>
                        </p>
                      )}
                      {showPayoutDetails && (
                        <>
                          {payoutAccount.account_holder_name && (
                            <p className="flex items-center gap-2">
                              <span className="text-green-600 font-medium">Name:</span>
                              <span>{payoutAccount.account_holder_name}</span>
                            </p>
                          )}
                          <p className="flex items-center gap-2">
                            <span className="text-green-600 font-medium">Business:</span>
                            <span>{payoutAccount.business_name}</span>
                          </p>
                          <p className="flex items-center gap-2">
                            <span className="text-green-600 font-medium">Commission:</span>
                            <span>{payoutAccount.percentage_charge}% platform fee</span>
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPayoutDetails(!showPayoutDetails)}
                  className="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-md transition-colors"
                  aria-label={showPayoutDetails ? 'Hide details' : 'Show details'}
                >
                  {showPayoutDetails ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="mt-3 text-xs text-green-700">
                Fiat payments for this event will be deposited to this account after platform fees.
              </p>
            </div>
          )}

          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <CreditCard className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">Paystack Integration</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Nigerian users can pay with cards, bank transfers, and mobile money
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1">
                  <li>• Instant payment confirmation</li>
                  <li>• Multiple payment methods</li>
                  <li>• Automatic receipt generation</li>
                  <li>• Secure transaction processing</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NFT Benefits for Paid Events */}
      {formData.paymentMethod === 'crypto' && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <Ticket className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900">NFT Ticket Benefits</h4>
              <p className="text-sm text-blue-700 mt-1">
                Paid crypto tickets will be minted as NFTs, providing:
              </p>
              <ul className="text-sm text-blue-700 mt-2 space-y-1">
                <li>• Transferable tickets</li>
                <li>• Proof of attendance (POAP)</li>
                <li>• Secondary market trading</li>
                <li>• Fraud prevention</li>
              </ul>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
