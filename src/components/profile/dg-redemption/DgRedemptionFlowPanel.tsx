import React from 'react';
import { Bell, CheckCircle2, Clock, Copy, ExternalLink, Info, Loader2, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { UserPayoutAccount } from '@/hooks/useUserPayoutAccount';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { IdentityName } from '@/components/identity/IdentityName';
import { formatNairaFromKobo, formatUsdcFromMicro } from '@/lib/currency';
import { getExplorerTxUrl } from '@/lib/config/network-config';
import { UsdcDestinationSelect } from './UsdcDestinationSelect';
import type { DgRedemptionFlow } from './useDgRedemptionFlow';
import {
  formatCountdown,
  formatDgLimit,
  formatStatus,
  formatUserReviewMessage,
  shortAddress,
  statusHelp,
  type RedemptionLimits,
} from './types';

interface DgRedemptionFlowPanelProps {
  flow: DgRedemptionFlow;
  address: string;
  chainId: number;
  limits: RedemptionLimits | null;
  payoutAccount: UserPayoutAccount | null;
  isBankLoading: boolean;
  payoutWalletAddress: string;
  onPayoutWalletChange: (address: string) => void;
  notifyAdmin: (intentId: string) => void;
  notifyingIntentId: string | null;
  getNotifyCooldownMs: (intentId?: string | null) => number;
  notifyButtonContent: (intentId?: string | null) => string;
  onRequestCancel: (intentId: string) => void;
  isCancelling: boolean;
  cancelIntentId: string | null;
}

export const DgRedemptionFlowPanel: React.FC<DgRedemptionFlowPanelProps> = ({
  flow,
  address,
  chainId,
  limits,
  payoutAccount,
  isBankLoading,
  payoutWalletAddress,
  onPayoutWalletChange,
  notifyAdmin,
  notifyingIntentId,
  getNotifyCooldownMs,
  notifyButtonContent,
  onRequestCancel,
  isCancelling,
  cancelIntentId,
}) => {
  const isUsdc = flow.payoutMethod === 'usdc';
  const {
    amount,
    updateAmount,
    preview,
    previewCanRedeem,
    quoteButtonLabel,
    quote,
    quoteError,
    maxRedeemable,
    txHash,
    setTxHash,
    status,
    redemptionStatus,
    expired,
    amountValidationMessage,
    isAmountValid,
    minDg,
    maxDg,
    isPreviewing,
    isQuoting,
    isSubmitting,
    isRequestingExpiredReview,
  } = flow;

  const disabled = isUsdc ? false : isBankLoading || !payoutAccount;
  const limitsText = limits ? `${formatDgLimit(limits.min_dg)} minimum, ${formatDgLimit(limits.max_dg)} maximum` : null;
  const transferSubmitDisabled = isSubmitting || expired || !(!status || status === 'awaiting_transfer');
  const formatReceive = (item: { estimated_receive_kobo?: number | null; estimated_receive_usdc_micro?: number | null }) =>
    isUsdc ? formatUsdcFromMicro(item.estimated_receive_usdc_micro) : formatNairaFromKobo(item.estimated_receive_kobo);
  const serviceFeeOf = (item: {
    service_fee_kobo?: number | null;
    vendor_fee_kobo?: number | null;
    service_fee_usdc_micro?: number | null;
    vendor_fee_usdc_micro?: number | null;
  }) =>
    isUsdc
      ? formatUsdcFromMicro(Number(item.service_fee_usdc_micro || 0) + Number(item.vendor_fee_usdc_micro || 0))
      : formatNairaFromKobo(Number(item.service_fee_kobo || 0) + Number(item.vendor_fee_kobo || 0));
  const showVat = (item: { vat_kobo?: number | null }) => !isUsdc && Number(item.vat_kobo || 0) > 0;

  const copyAddress = async () => {
    if (!quote?.redemption_wallet_address) return;
    await navigator.clipboard.writeText(quote.redemption_wallet_address);
    toast.success('Address copied');
  };

  const openPayoutTxExplorer = async () => {
    const payoutTxHash = redemptionStatus?.payout_tx_hash;
    if (!payoutTxHash) return;
    try {
      const url = await getExplorerTxUrl(redemptionStatus?.chain_id || chainId, payoutTxHash);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to open payout transaction explorer:', error);
      toast.error('Could not open transaction in block explorer');
    }
  };

  const destinationBlock = (interactive: boolean) => (
    isUsdc ? (
      quote && !interactive ? (
        <div className="rounded-md bg-muted/50 p-3">
          <div className="text-muted-foreground">USDC sent to</div>
          <IdentityName address={String(quote.payout_wallet_address || payoutWalletAddress)} className="font-medium" />
        </div>
      ) : (
        <UsdcDestinationSelect
          value={payoutWalletAddress}
          onChange={onPayoutWalletChange}
          defaultAddress={address}
          disabled={isPreviewing || isQuoting}
        />
      )
    ) : (
      <div className="rounded-md bg-muted/50 p-3">
        <div className="text-muted-foreground">Bank</div>
        <div className="font-medium">{payoutAccount?.bank_name}</div>
        <div className="font-mono">******{payoutAccount?.account_number_last4}</div>
      </div>
    )
  );

  return (
    <div className="space-y-5">
      {!isUsdc && !payoutAccount && (
        <Alert>
          <AlertDescription>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Save bank details to enable Redeem DG.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('bank-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              >
                Save bank details
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
          <div className="space-y-2">
            <Label>DG Amount</Label>
            <Input
              min={Number.isFinite(minDg) ? limits?.min_dg : undefined}
              max={Number.isFinite(maxDg) && maxDg > 0 ? limits?.max_dg : undefined}
              inputMode="decimal"
              value={amount}
              disabled={disabled || isPreviewing || isQuoting}
              onChange={(event) => updateAmount(event.target.value)}
              placeholder="121000"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={flow.getPreview} disabled={disabled || isPreviewing || isQuoting || !isAmountValid} className="w-full">
              {isPreviewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
              Preview
            </Button>
          </div>
        </div>
        <p className={`text-xs ${amountValidationMessage ? 'text-destructive' : 'text-muted-foreground'}`}>
          {amountValidationMessage || limitsText || 'Loading Redeem DG limits...'}
        </p>
      </div>

      {quoteError && (
        <Alert>
          <AlertDescription>
            {quoteError}
            {maxRedeemable && <span className="block mt-1 font-medium">Available now: {maxRedeemable}</span>}
          </AlertDescription>
        </Alert>
      )}

      {preview && (
        <div className="space-y-4 rounded-md border p-4 bg-muted/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">You will receive</div>
              <div className="text-2xl font-bold text-foreground">{formatReceive(preview)}</div>
            </div>
            <Badge variant="outline">Preview</Badge>
          </div>

          <div className={`grid gap-3 text-sm ${showVat(preview) ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {destinationBlock(true)}
            <div className="rounded-md bg-muted/50 p-3">
              <div className="text-muted-foreground">Service fee</div>
              <div className="font-medium">{serviceFeeOf(preview)}</div>
            </div>
            {showVat(preview) && (
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-muted-foreground">VAT</div>
                <div className="font-medium">{formatNairaFromKobo(preview.vat_kobo)}</div>
              </div>
            )}
          </div>

          <Button onClick={flow.getQuote} disabled={isQuoting || !previewCanRedeem} className="w-full">
            {isQuoting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {quoteButtonLabel || 'Get Quote to Redeem'}
          </Button>
        </div>
      )}

      {quote && (
        <div className="space-y-4 rounded-md border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">You receive</div>
              <div className="text-2xl font-bold">{formatReceive(quote)}</div>
            </div>
            <Badge variant={expired ? 'destructive' : 'secondary'}>{expired ? 'Expired' : 'Active quote'}</Badge>
          </div>

          <div className={`flex flex-col gap-2 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
            expired ? 'border-destructive/40 bg-destructive/10' : 'border-primary/25 bg-primary/5'
          }`}>
            <div className="flex items-center gap-2">
              <Clock className={`h-4 w-4 ${expired ? 'text-destructive' : 'text-primary'}`} />
              <span className={`text-sm font-medium ${expired ? 'text-destructive' : 'text-foreground'}`}>
                {expired ? 'Quote expired' : 'Quote expires in'}
              </span>
            </div>
            <div className={`font-mono text-2xl font-bold tabular-nums ${expired ? 'text-destructive' : 'text-primary'}`}>
              {expired ? '00:00' : formatCountdown(quote.expires_at || undefined)}
            </div>
          </div>

          <div className={`grid gap-3 text-sm ${showVat(quote) ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {destinationBlock(false)}
            <div className="rounded-md bg-muted/50 p-3">
              <div className="text-muted-foreground">Service fee</div>
              <div className="font-medium">{serviceFeeOf(quote)}</div>
            </div>
            {showVat(quote) && (
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-muted-foreground">VAT</div>
                <div className="font-medium">{formatNairaFromKobo(quote.vat_kobo)}</div>
              </div>
            )}
          </div>

          {!expired ? (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-violet-700 dark:text-violet-300 bg-violet-50/50 dark:bg-violet-950/20 px-2.5 py-1 rounded-md border border-violet-100 dark:border-violet-900/30 inline-block">
                  Send exactly {quote.amount_dg} DG to
                </Label>
                <div className="flex gap-2">
                  <Input readOnly value={quote.redemption_wallet_address} className="font-mono text-xs font-bold" />
                  <Button variant="outline" size="icon" onClick={copyAddress} type="button">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/15 border-blue-100 dark:border-blue-900/30 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-blue-800 dark:text-blue-300">
                    <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Transfer Guidelines</span>
                  </div>
                  <div className="text-blue-700/80 dark:text-blue-300/80 leading-relaxed pl-[22px]">
                    Send only from this address:{" "}
                    <span className="px-1.5 py-0.5 rounded bg-blue-100/50 dark:bg-blue-900/30 font-bold text-blue-900 dark:text-blue-200 text-[10px]">
                      <IdentityName address={address} />
                    </span>
                    , then submit the transaction hash below.
                  </div>
                  <div className="text-blue-800/90 dark:text-blue-300/90 font-medium pl-[22px]">
                    Note: Sending from a different address may lead to loss of funds.
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                <div className="space-y-2">
                  <Label>Transaction Hash</Label>
                  <Input
                    value={txHash}
                    onChange={(event) => setTxHash(event.target.value.trim())}
                    placeholder="0x..."
                    className="font-mono text-xs"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={flow.submit} disabled={transferSubmitDisabled} className="flex-grow">
                    {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Submit
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => quote?.intent_id && onRequestCancel(quote.intent_id)}
                    disabled={isCancelling}
                    className="px-3"
                    title="Cancel Request"
                    type="button"
                  >
                    {isCancelling && cancelIntentId === quote?.intent_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel'}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4 rounded-md border border-destructive/30 bg-destructive/10 p-4">
              <div className="space-y-2">
                <div className="font-semibold text-destructive">Do not send DG for this expired quote.</div>
                <p className="text-sm text-destructive/90">
                  Get a new quote before transferring. Expired quotes are not processed automatically because the payout value may have changed.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={flow.getQuote} disabled={isQuoting}>
                    {isQuoting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Get New Quote
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => quote?.intent_id && onRequestCancel(quote.intent_id)}
                    disabled={isCancelling}
                  >
                    Cancel Request
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-md border bg-background/80 p-3">
                <div>
                  <div className="text-sm font-semibold">Already sent after this quote was created?</div>
                  <p className="text-xs text-muted-foreground">
                    Submit the transaction hash for admin review. We will verify the transfer matches this quote and was made after the quote was created.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                  <div className="space-y-2">
                    <Label>Transaction Hash</Label>
                    <Input
                      value={txHash}
                      onChange={(event) => setTxHash(event.target.value.trim())}
                      placeholder="0x..."
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={flow.requestExpiredReview}
                      disabled={isRequestingExpiredReview}
                      className="w-full"
                    >
                      {isRequestingExpiredReview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                      Request Review
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {status && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    Redeem DG status: <span className="font-medium">{formatStatus(status)}</span>
                    {statusHelp(status, flow.payoutMethod) && (
                      <span className="block text-muted-foreground">{statusHelp(status, flow.payoutMethod)}</span>
                    )}
                    {formatUserReviewMessage(redemptionStatus?.last_error) && (
                      <span className="block text-muted-foreground">{formatUserReviewMessage(redemptionStatus?.last_error)}</span>
                    )}
                    {redemptionStatus?.completed_at && (
                      <span className="block text-muted-foreground">Completed {new Date(redemptionStatus.completed_at).toLocaleString()}</span>
                    )}
                    {isUsdc && redemptionStatus?.payout_tx_hash && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1 text-xs">
                        <span>Payout Tx</span>
                        <button
                          type="button"
                          className="font-mono text-foreground hover:underline"
                          onClick={openPayoutTxExplorer}
                        >
                          {shortAddress(redemptionStatus.payout_tx_hash)}
                        </button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground"
                          onClick={async () => {
                            await navigator.clipboard.writeText(redemptionStatus.payout_tx_hash as string);
                            toast.success('Payout transaction hash copied');
                          }}
                          title="Copy payout transaction hash"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground"
                          onClick={openPayoutTxExplorer}
                          title="View payout transaction on block explorer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status === 'manual_review' && quote.intent_id && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => notifyAdmin(quote.intent_id as string)}
                        disabled={notifyingIntentId === quote.intent_id || getNotifyCooldownMs(quote.intent_id) > 0}
                      >
                        {notifyingIntentId === quote.intent_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                        {notifyButtonContent(quote.intent_id)}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => flow.refreshStatus().catch((error) => {
                        console.error('Failed to refresh Redeem DG status:', error);
                        toast.error(error instanceof Error ? error.message : 'Failed to refresh Redeem DG status');
                      })}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
};
