import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Loader2, Coins, Ticket, Clock, Globe2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RichTextDisplay } from '@/components/ui/rich-text/RichTextDisplay';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { useTicketPass } from '@/hooks/useTicketPasses';
import { useTicketPassOnchainState } from '@/hooks/useTicketPassOnchainState';
import { useTicketPassActions } from '@/hooks/useTicketPassActions';
import { useTicketPassBuyerKeyBalance } from '@/hooks/useTicketPassBuyerKeyBalance';
import { TicketPassPaystackDialog, type TicketPassPaymentData } from '@/components/ticket-pass/TicketPassPaystackDialog';
import { TicketPassProcessingDialog } from '@/components/ticket-pass/TicketPassProcessingDialog';
import { LinkedEventCard } from '@/components/ticket-pass/LinkedEventCard';
import {
  formatFiatPrice,
  formatNetworkName,
  formatPassValidity,
  formatPayoutSummary,
  TICKET_PASS_STATUS_BADGE,
} from '@/lib/ticketPass/display';
import { getFiatCheckoutConfig } from '@/lib/payments/fiatCheckout';

const TicketPassDetails = () => {
  const { id } = useParams<{ id: string }>();
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];

  const { data: pass, isLoading } = useTicketPass(id);
  const { data: onchain } = useTicketPassOnchainState(pass?.lock_address, pass?.controller_address, pass?.chain_id);
  const { isBusy, close, setIssuance, withdrawResidual } = useTicketPassActions(wallet);
  const { networks } = useNetworkConfigs();
  const { data: buyerKeyBalance, isLoading: isCheckingBuyerLimit } = useTicketPassBuyerKeyBalance(
    pass?.lock_address,
    wallet?.address,
    pass?.chain_id,
    { enabled: authenticated && !!pass?.lock_address && !!wallet?.address },
  );

  const [payOpen, setPayOpen] = useState(false);
  const [processingRef, setProcessingRef] = useState<string | null>(null);

  const isCreator = useMemo(
    () => Boolean(wallet?.address && pass?.creator_address && wallet.address.toLowerCase() === pass.creator_address.toLowerCase()),
    [wallet?.address, pass?.creator_address],
  );

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-gray-500" /></div>;
  }
  if (!pass) {
    return <div className="container mx-auto px-6 max-w-3xl py-16 text-sm text-gray-500">Ticket pass not found.</div>;
  }

  const statusBadge = TICKET_PASS_STATUS_BADGE[pass.status] ?? TICKET_PASS_STATUS_BADGE.ACTIVE;
  const network = networks.find((n) => n.chain_id === pass.chain_id);
  const remaining = onchain ? Number(onchain.remaining) : null;
  const soldOut = remaining !== null && remaining <= 0;
  const buyerLimitReached = typeof buyerKeyBalance === 'number' && buyerKeyBalance >= pass.max_per_buyer;
  const fiatCheckout = getFiatCheckoutConfig();
  const purchasable = authenticated && fiatCheckout.available && pass.status === 'ACTIVE' && pass.issuance_enabled
    && !soldOut && !buyerLimitReached && !isCheckingBuyerLimit;

  const onPaid = (data: TicketPassPaymentData) => {
    setPayOpen(false);
    setProcessingRef(data.reference);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-3xl space-y-6">
        <Card>
          {pass.image_url && (
            <div className="w-full h-56 overflow-hidden rounded-t-lg">
              <img src={pass.image_url} alt={pass.title} className="w-full h-full object-cover" />
            </div>
          )}
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Badge variant="outline" className="flex items-center gap-1"><Ticket className="w-3 h-3" /> Ticket Pass</Badge>
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            </div>
            <CardTitle className="text-2xl">{pass.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RichTextDisplay content={pass.description} className="text-gray-700" />

            <div className="rounded-md border p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground flex items-center gap-1"><Globe2 className="w-4 h-4" /> Network</span>
                <span className="font-medium text-right">{formatNetworkName(pass.chain_id, network?.chain_name)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground flex items-center gap-1"><Clock className="w-4 h-4" /> Pass validity</span>
                <span className="font-medium text-right">{formatPassValidity(pass)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><Coins className="w-4 h-4" /> You receive</span>
                <span className="font-semibold">{formatPayoutSummary(pass)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="font-semibold">{formatFiatPrice(pass)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Availability</span>
                <span>{remaining === null ? `${pass.max_copies} max` : `${remaining} of ${pass.max_copies} left`}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Limit per buyer</span>
                <span>{pass.max_per_buyer}</span>
              </div>
            </div>

            {purchasable ? (
              <Button className="w-full" onClick={() => setPayOpen(true)}>Buy with Paystack</Button>
            ) : (
              <Button className="w-full" disabled>
                {!authenticated
                  ? 'Sign in to buy'
                  : !fiatCheckout.enabled
                    ? 'Fiat payments disabled'
                    : !fiatCheckout.configured
                      ? 'Payment unavailable'
                      : isCheckingBuyerLimit
                        ? 'Checking eligibility...'
                        : buyerLimitReached
                          ? 'Limit reached'
                          : soldOut
                            ? 'Sold out'
                            : pass.status !== 'ACTIVE'
                              ? 'Not available'
                              : 'Issuance paused'}
              </Button>
            )}
          </CardContent>
        </Card>

        {pass.target_event_address && <LinkedEventCard address={pass.target_event_address} />}

        {isCreator && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Creator controls</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Closing returns unsold escrow to your wallet and stops sales. Disabling platform issuance pauses new fiat
                purchases without touching escrow or sold passes.
              </p>
              <div className="flex flex-wrap gap-2">
                {pass.status !== 'CLOSED' && (
                  <Button variant="outline" disabled={isBusy} onClick={() => setIssuance(pass, !pass.issuance_enabled)}>
                    {pass.issuance_enabled ? 'Disable platform issuance' : 'Enable platform issuance'}
                  </Button>
                )}
                {pass.status !== 'CLOSED' && (
                  <Button variant="destructive" disabled={isBusy} onClick={() => close(pass)}>Close & withdraw</Button>
                )}
                {pass.status === 'CLOSED' && (
                  <Button variant="outline" disabled={isBusy} onClick={() => withdrawResidual(pass)}>Withdraw residual</Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <TicketPassPaystackDialog pass={pass} isOpen={payOpen} onClose={() => setPayOpen(false)} onSuccess={onPaid} />
      <TicketPassProcessingDialog
        reference={processingRef}
        isOpen={!!processingRef}
        onClose={() => setProcessingRef(null)}
        chainId={pass.chain_id}
      />
    </div>
  );
};

export default TicketPassDetails;
