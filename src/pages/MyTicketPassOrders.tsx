import { useWallets, usePrivy } from '@privy-io/react-auth';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useMyTicketPassOrders } from '@/hooks/useMyTicketPassOrders';
import { useTicketPassActions } from '@/hooks/useTicketPassActions';
import { formatPayoutSummary } from '@/lib/ticketPass/display';

const ORDER_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Pending', variant: 'outline' },
  PAID: { label: 'Delivering', variant: 'secondary' },
  DISPENSED: { label: 'Delivered', variant: 'default' },
  FAILED: { label: 'Needs retry', variant: 'destructive' },
  REFUNDED: { label: 'Refunded', variant: 'outline' },
};

const MyTicketPassOrders = () => {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const { data: orders = [], isLoading } = useMyTicketPassOrders({ enabled: authenticated });
  const { isBusy, retryIssuance } = useTicketPassActions(wallet);

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
