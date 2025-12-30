import { useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
import { useGamingBundleOrders } from '@/hooks/useGamingBundleOrders';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ReissueReceipt = {
  order_id: string;
  claim_code: string;
};

function shorten(value: string, start = 6, end = 4) {
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

const VendorGamingBundleOrders = () => {
  const { authenticated, getAccessToken } = usePrivy();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [q, setQ] = useState('');
  const qDebounced = useDebounce(q, 250);
  const [rotatingOrderId, setRotatingOrderId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReissueReceipt | null>(null);

  const { data: orders = [], isLoading, error } = useGamingBundleOrders(
    { q: qDebounced, limit: 50 },
    { enabled: authenticated }
  );

  const claimUrl = useMemo(() => {
    if (!receipt) return '';
    return `${window.location.origin}/gaming-bundles/claim?code=${encodeURIComponent(receipt.claim_code)}`;
  }, [receipt]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: 'Copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy to clipboard.', variant: 'destructive' });
    }
  };

  const handleReissue = async (orderId: string) => {
    setRotatingOrderId(orderId);
    try {
      const token = await getAccessToken?.();
      const { data, error: invokeError } = await supabase.functions.invoke('rotate-gaming-bundle-claim-code', {
        body: { order_id: orderId },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (invokeError || !data?.ok) {
        throw new Error(invokeError?.message || data?.error || 'Failed to reissue receipt');
      }

      setReceipt({ order_id: data.order_id, claim_code: data.claim_code });
      toast({ title: 'Receipt reissued', description: 'A new claim code was generated.' });
      queryClient.invalidateQueries({ queryKey: ['gaming-bundle-orders'] });
    } catch (err) {
      toast({
        title: 'Reissue failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setRotatingOrderId(null);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-6 max-w-5xl">
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Bundle Orders</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Sign in to view vendor orders.</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bundle Orders</h1>
          <p className="text-gray-600 mt-1">Search and reissue offline claim receipts (hash-only storage).</p>
        </div>

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-lg">Order History</CardTitle>
              <div className="w-full max-w-sm">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by order id, buyer name, phone, or address..."
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-600">
                {error instanceof Error ? error.message : 'Failed to load orders'}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Bundle</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Redeemed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading orders...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      No orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <span title={order.id}>{shorten(order.id, 8, 6)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyText(order.id)}
                            aria-label={`Copy order id ${order.id}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{order.gaming_bundles?.title || 'Bundle'}</div>
                          <div className="text-xs text-muted-foreground">
                            {order.gaming_bundles?.quantity_units} {order.gaming_bundles?.unit_label}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">{order.buyer_display_name || 'Guest'}</div>
                          <div className="text-xs text-muted-foreground">
                            {order.buyer_phone || order.buyer_address ? (
                              <span>
                                {order.buyer_phone || ''}{order.buyer_phone && order.buyer_address ? ' · ' : ''}
                                {order.buyer_address ? shorten(order.buyer_address, 6, 4) : ''}
                              </span>
                            ) : (
                              <span>No contact info</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={order.status === 'PAID' ? 'default' : 'secondary'}>{order.status}</Badge>
                          <Badge variant="outline">{order.fulfillment_method}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.redeemed_at ? (
                          <span className="text-xs text-muted-foreground" title={order.redeemed_at}>Yes</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!order.can_reissue || rotatingOrderId === order.id}
                          onClick={() => handleReissue(order.id)}
                        >
                          {rotatingOrderId === order.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4 mr-2" />
                          )}
                          Reissue
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!receipt} onOpenChange={(open) => !open && setReceipt(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reissued Claim Receipt</DialogTitle>
              <DialogDescription>Give this code (or QR) to the buyer. The previous code is invalidated.</DialogDescription>
            </DialogHeader>
            {receipt && (
              <div className="space-y-4">
                <div className="text-sm space-y-1">
                  <p>
                    <strong>Order ID:</strong> <span className="font-mono text-xs">{receipt.order_id}</span>
                  </p>
                  <p>
                    <strong>Claim Code:</strong> <span className="font-mono">{receipt.claim_code}</span>
                  </p>
                </div>
                <div className="flex items-start gap-6">
                  <QRCodeCanvas value={claimUrl} size={140} />
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>Scan or open this link to claim later:</p>
                    <p className="break-all">{claimUrl}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyText(receipt.claim_code)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy code
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => copyText(claimUrl)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy link
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  This replaces the previous claim code. Only the latest code will work.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default VendorGamingBundleOrders;
