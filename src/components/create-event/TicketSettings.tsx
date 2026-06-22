
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { ethers } from 'ethers';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Shield, Zap, Ticket, CreditCard, Info, Loader2, AlertCircle, AlertTriangle, Eye, EyeOff, CheckCircle2, MessageSquareText } from 'lucide-react';
import { EventFormData } from '@/pages/CreateEvent';
import { RichTextEditor } from '@/components/ui/rich-text/RichTextEditor';
import { isEmptyHtml } from '@/utils/textUtils';
import { PURCHASE_MESSAGE_MAX_LENGTH } from '@/utils/purchaseMessage';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { useMultipleTokenMetadata, tokenMetadataQueryKeys, fetchTokenMetadata } from '@/hooks/useTokenMetadata';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { validateCryptoPrice, validateFiatPrice, getPricePlaceholder, getPriceStep, MIN_NATIVE_TOKEN_PRICE, MIN_NGN_PRICE, getWholeNumberTokenMinimum } from '@/utils/priceUtils';
import type { CryptoCurrency } from '@/types/currency';
import { usesWholeNumberPricing } from '@/types/currency';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { useQueries } from '@tanstack/react-query';
import { CACHE_TIMES } from '@/lib/config/react-query-config';
import { getDefaultRefundTriggerIso, getEventEndIso, getEventStartIso } from '@/utils/eventTime';
import { previewProtectedEventReserveBond, type ProtectedReserveBondPreview, getTicketExpirationSeconds, MIN_PROTECTED_EXPIRATION_SECONDS, MIN_PROTECTED_EXPIRATION_DAYS } from '@/utils/lockUtils';
import { PurchaseFormBuilder } from '@/components/create-event/PurchaseFormBuilder';
import { PayoutDestinationField, type PayoutDestination } from '@/components/vendor/PayoutDestinationField';

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

const toDateTimeLocalValue = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatTokenAmount = (value: string, decimals: number): string => {
  const formatted = ethers.formatUnits(value, decimals);
  const [whole, fractional] = formatted.split('.');
  if (!fractional) return whole;
  const trimmedFractional = fractional.replace(/0+$/, '').slice(0, 8);
  return trimmedFractional ? `${whole}.${trimmedFractional}` : whole;
};

export const TicketSettings: React.FC<TicketSettingsProps> = ({
  formData,
  updateFormData,
}) => {
  const { authenticated, getAccessToken } = usePrivy();
  const { networks, isLoading, error, getNetworkByChainId, getAvailableTokens, getTokenAddress } = useNetworkConfigs();

  // Check if current network supports selected currency
  const currentChainId = (formData as any).chainId;
  const currentNetwork = currentChainId ? getNetworkByChainId(currentChainId) : undefined;
  const hasRefundManager = Boolean(currentNetwork?.refundable_event_manager_address);
  const isPaidCrypto = formData.paymentMethod === 'crypto' && Number(formData.price) > 0;

  // Protected (refund-enabled) events must keep keys valid through the refund
  // window, otherwise the controller skips expired keys and those holders go
  // unrefunded. Enforce a minimum ticket duration on the client.
  const protectionActive = Boolean(formData.refundProtectionEnabled);
  const protectedDurationInvalid =
    protectionActive &&
    getTicketExpirationSeconds(formData.ticketDuration, formData.customDurationDays) < MIN_PROTECTED_EXPIRATION_SECONDS;

  const refundTriggerValue = toDateTimeLocalValue(formData.refundTriggerAt);
  const refundEndAt = useMemo(() => {
    try {
      return getEventEndIso(formData);
    } catch {
      return null;
    }
  }, [formData]);
  const refundTriggerInvalid = Boolean(
    formData.refundProtectionEnabled &&
    formData.refundTriggerAt &&
    refundEndAt &&
    new Date(formData.refundTriggerAt).getTime() >= new Date(refundEndAt).getTime()
  );
  const refundTriggerAfterStart = useMemo(() => {
    if (!formData.refundProtectionEnabled || !formData.refundTriggerAt) return false;
    try {
      const startsAt = getEventStartIso(formData);
      if (!startsAt) return false;
      return new Date(formData.refundTriggerAt).getTime() > new Date(startsAt).getTime();
    } catch {
      return false;
    }
  }, [formData]);

  const handleRefundProtectionToggle = (checked: boolean) => {
    if (!checked) {
      updateFormData({
        refundProtectionEnabled: false,
        refundMinAttendees: undefined,
        refundTriggerAt: null,
        refundEventEndAt: null,
        refundReserveBond: null,
      } as any);
      return;
    }

    const startsAt = getEventStartIso(formData);
    const endsAt = getEventEndIso(formData);
    const defaultMin = Math.min(
      Number(formData.capacity) || 1,
      Math.max(1, Math.ceil((Number(formData.capacity) || 1) / 2))
    );

    // If the current ticket duration would expire keys before the refund window,
    // snap it up to "1 year" so protected refunds can reach every attendee.
    const durationNeedsBump =
      getTicketExpirationSeconds(formData.ticketDuration, formData.customDurationDays) < MIN_PROTECTED_EXPIRATION_SECONDS;

    updateFormData({
      refundProtectionEnabled: true,
      refundMinAttendees: formData.refundMinAttendees || defaultMin,
      refundTriggerAt: formData.refundTriggerAt || getDefaultRefundTriggerIso(startsAt),
      refundEventEndAt: endsAt,
      refundReserveBond: null,
      transferable: false,
      ...(durationNeedsBump
        ? { ticketDuration: '365' as any, customDurationDays: undefined }
        : {}),
    } as any);
  };

  useEffect(() => {
    if (!formData.refundProtectionEnabled) return;
    if (isPaidCrypto && hasRefundManager) return;

    updateFormData({
      refundProtectionEnabled: false,
      refundMinAttendees: undefined,
      refundTriggerAt: null,
      refundEventEndAt: null,
      refundReserveBond: null,
    } as any);
  }, [formData.refundProtectionEnabled, hasRefundManager, isPaidCrypto, updateFormData]);

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
      const data = await callEdgeFunction<any>('get-vendor-payout-account', {}, { privyToken: token, withAnonKey: true });

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
  }, [authenticated, fiatEnabled, getAccessToken]);

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
  const [purchaseMessageEnabled, setPurchaseMessageEnabled] = useState<boolean>(
    () => Boolean(formData.purchaseConfirmationMessage && !isEmptyHtml(formData.purchaseConfirmationMessage))
  );

  useEffect(() => {
    if (formData.purchaseConfirmationMessage && !isEmptyHtml(formData.purchaseConfirmationMessage)) {
      setPurchaseMessageEnabled(true);
    }
  }, [formData.purchaseConfirmationMessage]);

  const handleTogglePurchaseMessage = (checked: boolean) => {
    if (!checked) {
      const hasContent = Boolean(
        formData.purchaseConfirmationMessage && !isEmptyHtml(formData.purchaseConfirmationMessage)
      );
      if (hasContent) {
        const confirmed = typeof window !== 'undefined'
          ? window.confirm('Hide and clear the post-purchase message? You can re-enable it any time.')
          : true;
        if (!confirmed) return;
        updateFormData({ purchaseConfirmationMessage: null });
      }
      setPurchaseMessageEnabled(false);
      return;
    }
    setPurchaseMessageEnabled(true);
  };
  const [reserveBondPreview, setReserveBondPreview] = useState<ProtectedReserveBondPreview | null>(null);
  const [reserveBondPreviewError, setReserveBondPreviewError] = useState('');
  const [reserveBondPreviewLoading, setReserveBondPreviewLoading] = useState(false);
  const reserveBondPreviewRequestIdRef = useRef(0);

  const clearReserveBondPreview = useCallback(() => {
    reserveBondPreviewRequestIdRef.current += 1;
    setReserveBondPreview(null);
    setReserveBondPreviewError('');
    setReserveBondPreviewLoading(false);
    updateFormData({ refundReserveBond: null } as any);
  }, [updateFormData]);

  const refreshReserveBondPreview = useCallback(async (
    params: {
      chainId?: number;
      currency: CryptoCurrency;
      price: number;
      minAttendees?: number;
      refundProtectionEnabled?: boolean;
      capacity: number;
      allowPreview: boolean;
    }
  ) => {
    const {
      chainId,
      currency,
      price,
      minAttendees,
      refundProtectionEnabled,
      capacity,
      allowPreview,
    } = params;

    if (
      !refundProtectionEnabled ||
      !allowPreview ||
      !chainId ||
      !price ||
      !minAttendees ||
      minAttendees > capacity
    ) {
      clearReserveBondPreview();
      return;
    }

    const requestId = ++reserveBondPreviewRequestIdRef.current;
    setReserveBondPreviewLoading(true);
    setReserveBondPreviewError('');

    try {
      const preview = await previewProtectedEventReserveBond(
        chainId,
        currency,
        price,
        minAttendees
      );

      if (requestId !== reserveBondPreviewRequestIdRef.current) return;
      setReserveBondPreview(preview);
      updateFormData({ refundReserveBond: preview.reserveBond } as any);
    } catch (error) {
      if (requestId !== reserveBondPreviewRequestIdRef.current) return;
      setReserveBondPreview(null);
      setReserveBondPreviewError(error instanceof Error ? error.message : 'Failed to estimate reserve bond.');
      updateFormData({ refundReserveBond: null } as any);
    } finally {
      if (requestId !== reserveBondPreviewRequestIdRef.current) return;
      setReserveBondPreviewLoading(false);
    }
  }, [
    clearReserveBondPreview,
    updateFormData,
  ]);

  useEffect(() => {
    if (!formData.refundProtectionEnabled || !isPaidCrypto || !hasRefundManager || !currentChainId) {
      clearReserveBondPreview();
      return;
    }

    void refreshReserveBondPreview({
      chainId: currentChainId,
      currency: formData.currency,
      price: formData.price,
      minAttendees: formData.refundMinAttendees,
      refundProtectionEnabled: formData.refundProtectionEnabled,
      capacity: formData.capacity,
      allowPreview: isPaidCrypto && hasRefundManager,
    });
  }, [
    clearReserveBondPreview,
    currentChainId,
    formData.capacity,
    formData.currency,
    formData.refundProtectionEnabled,
    hasRefundManager,
    isPaidCrypto,
    refreshReserveBondPreview,
  ]);

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
                <SelectItem value="event" disabled={protectionActive}>Until event ends</SelectItem>
                <SelectItem value="30" disabled={protectionActive}>30 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
                <SelectItem value="unlimited">Unlimited</SelectItem>
                <SelectItem value="custom">Custom duration</SelectItem>
              </SelectContent>
            </Select>
            {protectionActive && (
              <p className="text-xs text-gray-500">
                Protected events require tickets to stay valid for at least {MIN_PROTECTED_EXPIRATION_DAYS} days so refunds can reach every attendee if the event fails.
              </p>
            )}
            {protectedDurationInvalid && (
              <p className="text-xs text-red-600">
                Ticket duration must be at least {MIN_PROTECTED_EXPIRATION_DAYS} days for protected events.
              </p>
            )}
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
                min={protectionActive ? MIN_PROTECTED_EXPIRATION_DAYS.toString() : '1'}
                step="1"
                className={protectedDurationInvalid ? 'border-red-500' : ''}
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
                onValueChange={(value) => {
                  clearReserveBondPreview();
                  updateFormData({ currency: value as CryptoCurrency });
                }}
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
                  clearReserveBondPreview();
                  updateFormData({ price: newPrice });
                  // Clear error on change
                  if (priceError) setPriceError('');
                }}
                onBlur={async () => {
                  // Validate on blur
                  const nativeCurrency = getNetworkByChainId(currentChainId)?.native_currency_symbol;
                  const { error } = validateCryptoPrice(formData.price || 0, formData.currency, nativeCurrency);
                  setPriceError(error);
                  if (!error && formData.refundProtectionEnabled) {
                    await refreshReserveBondPreview({
                      chainId: currentChainId,
                      currency: formData.currency,
                      price: formData.price,
                      minAttendees: formData.refundMinAttendees,
                      refundProtectionEnabled: formData.refundProtectionEnabled,
                      capacity: formData.capacity,
                      allowPreview: isPaidCrypto && hasRefundManager,
                    });
                  }
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

      {formData.paymentMethod === 'crypto' && (
        <Card className="border-slate-200">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="refund-protection" className="text-base font-medium">
                  Minimum attendance protection
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  If the event misses the minimum before the trigger time, paid attendees will be refunded in full.
                </p>
              </div>
              <Switch
                id="refund-protection"
                checked={Boolean(formData.refundProtectionEnabled)}
                disabled={!isPaidCrypto || !hasRefundManager}
                onCheckedChange={handleRefundProtectionToggle}
              />
            </div>

            {!isPaidCrypto && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Refund protection is available only for paid crypto events.
                </AlertDescription>
              </Alert>
            )}

            {isPaidCrypto && !hasRefundManager && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This network does not have a refundable event manager configured.
                </AlertDescription>
              </Alert>
            )}

            {formData.refundProtectionEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="refund-min-attendees">Minimum attendees</Label>
                  <Input
                    id="refund-min-attendees"
                    type="number"
                    value={formData.refundMinAttendees || ''}
                    min="1"
                    max={formData.capacity}
                    step="1"
                    onChange={(e) => {
                      clearReserveBondPreview();
                      updateFormData({
                        refundMinAttendees: parseInt(e.target.value, 10) || 1,
                        transferable: false,
                      } as any);
                    }}
                    onBlur={() => {
                      void refreshReserveBondPreview({
                        chainId: currentChainId,
                        currency: formData.currency,
                        price: formData.price,
                        minAttendees: formData.refundMinAttendees,
                        refundProtectionEnabled: formData.refundProtectionEnabled,
                        capacity: formData.capacity,
                        allowPreview: isPaidCrypto && hasRefundManager,
                      });
                    }}
                  />
                  {formData.refundMinAttendees && formData.refundMinAttendees > formData.capacity && (
                    <p className="text-xs text-red-600">Minimum attendees cannot exceed capacity.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refund-trigger-at">Refund trigger time</Label>
                  <Input
                    id="refund-trigger-at"
                    type="datetime-local"
                    value={refundTriggerValue}
                    onChange={(e) => {
                      const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                      updateFormData({
                        refundTriggerAt: value,
                        refundEventEndAt: refundEndAt,
                        transferable: false,
                      } as any);
                    }}
                  />
                  {(refundTriggerInvalid || refundTriggerAfterStart) && (
                    <p className="text-xs text-red-600">
                      Refund trigger must be before event end and no later than event start.
                    </p>
                  )}
                </div>

                <div className="md:col-span-2 rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800">
                  The event only qualifies as successful if the minimum attendees are reached by the refund trigger time. If that threshold is missed when the trigger time arrives, paid attendees will be refunded in full.
                </div>

                <div className="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
                    <div className="space-y-2 text-amber-900">
                      <div className="font-medium">Reserve bond required before deployment</div>
                      <p className="text-amber-800">
                        Protected events require a reserve bond up front so refunds can be covered if the attendance threshold is missed. This bond is separate from gas.
                      </p>
                      {reserveBondPreviewLoading && (
                        <div className="flex items-center gap-2 text-amber-800">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Calculating reserve bond estimate...</span>
                        </div>
                      )}
                      {!reserveBondPreviewLoading && reserveBondPreview && (
                        <div className="rounded-md border border-amber-200 bg-white/80 p-3">
                          <div className="text-base font-semibold text-amber-950">
                            Estimated reserve bond: {formatTokenAmount(reserveBondPreview.reserveBond, reserveBondPreview.decimals)} {reserveBondPreview.symbol}
                          </div>
                          <p className="mt-1 text-xs text-amber-800">
                            Based on {formData.refundMinAttendees} required attendee{formData.refundMinAttendees === 1 ? '' : 's'} at the current ticket price. If unused for refunds the reserve bond can be withdrawn
                          </p>
                        </div>
                      )}
                      {!reserveBondPreviewLoading && reserveBondPreviewError && (
                        <p className="text-xs text-red-700">{reserveBondPreviewError}</p>
                      )}
                      {!reserveBondPreviewLoading && !reserveBondPreview && !reserveBondPreviewError && (
                        <p className="text-xs text-amber-800">
                          Enter a valid paid ticket price and minimum attendee count, then leave the input field to calculate the reserve bond estimate.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* NGN Pricing */}
      {formData.paymentMethod === 'fiat' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Fiat Pricing (NGN)</h3>

          <PayoutDestinationField
            value={(formData.payoutDestination as PayoutDestination) || 'seller'}
            onChange={(v) => updateFormData({ payoutDestination: v } as Partial<EventFormData>)}
            noun="event"
            commissionPercent={payoutAccount?.percentage_charge}
          />

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

          {/* Platform-routed: proceeds go to the platform, no payout account needed. */}
          {((formData.payoutDestination as PayoutDestination) || 'seller') === 'platform' && (
            <Alert className="bg-blue-50 border-blue-200">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800">Proceeds go to the platform</AlertTitle>
              <AlertDescription className="text-blue-700">
                Fiat payments for this event settle to the TeeRex platform account — no payout account
                needed. Use this for platform-run, sponsored, or community events you aren't collecting for.
              </AlertDescription>
            </Alert>
          )}

          {/* Payout Account Warning - No verified account (only when routing to the seller) */}
          {((formData.payoutDestination as PayoutDestination) || 'seller') === 'seller' && hasPayoutAccount === false && !payoutAccountLoading && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Payout Account Required</AlertTitle>
              <AlertDescription className="text-amber-700">
                To receive fiat payments, you need a verified payout account.
                You can still create this event as a draft, but fiat payments won't work until you set up your payout account.
                <Link
                  to="/vendor/payout-account"
                  state={{ returnTo: '/create' }}
                  className="block mt-2 font-medium text-amber-900 hover:underline"
                >
                  Set up Payout Account →
                </Link>
              </AlertDescription>
            </Alert>
          )}

          {/* Payout Account Info - Verified account (only when routing to the seller) */}
          {((formData.payoutDestination as PayoutDestination) || 'seller') === 'seller' && hasPayoutAccount === true && payoutAccount && !payoutAccountLoading && (
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

      {/* Optional post-purchase message */}
      <Card className="border-slate-200">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <Label htmlFor="purchase-message-toggle" className="text-base font-medium flex items-center gap-2">
                <MessageSquareText className="w-4 h-4 text-purple-600" />
                Add message after purchase
              </Label>
              <p className="text-sm text-gray-600">
                Shown after a ticket is successfully issued and included in ticket emails. You can edit this later from Manage Event.
              </p>
            </div>
            <Switch
              id="purchase-message-toggle"
              checked={purchaseMessageEnabled}
              onCheckedChange={handleTogglePurchaseMessage}
            />
          </div>

          {purchaseMessageEnabled && (
            <div className="space-y-2">
              <RichTextEditor
                value={formData.purchaseConfirmationMessage || ''}
                onChange={(value) => updateFormData({ purchaseConfirmationMessage: value })}
                placeholder="e.g. Doors open at 6pm. Bring your ID. Join our community at..."
              />
              <p className="text-xs text-gray-500">
                Up to {PURCHASE_MESSAGE_MAX_LENGTH.toLocaleString()} characters of HTML. Avoid putting personal access codes here — every attendee receives the same message and keeps a copy.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom required purchase inputs */}
      <PurchaseFormBuilder
        schema={formData.purchaseFormSchema ?? null}
        onChange={(next) => updateFormData({ purchaseFormSchema: next })}
      />

      {/* NFT Benefits for Paid Events */}
      {formData.paymentMethod === 'crypto' && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <Ticket className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900">
                {formData.refundProtectionEnabled ? 'Protected Event Rules' : 'NFT Ticket Benefits'}
              </h4>
              <p className="text-sm text-blue-700 mt-1">
                {formData.refundProtectionEnabled
                  ? 'Protected events have these rules:'
                  : 'Crypto events have these benefits:'}
              </p>
              <ul className="text-sm text-blue-700 mt-2 space-y-1">
                {formData.refundProtectionEnabled ? (
                  <>
                    <li>• Onchain ticket configurations stay locked while protection is active</li>
                    <li>• The event protection only clears once the minimum attendees are reached by the refund trigger time</li>
                    <li>• Paid attendees should be refunded in full if the minimum attendees threshold is missed at trigger time</li>
                    <li>• Creator control and withdrawals stay locked if threshold is missed and attendees are not refunded</li>
                    <li>• Any ticket buyer can trigger the refund before the event end time (refund window) if the threshold is missed.</li>
                    <li>• After the refund window only the creator can initiate refund</li>
                  </>
                ) : (
                  <>
                    <li>• Transferable tickets (If enabled)</li>
                    <li>• Proof of attendance (POAP)</li>
                    <li>• Secondary market trading (If transferable)</li>
                    <li>• Fraud prevention</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
