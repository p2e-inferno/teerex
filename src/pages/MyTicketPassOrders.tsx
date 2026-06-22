import { useWallets, usePrivy } from '@privy-io/react-auth';
import { Link } from 'react-router-dom';
import { Clock, Globe2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useMyTicketPassOrders } from '@/hooks/useMyTicketPassOrders';
import { useTicketPassActions } from '@/hooks/useTicketPassActions';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { formatNetworkName, formatPassValidity, formatPayoutSummary } from '@/lib/ticketPass/display';

const ORDER_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Pending', variant: 'outline' },
  PAID: { label: 'Delivering', variant: 'secondary' },
  DISPENSED: { label: 'Delivered', variant: 'default' },
  FAILED: { label: 'Needs retry', variant: 'destructive' },
  NEEDS_REVIEW: { label: 'Under review', variant: 'secondary' },
  REFUND_PENDING: { label: 'Refund pending', variant: 'secondary' },
  REFUND_NEEDS_ATTENTION: { label: 'Refund review', variant: 'secondary' },
  REFUND_FAILED: { label: 'Refund issue', variant: 'destructive' },
  REFUNDED: { label: 'Refunded', variant: 'outline' },
};

const refundMessage = (order: { status: string; refund_status?: string | null; refund_error?: string | null }) => {
  if (order.status === 'REFUND_PENDING') {
    return order.refund_status === 'processing' ? 'Refund is processing with Paystack.' : 'Refund has been started and is waiting for Paystack.';
  }
  if (order.status === 'REFUND_NEEDS_ATTENTION') return 'Support is reviewing your refund with Paystack.';
  if (order.status === 'REFUND_FAILED') return 'Support is resolving a refund issue with Paystack.';
  if (order.status === 'REFUNDED') return 'Refund processed by Paystack.';
  return null;
};

const MyTicketPassOrders = () => {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const { data: orders = [], isLoading } = useMyTicketPassOrders({ enabled: authenticated });
  const { isBusy, retryIssuance } = useTicketPassActions(wallet);
  const { networks } = useNetworkConfigs();

  if (!authenticated) {
    return <div className="container mx-auto px-6 max-w-3xl py-16 text-sm text-gray-500">Sign in to view your passes.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Passes</h1>
          <p className="text-gray-600">Passes you've purchased and the value delivered to your wallet.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-gray-500" /></div>
        ) : orders.length === 0 ? (
          <div className="text-sm text-gray-500">
            You haven't bought any passes yet. <Link to="/ticket-passes" className="underline">Browse passes</Link>.
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const pass = order.ticket_passes;
              const badge = ORDER_BADGE[order.status] ?? ORDER_BADGE.PENDING;
              const canRetry = order.status === 'PENDING' || order.status === 'PAID' || order.status === 'FAILED';
              const message = refundMessage(order);
              const network = networks.find((item) => item.chain_id === order.chain_id);
              return (
                <Card key={order.id}>
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {pass?.image_url && <img src={pass.image_url} alt="" className="w-12 h-12 rounded object-cover" />}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{pass?.title || 'Ticket Pass'}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {pass ? formatPayoutSummary(pass) : ''}{order.token_id ? ` · #${order.token_id}` : ''}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Globe2 className="w-3 h-3" />
                            {formatNetworkName(order.chain_id, network?.chain_name)}
                          </span>
                          {pass && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatPassValidity(pass)}
                            </span>
                          )}
                        </div>
                        {message && <p className="text-xs text-muted-foreground">{message}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {canRetry && (
                        <Button size="sm" variant="outline" disabled={isBusy} onClick={() => retryIssuance(order.id, order.payment_reference)}>
                          {order.status === 'PENDING' ? 'Verify & deliver' : 'Retry delivery'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyTicketPassOrders;
