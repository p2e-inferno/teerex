import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { ArrowLeft, Banknote, CheckCircle2, Clock, Copy, Eye, KeyRound, Loader2, MailCheck, RefreshCw, RotateCw, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldHelp, FieldLabel } from '@/components/ui/field-help';
import { Textarea } from '@/components/ui/textarea';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { formatNairaFromKobo, nairaInputValueFromKobo, nairaToKobo } from '@/lib/currency';
import { formatERC20Balance } from '@/utils/balanceHelpers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DgRedemptionConfig {
  enabled: boolean;
  supported_chains: number[];
  wallets_by_chain: Record<string, string>;
  quote_ttl_seconds: number;
  required_confirmations: number;
  paystack_balance_cap_enabled: boolean;
  limits: {
    min_dg: string;
    max_dg: string;
    min_gross_ngn_kobo: number;
    per_user_daily_ngn_kobo: number;
    platform_daily_ngn_kobo: number;
    manual_review_ngn_kobo: number;
  };
  service_fee: {
    bps: number;
    min_kobo: number;
    max_kobo: number;
  };
  tax: {
    enabled: boolean;
    vat_bps: number;
    basis: 'service_fee' | 'none';
  };
}

interface NetworkConfig {
  chain_id: number;
  chain_name: string;
  is_active: boolean;
}

interface DashboardData {
  provider_health: {
    paystack_balance_kobo: number | null;
    error: string | null;
  };
  summary_24h: {
    count: number;
    by_status: Record<string, number>;
    gross_kobo: number;
    net_payout_kobo: number;
    fees_kobo: number;
  };
  recent_redemptions: Array<{
    id: string;
    user_id: string;
    wallet_address: string;
    chain_id: number;
    status: string;
    amount_dg_raw: string;
    gross_ngn_kobo: number;
    service_fee_kobo: number;
    vat_kobo: number;
    total_fee_kobo: number;
    net_payout_kobo: number;
    tx_hash: string | null;
    paystack_reference: string | null;
    paystack_status: string | null;
    paystack_transfer_code: string | null;
    paystack_transfer_id: string | null;
    last_error: string | null;
    expires_at: string;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    payout_account?: {
      id: string;
      account_holder_name: string;
      bank_name: string;
      account_number_last4: string;
      status: string;
    } | null;
  }>;
}

interface DgRedemptionDiagnostics {
  paystack_balance: {
    available_kobo: number | null;
    status: 'ok' | 'disabled' | 'error';
    error?: string;
  };
  chains: Array<{
    chain_id: number;
    chain_name: string;
    supported: boolean;
    redemption_wallet_address: string | null;
    token_config_matches: boolean | null;
    paused: boolean | null;
    exchange_rate: string | null;
    sell_fee_bps: number | null;
    vendor_up_balance_raw: string | null;
    vendor_up_balance_decimals: number | null;
    status: 'ok' | 'warning' | 'error';
    error?: string;
  }>;
}

type DgRedemptionRow = DashboardData['recent_redemptions'][number];

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'completed') return 'default';
  if (['failed', 'expired', 'cancelled'].includes(status)) return 'destructive';
  if (['manual_review', 'payout_processing', 'payout_pending'].includes(status)) return 'secondary';
  return 'outline';
};

const formatStatus = (status: string) => {
  const labels: Record<string, string> = {
    payout_pending: 'Payout pending',
    payout_processing: 'Payout processing',
    completed: 'Paid',
    failed: 'Payout failed',
    manual_review: 'Under review',
  };
  return labels[status] || status.replace(/_/g, ' ');
};
const displayRowStatus = (row: { status: string; expires_at?: string | null }) => {
  const expiresAtMs = row.expires_at ? new Date(row.expires_at).getTime() : Number.NaN;
  if (row.status === 'awaiting_transfer' && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    return 'expired';
  }
  return row.status;
};

const bpsToPercent = (bps?: number | null): number => Number(bps || 0) / 100;
const percentToBps = (percent: string | number): number => {
  const value = typeof percent === 'number' ? percent : Number(percent);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
};
const percentInputValueFromBps = (bps?: number | null): string => String(bpsToPercent(bps));
const formatPercentFromBps = (bps?: number | null): string => `${bpsToPercent(bps).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
const formatUpBalance = (raw?: string | null, decimals?: number | null): string => {
  if (!raw || decimals === null || decimals === undefined) return 'n/a';
  if (!Number.isInteger(decimals) || decimals < 0) return 'n/a';
  try {
    return formatERC20Balance(BigInt(raw), 'UP', decimals);
  } catch {
    return 'n/a';
  }
};

const stableStringify = (value: unknown): string => JSON.stringify(value);

const canReconcileStatus = (status: string) => ['failed', 'payout_pending', 'payout_processing'].includes(status);
const PAYSTACK_ACTIVE_STATUSES = new Set(['otp', 'pending', 'received', 'queued', 'processing']);
const PAYSTACK_TERMINAL_FAILURE_STATUSES = new Set(['failed', 'reversed', 'abandoned', 'rejected', 'blocked']);
const isPaystackTransferActive = (status?: string | null) => PAYSTACK_ACTIVE_STATUSES.has(String(status || '').toLowerCase());
const isPaystackTransferTerminalFailure = (status?: string | null) => PAYSTACK_TERMINAL_FAILURE_STATUSES.has(String(status || '').toLowerCase());
const canRetryPayout = (row: DgRedemptionRow) =>
  ['failed', 'manual_review'].includes(row.status) && !isPaystackTransferActive(row.paystack_status);
const canFinalizeOtp = (row: DgRedemptionRow) =>
  Boolean(row.tx_hash && row.paystack_transfer_code && row.status === 'manual_review' && String(row.paystack_status || '').toLowerCase() === 'otp');
const canMarkManualPaidStatus = (row: DgRedemptionRow) => {
  if (!row.tx_hash || !['failed', 'manual_review', 'payout_pending', 'payout_processing'].includes(row.status)) return false;
  const hasPaystackTransfer = Boolean(row.paystack_transfer_code || row.paystack_transfer_id);
  if (!row.paystack_status && !hasPaystackTransfer) return true;
  if (isPaystackTransferActive(row.paystack_status) || String(row.paystack_status || '').toLowerCase() === 'success') return false;
  return isPaystackTransferTerminalFailure(row.paystack_status);
};

const formatLastError = (error?: string | null) => {
  const labels: Record<string, string> = {
    paystack_otp_required: 'Paystack OTP required',
    paystack_transfer_not_found: 'Paystack transfer not found',
    paystack_transfer_failed: 'Paystack transfer failed',
    paystack_transfer_reversed: 'Paystack transfer reversed',
    paystack_transfer_abandoned: 'Paystack transfer abandoned',
    paystack_transfer_rejected: 'Paystack transfer rejected',
    paystack_transfer_blocked: 'Paystack transfer blocked',
    manual_review_required: 'Manual review required',
    expired_quote_transfer_submitted: 'Expired quote transfer submitted',
  };
  return error ? labels[error] || error : null;
};

const ActionButton: React.FC<React.ComponentProps<typeof Button> & { label: string }> = ({
  label,
  children,
  ...buttonProps
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="inline-flex">
        <Button aria-label={label} title={label} {...buttonProps}>
          {children}
        </Button>
      </span>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

const NairaInput: React.FC<{
  valueKobo: number;
  onChangeKobo: (value: number) => void;
}> = ({ valueKobo, onChangeKobo }) => (
  <Input
    type="number"
    min={0}
    step={1}
    value={nairaInputValueFromKobo(valueKobo)}
    onChange={(event) => onChangeKobo(nairaToKobo(event.target.value))}
  />
);

const PercentInput: React.FC<{
  valueBps: number;
  onChangeBps: (value: number) => void;
}> = ({ valueBps, onChangeBps }) => (
  <Input
    type="number"
    min={0}
    step={0.01}
    value={percentInputValueFromBps(valueBps)}
    onChange={(event) => onChangeBps(percentToBps(event.target.value))}
  />
);

const AdminDgRedemption: React.FC = () => {
  const { getAccessToken } = usePrivy();
  const [config, setConfig] = useState<DgRedemptionConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<DgRedemptionConfig | null>(null);
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [diagnostics, setDiagnostics] = useState<DgRedemptionDiagnostics | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpiring, setIsExpiring] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [manualPaidTarget, setManualPaidTarget] = useState<DgRedemptionRow | null>(null);
  const [manualPaymentReference, setManualPaymentReference] = useState('');
  const [manualPaymentNote, setManualPaymentNote] = useState('');
  const [otpTarget, setOtpTarget] = useState<DgRedemptionRow | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [otpSubmittingId, setOtpSubmittingId] = useState<string | null>(null);
  const [otpResendingId, setOtpResendingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await getAccessToken();
      const [configData, dashboardData] = await Promise.all([
        callEdgeFunction<any>('get-dg-redemption-config', {}, {
          privyToken: token,
          withAnonKey: true,
          method: 'GET',
        }),
        callEdgeFunction<any>('get-dg-redemption-admin-dashboard', {}, {
          privyToken: token,
          withAnonKey: true,
          method: 'GET',
        }),
      ]);
      setConfig(configData.config);
      setSavedConfig(configData.config);
      setNetworks(configData.networks || []);
      setDiagnostics(configData.diagnostics || null);
      setDashboard(dashboardData);
    } catch (error) {
      console.error('Failed to load Redeem DG admin data:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load Redeem DG settings');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const setConfigValue = (updater: (current: DgRedemptionConfig) => DgRedemptionConfig) => {
    setConfig((current) => current ? updater(current) : current);
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('update-dg-redemption-config', { config }, {
        privyToken: token,
        withAnonKey: true,
      });
      setConfig(data.config);
      setSavedConfig(data.config);
      toast.success('Redeem DG settings saved');
      loadData();
    } catch (error) {
      console.error('Failed to save Redeem DG settings:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleChain = (chainId: number, checked: boolean) => {
    setConfigValue((current) => ({
      ...current,
      supported_chains: checked
        ? Array.from(new Set([...current.supported_chains, chainId]))
        : current.supported_chains.filter((id) => id !== chainId),
    }));
  };

  const updateWallet = (chainId: number, value: string) => {
    setConfigValue((current) => ({
      ...current,
      wallets_by_chain: {
        ...current.wallets_by_chain,
        [String(chainId)]: value,
      },
    }));
  };

  const retry = async (intentId: string) => {
    setRetryingId(intentId);
    try {
      const token = await getAccessToken();
      await callEdgeFunction<any>('retry-dg-redemption-payout', { intent_id: intentId }, {
        privyToken: token,
        withAnonKey: true,
      });
      toast.success('Redeem DG payout retry started');
      loadData();
    } catch (error) {
      console.error('Retry failed:', error);
      toast.error(error instanceof Error ? error.message : 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  const reconcile = async (intentId: string) => {
    setReconcilingId(intentId);
    try {
      const token = await getAccessToken();
      await callEdgeFunction<any>('retry-dg-redemption-payout', { intent_id: intentId, reconcile_only: true }, {
        privyToken: token,
        withAnonKey: true,
      });
      toast.success('Redeem DG payout reconciled');
      loadData();
    } catch (error) {
      console.error('Reconcile failed:', error);
      toast.error(error instanceof Error ? error.message : 'Reconcile failed');
    } finally {
      setReconcilingId(null);
    }
  };

  const copyValue = async (label: string, value?: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const openManualPaidDialog = (row: DgRedemptionRow) => {
    setManualPaidTarget(row);
    setManualPaymentReference('');
    setManualPaymentNote('');
  };

  const openOtpDialog = (row: DgRedemptionRow) => {
    setOtpTarget(row);
    setOtpValue('');
  };

  const closeOtpDialog = () => {
    if (otpSubmittingId || otpResendingId) return;
    setOtpTarget(null);
    setOtpValue('');
  };

  const finalizeOtp = async () => {
    if (!otpTarget) return;
    const otp = otpValue.replace(/\D/g, '');
    if (otp.length < 4) {
      toast.error('Enter the Paystack OTP');
      return;
    }

    setOtpSubmittingId(otpTarget.id);
    try {
      const token = await getAccessToken();
      const result = await callEdgeFunction<any>('manage-dg-redemption-transfer-otp', {
        intent_id: otpTarget.id,
        action: 'finalize',
        otp,
      }, {
        privyToken: token,
        withAnonKey: true,
      });
      toast.success(result.message || 'Paystack transfer OTP finalized');
      setOtpTarget(null);
      setOtpValue('');
      loadData();
    } catch (error) {
      console.error('Paystack OTP finalization failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to finalize Paystack OTP');
      loadData();
    } finally {
      setOtpSubmittingId(null);
    }
  };

  const resendOtp = async () => {
    if (!otpTarget) return;

    setOtpResendingId(otpTarget.id);
    try {
      const token = await getAccessToken();
      await callEdgeFunction<any>('manage-dg-redemption-transfer-otp', {
        intent_id: otpTarget.id,
        action: 'resend',
      }, {
        privyToken: token,
        withAnonKey: true,
      });
      toast.success('Paystack OTP resent');
    } catch (error) {
      console.error('Paystack OTP resend failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to resend Paystack OTP');
      loadData();
    } finally {
      setOtpResendingId(null);
    }
  };

  const markManuallyPaid = async () => {
    if (!manualPaidTarget) return;
    const paymentReference = manualPaymentReference.trim();
    const note = manualPaymentNote.trim();
    if (!paymentReference && !note) {
      toast.error('Add a manual payment reference or note');
      return;
    }

    setResolvingId(manualPaidTarget.id);
    try {
      const token = await getAccessToken();
      await callEdgeFunction<any>('admin-resolve-dg-redemption', {
        intent_id: manualPaidTarget.id,
        action: 'mark_paid',
        payment_reference: paymentReference,
        note,
      }, {
        privyToken: token,
        withAnonKey: true,
      });
      toast.success('Redeem DG request marked paid');
      setManualPaidTarget(null);
      setManualPaymentReference('');
      setManualPaymentNote('');
      loadData();
    } catch (error) {
      console.error('Manual resolution failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to mark request paid');
    } finally {
      setResolvingId(null);
    }
  };

  const expireStale = async () => {
    setIsExpiring(true);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('expire-dg-redemption-intents', {}, {
        privyToken: token,
        withAnonKey: true,
      });
      toast.success(`Expired ${data.expired_count || 0} stale Redeem DG request${Number(data.expired_count || 0) === 1 ? '' : 's'}`);
      loadData();
    } catch (error) {
      console.error('Failed to expire stale Redeem DG requests:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to expire stale requests');
    } finally {
      setIsExpiring(false);
    }
  };

  const statusCounts = useMemo(() => dashboard?.summary_24h.by_status || {}, [dashboard]);
  const hasChanges = Boolean(config && savedConfig && stableStringify(config) !== stableStringify(savedConfig));
  const configurableNetworks = useMemo(() => networks.filter((network) => network.is_active), [networks]);
  const configuredDiagnostics = useMemo(() => (
    diagnostics?.chains.filter((chain) => chain.supported || Boolean(chain.redemption_wallet_address?.trim())) || []
  ), [diagnostics]);

  if (isLoading && !config) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Redeem DG settings...
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container mx-auto px-6 py-12">
        <Alert>
          <AlertDescription>Redeem DG settings could not be loaded.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-10 max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-3">
              <Link to="/admin">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Admin Dashboard
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="rounded-lg border bg-primary/10 p-2">
                <Banknote className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Redeem DG</h1>
                <p className="text-muted-foreground">Manage reward redemption limits, fees, payout wallets, and reviews.</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={expireStale} disabled={isExpiring || isLoading}>
              {isExpiring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
              Expire stale
            </Button>
            <Button variant="outline" onClick={loadData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  Configuration
                </CardTitle>
                <CardDescription>Changes apply to new Redeem DG quotes only.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FieldLabel help="Master switch for Redeem DG. When off, users cannot get quotes or start new redemptions. Existing requests are not changed.">Redeem DG live</FieldLabel>
                      <p className="text-xs text-muted-foreground">Users can redeem rewards</p>
                    </div>
                    <Switch checked={config.enabled} onCheckedChange={(checked) => setConfigValue((current) => ({ ...current, enabled: checked }))} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FieldLabel help="Limits new payouts to the money Paystack says is currently available, so quotes do not exceed settlement liquidity.">Balance Cap</FieldLabel>
                      <p className="text-xs text-muted-foreground">Use Paystack availability</p>
                    </div>
                    <Switch
                      checked={config.paystack_balance_cap_enabled}
                      onCheckedChange={(checked) => setConfigValue((current) => ({ ...current, paystack_balance_cap_enabled: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FieldLabel help="Adds VAT on top of the service fee when calculating what the user receives.">VAT</FieldLabel>
                      <p className="text-xs text-muted-foreground">Applied to service fee</p>
                    </div>
                    <Switch
                      checked={config.tax.enabled}
                      onCheckedChange={(checked) => setConfigValue((current) => ({ ...current, tax: { ...current.tax, enabled: checked, basis: checked ? 'service_fee' : 'none' } }))}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <FieldLabel help="Smallest DG amount a user can redeem in one request.">Minimum DG</FieldLabel>
                    <Input value={config.limits.min_dg} onChange={(event) => setConfigValue((current) => ({ ...current, limits: { ...current.limits, min_dg: event.target.value } }))} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel help="Largest DG amount a user can redeem in one request before they need to split it.">Maximum DG</FieldLabel>
                    <Input value={config.limits.max_dg} onChange={(event) => setConfigValue((current) => ({ ...current, limits: { ...current.limits, max_dg: event.target.value } }))} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel help="How long a quote stays valid before the user must request a fresh rate.">Quote TTL seconds</FieldLabel>
                    <Input type="number" value={config.quote_ttl_seconds} onChange={(event) => setConfigValue((current) => ({ ...current, quote_ttl_seconds: Number(event.target.value) }))} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel help="How many block confirmations are required before a transfer can be trusted for payout.">Confirmations</FieldLabel>
                    <Input type="number" value={config.required_confirmations} onChange={(event) => setConfigValue((current) => ({ ...current, required_confirmations: Number(event.target.value) }))} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-2">
                    <FieldLabel help="The platform fee percentage deducted from each successful redemption.">Service fee (%)</FieldLabel>
                    <PercentInput valueBps={config.service_fee.bps} onChangeBps={(value) => setConfigValue((current) => ({ ...current, service_fee: { ...current.service_fee, bps: value } }))} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel help="The minimum service fee collected, even on small redemptions.">Min fee (NGN)</FieldLabel>
                    <NairaInput valueKobo={config.service_fee.min_kobo} onChangeKobo={(value) => setConfigValue((current) => ({ ...current, service_fee: { ...current.service_fee, min_kobo: value } }))} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel help="The maximum service fee collected, so large redemptions do not overpay fees.">Max fee (NGN)</FieldLabel>
                    <NairaInput valueKobo={config.service_fee.max_kobo} onChangeKobo={(value) => setConfigValue((current) => ({ ...current, service_fee: { ...current.service_fee, max_kobo: value } }))} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel help="The VAT percentage applied to the service fee when VAT is enabled.">VAT (%)</FieldLabel>
                    <PercentInput valueBps={config.tax.vat_bps} onChangeBps={(value) => setConfigValue((current) => ({ ...current, tax: { ...current.tax, vat_bps: value } }))} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel help="Redemptions at or above this payout value are held for admin review before transfer.">Manual review (NGN)</FieldLabel>
                    <NairaInput valueKobo={config.limits.manual_review_ngn_kobo} onChangeKobo={(value) => setConfigValue((current) => ({ ...current, limits: { ...current.limits, manual_review_ngn_kobo: value } }))} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <FieldLabel help="Minimum estimated redemption value before platform fees are removed.">Minimum gross (NGN)</FieldLabel>
                    <NairaInput valueKobo={config.limits.min_gross_ngn_kobo} onChangeKobo={(value) => setConfigValue((current) => ({ ...current, limits: { ...current.limits, min_gross_ngn_kobo: value } }))} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel help="Maximum gross redemption value one user can request in a 24-hour window.">User daily limit (NGN)</FieldLabel>
                    <NairaInput valueKobo={config.limits.per_user_daily_ngn_kobo} onChangeKobo={(value) => setConfigValue((current) => ({ ...current, limits: { ...current.limits, per_user_daily_ngn_kobo: value } }))} />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel help="Maximum gross redemption value the whole platform can quote in a 24-hour window.">Platform daily limit (NGN)</FieldLabel>
                    <NairaInput valueKobo={config.limits.platform_daily_ngn_kobo} onChangeKobo={(value) => setConfigValue((current) => ({ ...current, limits: { ...current.limits, platform_daily_ngn_kobo: value } }))} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Network Wallets</CardTitle>
                <CardDescription>Configured Redeem DG payout wallets. Add new chains in Network Settings first.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {configurableNetworks.length === 0 && (
                    <p className="text-sm text-muted-foreground">No active networks are configured yet.</p>
                  )}
                  {configurableNetworks.map((network) => {
                    const enabled = config.supported_chains.includes(network.chain_id);
                    return (
                      <div key={network.chain_id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[180px_minmax(0,1fr)_112px] sm:items-center">
                        <div>
                          <div className="font-medium">{network.chain_name}</div>
                          <div className="text-xs text-muted-foreground">Chain {network.chain_id}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">Payout wallet</Label>
                            <FieldHelp text="The wallet that receives DG on this network before the user is paid in naira." />
                          </div>
                          <Input
                            value={config.wallets_by_chain[String(network.chain_id)] || ''}
                            onChange={(event) => updateWallet(network.chain_id, event.target.value)}
                            placeholder="0x..."
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1">
                            <Label className="text-xs">Enabled</Label>
                            <FieldHelp text="Allows this network to create Redeem DG quotes when a payout wallet is set." />
                          </div>
                          <Switch checked={enabled} onCheckedChange={(checked) => toggleChain(network.chain_id, checked)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Requests</CardTitle>
                <CardDescription>Latest Redeem DG requests and payout states.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full overflow-x-auto">
                  <Table className="min-w-[1080px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Receive</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dashboard?.recent_redemptions || []).map((row) => (
                        <React.Fragment key={row.id}>
                          <TableRow>
                            <TableCell>
                              <Badge variant={statusVariant(displayRowStatus(row))}>{formatStatus(displayRowStatus(row))}</Badge>
                              {row.last_error && <div className="mt-1 max-w-[220px] truncate text-xs text-destructive">{formatLastError(row.last_error)}</div>}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{row.user_id.slice(0, 16)}...</TableCell>
                            <TableCell>{formatNairaFromKobo(row.gross_ngn_kobo)}</TableCell>
                            <TableCell>{formatNairaFromKobo(row.net_payout_kobo)}</TableCell>
                            <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <ActionButton
                                label={expandedId === row.id ? 'Hide details' : 'View details'}
                                size="sm"
                                variant="outline"
                                onClick={() => setExpandedId((current) => current === row.id ? null : row.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </ActionButton>
                              {canReconcileStatus(row.status) && (
                                <ActionButton
                                  label="Reconcile Paystack payout"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => reconcile(row.id)}
                                  disabled={reconcilingId === row.id}
                                >
                                  {reconcilingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                </ActionButton>
                              )}
                              {canFinalizeOtp(row) && (
                                <ActionButton
                                  label="Finalize Paystack OTP"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openOtpDialog(row)}
                                  disabled={otpSubmittingId === row.id}
                                >
                                  {otpSubmittingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                </ActionButton>
                              )}
                              {canRetryPayout(row) && (
                                <ActionButton
                                  label={row.status === 'manual_review' ? 'Approve payout' : 'Retry payout'}
                                  size="sm"
                                  variant="outline"
                                  onClick={() => retry(row.id)}
                                  disabled={retryingId === row.id}
                                >
                                  {retryingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                                </ActionButton>
                              )}
                              {canMarkManualPaidStatus(row) && (
                                <ActionButton
                                  label="Mark manually paid"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openManualPaidDialog(row)}
                                  disabled={resolvingId === row.id}
                                >
                                  {resolvingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                </ActionButton>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedId === row.id && (
                          <TableRow>
                            <TableCell colSpan={6}>
                              <div className="grid gap-3 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2">
                                <div>
                                  <div className="text-xs text-muted-foreground">Wallet</div>
                                  <div className="flex items-start gap-2">
                                    <div className="break-all font-mono text-xs">{row.wallet_address}</div>
                                    <ActionButton label="Copy wallet address" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyValue('Wallet address', row.wallet_address)}>
                                      <Copy className="h-3.5 w-3.5" />
                                    </ActionButton>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Transaction hash</div>
                                  <div className="flex items-start gap-2">
                                    <div className="break-all font-mono text-xs">{row.tx_hash || 'Not submitted'}</div>
                                    {row.tx_hash && (
                                      <ActionButton label="Copy transaction hash" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyValue('Transaction hash', row.tx_hash)}>
                                        <Copy className="h-3.5 w-3.5" />
                                      </ActionButton>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Paystack reference</div>
                                  <div className="flex items-start gap-2">
                                    <div className="break-all font-mono text-xs">{row.paystack_reference || 'Not initiated'}</div>
                                    {row.paystack_reference && (
                                      <ActionButton label="Copy Paystack reference" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyValue('Paystack reference', row.paystack_reference)}>
                                        <Copy className="h-3.5 w-3.5" />
                                      </ActionButton>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Paystack status</div>
                                  <div>{row.paystack_status || 'Not initiated'}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Paystack transfer code</div>
                                  <div className="flex items-start gap-2">
                                    <div className="break-all font-mono text-xs">{row.paystack_transfer_code || 'Not initiated'}</div>
                                    {row.paystack_transfer_code && (
                                      <ActionButton label="Copy Paystack transfer code" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyValue('Paystack transfer code', row.paystack_transfer_code)}>
                                        <Copy className="h-3.5 w-3.5" />
                                      </ActionButton>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Paystack transfer ID</div>
                                  <div className="font-mono text-xs">{row.paystack_transfer_id || 'Not initiated'}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Bank</div>
                                  <div>{row.payout_account ? `${row.payout_account.bank_name} ******${row.payout_account.account_number_last4}` : 'Unavailable'}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Fees</div>
                                  <div>{formatNairaFromKobo(row.total_fee_kobo)} total ({formatNairaFromKobo(row.service_fee_kobo)} service, {formatNairaFromKobo(row.vat_kobo)} VAT)</div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Expires</div>
                                  <div>{new Date(row.expires_at).toLocaleString()}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Updated</div>
                                  <div>{new Date(row.updated_at).toLocaleString()}</div>
                                </div>
                                {row.completed_at && (
                                  <div>
                                    <div className="text-xs text-muted-foreground">Completed</div>
                                    <div>{new Date(row.completed_at).toLocaleString()}</div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Provider Health</CardTitle>
                <CardDescription>Current payout availability.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Paystack balance
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {formatNairaFromKobo(dashboard?.provider_health.paystack_balance_kobo)}
                  </div>
                  {dashboard?.provider_health.error && (
                    <p className="mt-2 text-sm text-destructive">{dashboard.provider_health.error}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">24h requests</div>
                    <div className="text-xl font-semibold">{dashboard?.summary_24h.count || 0}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">24h fees</div>
                    <div className="text-xl font-semibold">{formatNairaFromKobo(dashboard?.summary_24h.fees_kobo)}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">24h value</div>
                    <div className="text-xl font-semibold">{formatNairaFromKobo(dashboard?.summary_24h.gross_kobo)}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">24h payout</div>
                    <div className="text-xl font-semibold">{formatNairaFromKobo(dashboard?.summary_24h.net_payout_kobo)}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">{formatStatus(status)}</span>
                      <Badge variant={statusVariant(status)}>{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {diagnostics && (
              <Card>
                <CardHeader>
                  <CardTitle>Diagnostics</CardTitle>
                  <CardDescription>Read-only checks for configured Redeem DG providers.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <span className="text-muted-foreground">Paystack balance API</span>
                    <Badge variant={diagnostics.paystack_balance.status === 'error' ? 'destructive' : 'secondary'}>
                      {diagnostics.paystack_balance.status}
                    </Badge>
                  </div>
                  {diagnostics.paystack_balance.error && (
                    <p className="text-sm text-destructive">{diagnostics.paystack_balance.error}</p>
                  )}
                  <div className="space-y-2">
                    {configuredDiagnostics.length === 0 && (
                      <p className="text-sm text-muted-foreground">No configured networks to check yet.</p>
                    )}
                    {configuredDiagnostics.map((chain) => (
                      <div key={chain.chain_id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-medium">{chain.chain_name}</div>
                            <div className="text-xs text-muted-foreground">Chain {chain.chain_id}</div>
                          </div>
                          <Badge variant={chain.status === 'error' ? 'destructive' : chain.status === 'warning' ? 'secondary' : 'default'}>
                            {chain.status}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <span>Supported: {chain.supported ? 'yes' : 'no'}</span>
                          <span>Paused: {chain.paused === null ? 'n/a' : chain.paused ? 'yes' : 'no'}</span>
                          <span>Token config: {chain.token_config_matches === null ? 'n/a' : chain.token_config_matches ? 'ok' : 'mismatch'}</span>
                          <span>Vendor fee: {chain.sell_fee_bps === null ? 'n/a' : formatPercentFromBps(chain.sell_fee_bps)}</span>
                        </div>
                        <div className="mt-2 break-all text-xs text-muted-foreground">
                          UP balance: {formatUpBalance(chain.vendor_up_balance_raw, chain.vendor_up_balance_decimals)}
                        </div>
                        {chain.error && <p className="mt-2 text-xs text-destructive">{chain.error}</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        <Dialog open={Boolean(manualPaidTarget)} onOpenChange={(open) => !open && setManualPaidTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark manually paid</DialogTitle>
              <DialogDescription>
                Use this only after paying the user outside Paystack. The request will be marked paid and added to the audit trail.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="text-xs text-muted-foreground">Request</div>
                <div className="font-mono text-xs">{manualPaidTarget?.id}</div>
                <div className="mt-2 text-xs text-muted-foreground">Amount paid</div>
                <div className="font-medium">{formatNairaFromKobo(manualPaidTarget?.net_payout_kobo)}</div>
              </div>
              <div className="space-y-2">
                <Label>Manual payment reference</Label>
                <Input
                  value={manualPaymentReference}
                  onChange={(event) => setManualPaymentReference(event.target.value)}
                  placeholder="Bank transfer reference, receipt ID, or ops ticket"
                />
              </div>
              <div className="space-y-2">
                <Label>Admin note</Label>
                <Textarea
                  value={manualPaymentNote}
                  onChange={(event) => setManualPaymentNote(event.target.value)}
                  placeholder="Briefly note how this payout was completed"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManualPaidTarget(null)} disabled={Boolean(resolvingId)}>
                Cancel
              </Button>
              <Button
                onClick={markManuallyPaid}
                disabled={Boolean(resolvingId) || (!manualPaymentReference.trim() && !manualPaymentNote.trim())}
              >
                {resolvingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Mark paid
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={Boolean(otpTarget)} onOpenChange={(open) => !open && closeOtpDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Finalize Paystack OTP</DialogTitle>
              <DialogDescription>
                Enter the OTP Paystack sent for this transfer. This completes the existing Paystack transfer instead of creating a new payout.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="text-xs text-muted-foreground">Paystack reference</div>
                <div className="break-all font-mono text-xs">{otpTarget?.paystack_reference}</div>
                <div className="mt-2 text-xs text-muted-foreground">Transfer code</div>
                <div className="break-all font-mono text-xs">{otpTarget?.paystack_transfer_code}</div>
                <div className="mt-2 text-xs text-muted-foreground">Amount</div>
                <div className="font-medium">{formatNairaFromKobo(otpTarget?.net_payout_kobo)}</div>
              </div>
              <div className="space-y-2">
                <Label>Paystack OTP</Label>
                <InputOTP
                  maxLength={6}
                  value={otpValue}
                  onChange={(value) => setOtpValue(value.replace(/\D/g, ''))}
                  disabled={Boolean(otpSubmittingId)}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="outline"
                onClick={resendOtp}
                disabled={Boolean(otpSubmittingId || otpResendingId)}
              >
                {otpResendingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailCheck className="mr-2 h-4 w-4" />}
                Resend OTP
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeOtpDialog} disabled={Boolean(otpSubmittingId || otpResendingId)}>
                  Cancel
                </Button>
                <Button
                  onClick={finalizeOtp}
                  disabled={Boolean(otpSubmittingId) || otpValue.replace(/\D/g, '').length < 4}
                >
                  {otpSubmittingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Finalize transfer
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      </div>
    </TooltipProvider>
  );
};

export default AdminDgRedemption;
