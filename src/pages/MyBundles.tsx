import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Package, RefreshCw, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMyGamingBundleOrders } from '@/hooks/useMyGamingBundleOrders';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function shorten(value: string, start = 8, end = 6) {
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function getExplorerTxUrl(chainId: number, txHash: string): string | null {
  const normalized = txHash?.trim();
  if (!normalized) return null;
  if (chainId === 8453) return `https://basescan.org/tx/${normalized}`;
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${normalized}`;
  return null;
}

const MyBundles = () => {
  const { authenticated, login } = usePrivy();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null);

  const { data: orders = [], isLoading, error, refetch } = useMyGamingBundleOrders(
    { limit: 100 },
    { enabled: authenticated }
  );

  const hasOrders = orders.length > 0;

  const rows = useMemo(() => orders, [orders]);

  const checkStatus = async (orderId: string) => {
    console.log(`[MyBundles] Check button clicked for order: ${orderId}`);
    setCheckingOrderId(orderId);
    try {
      console.log(`[MyBundles] Invoking get-gaming-bundle-order-status for ${orderId}...`);
      const { data, error: invokeError } = await supabase.functions.invoke('get-gaming-bundle-order-status', {
        body: { order_id: orderId },
      });

      console.log(`[MyBundles] Edge Function Response:`, data);
      if (invokeError) {
        console.error(`[MyBundles] Edge Function Invoke Error:`, invokeError);
        throw invokeError;
      }
      if (!data?.found) throw new Error('Order not found');

      const repairLogs = Array.isArray(data.repair_logs) && data.repair_logs.length > 0
        ? `\n\nRepair Logs: ${data.repair_logs.join(' -> ')}`
        : '';

      const trail = Array.isArray(data.issuance_trail) && data.issuance_trail.length > 0
        ? `\n\nIssuance Trail:\n${data.issuance_trail.map((t: any) => `• [${new Date(t.timestamp).toLocaleTimeString()}] ${t.event}${t.error ? `: ${t.error}` : ''}`).join('\n')}`
        : '';

      toast({
        title: 'Order Status Sync Complete',
        description: `Status: ${data.status}${data.token_id ? ` · Token #${data.token_id}` : ''}${data.txn_hash ? ` · Tx: ${shorten(data.txn_hash)}` : ''}${repairLogs}${trail}`,
      });

      // Force invalidate to refresh UI
      queryClient.invalidateQueries({ queryKey: ['my-gaming-bundle-orders'] });
      refetch(); // Direct refetch as well for safety
    } catch (err) {
      toast({
        title: 'Status check failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setCheckingOrderId(null);
    }
  };

  if (!authenticated && !isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-6 max-w-6xl text-center">
          <div className="py-20 px-6 bg-white rounded-lg shadow-sm border">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <User className="w-8 h-8 text-gray-500" />
            </div>
            <h3 className="text-2xl font-semibold text-gray-800">Please Connect Your Wallet</h3>
            <p className="text-gray-600 mt-2 max-w-md mx-auto">Connect your wallet to see your bundle purchases.</p>
            <Button className="mt-6 bg-purple-600 hover:bg-purple-700" onClick={login}>
              Connect
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Bundles</h1>
            <p className="text-gray-600">Recover and track your gaming bundle purchases.</p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-lg">Orders</CardTitle>
            </div>
            {error && (
              <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'Failed to load orders'}</p>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
              </div>
            ) : hasOrders ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bundle</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issuance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((order) => {
                    const txUrl = order.txn_hash ? getExplorerTxUrl(order.chain_id, order.txn_hash) : null;
                    const payment =
                      order.payment_provider === 'paystack'
                        ? `${order.fiat_symbol || 'NGN'} ${Number(order.amount_fiat || 0).toLocaleString()}`
                        : order.payment_provider === 'crypto'
                          ? `DG ${Number(order.amount_dg || 0).toLocaleString()}`
                          : 'Cash';

                    return (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{order.gaming_bundles?.title || 'Bundle'}</div>
                            <div className="text-xs text-muted-foreground">
                              {order.gaming_bundles?.quantity_units} {order.gaming_bundles?.unit_label}
                              {order.gaming_bundles?.location ? ` · ${order.gaming_bundles.location}` : ''}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-sm">{payment}</div>
                            {order.payment_reference && (
                              <div className="text-xs text-muted-foreground">{shorten(order.payment_reference)}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={order.status === 'PAID' ? 'default' : 'secondary'}>{order.status}</Badge>
                            <Badge variant="outline">{order.fulfillment_method}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs">
                            {order.fulfillment_method === 'NFT' ? (
                              <>
                                <div>{order.token_id ? `Token #${order.token_id}` : 'Token pending'}</div>
                                {order.txn_hash ? (
                                  txUrl ? (
                                    <a
                                      className="inline-flex items-center gap-1 text-purple-600 hover:underline"
                                      href={txUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {shorten(order.txn_hash)}
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="font-mono text-muted-foreground">{shorten(order.txn_hash)}</span>
                                  )
                                ) : (
                                  <span className="text-muted-foreground">Tx pending</span>
                                )}
                              </>
                            ) : (
                              <>
                                <div>{order.eas_uid ? 'EAS issued' : 'EAS pending'}</div>
                                {order.eas_uid && (
                                  <span className="font-mono text-muted-foreground">{shorten(order.eas_uid, 10, 8)}</span>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={checkingOrderId === order.id}
                              onClick={() => checkStatus(order.id)}
                            >
                              {checkingOrderId === order.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4 mr-2" />
                              )}
                              Check
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link to={`/gaming-bundles/${order.bundle_id}`}>View</Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-20 px-6 bg-white rounded-lg border">
                <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                  <Package className="w-8 h-8 text-gray-500" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-800">No Bundles Yet</h3>
                <p className="text-gray-600 mt-2 max-w-md mx-auto">
                  When you purchase a bundle, it will appear here with its issuance status.
                </p>
                <Button asChild className="mt-6 bg-purple-600 hover:bg-purple-700">
                  <Link to="/gaming-bundles">Browse Bundles</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MyBundles;

