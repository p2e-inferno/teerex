import { useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, ExternalLink, Loader2, RefreshCw, RotateCcw, Search } from 'lucide-react';
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

function getExplorerTxUrl(chainId: number, txHash: string): string | null {
  const normalized = txHash?.trim();
  if (!normalized) return null;
  if (chainId === 8453) return `https://basescan.org/tx/${normalized}`;
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${normalized}`;
  return null;
}

const VendorGamingBundleOrders = () => {
  const { authenticated, getAccessToken } = usePrivy();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [q, setQ] = useState('');
  const qDebounced = useDebounce(q, 250);
  const [rotatingOrderId, setRotatingOrderId] = useState<string | null>(null);
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null);
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

  const handleRetryIssuance = async (orderId: string) => {
    setRetryingOrderId(orderId);
    try {
      const token = await getAccessToken?.();
      const { data, error: invokeError } = await supabase.functions.invoke('retry-gaming-bundle-issuance', {
        body: { order_id: orderId },
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      if (invokeError || !data?.ok) {
        throw new Error(invokeError?.message || data?.error || 'Failed to retry issuance');
      }

      toast({
        title: 'Issuance retried',
        description: data?.txHash ? `Tx: ${shorten(String(data.txHash), 10, 8)}` : 'Order will update shortly.',
      });
      queryClient.invalidateQueries({ queryKey: ['gaming-bundle-orders'] });
    } catch (err) {
      toast({
        title: 'Retry failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setRetryingOrderId(null);
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
          <p className="text-gray-600 mt-1">Monitor online and offline orders, reissue receipts, and retry Paystack issuance.</p>
        </div>

        <Card className="border border-gray-200 shadow-sm overflow-hidden bg-white">
          <CardHeader className="px-6 py-5 bg-white border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-bold text-gray-900">Order History</CardTitle>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Manage and track your gaming bundle transactions</p>
              </div>
              <div className="relative w-full sm:max-w-xs group">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-gray-400 group-focus-within:text-purple-600 transition-colors" />
                </div>
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search orders..."
                  className="pl-9 h-9 text-sm bg-gray-50 border-gray-200 focus:bg-white focus:ring-purple-500/10 focus:border-purple-500 transition-all rounded-lg"
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-600 mt-2">
                {error instanceof Error ? error.message : 'Failed to load orders'}
              </p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[1300px]">
                <TableHeader className="bg-gray-50/50 border-y border-gray-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-11 px-6 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">Order</TableHead>
                    <TableHead className="h-11 px-4 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">Bundle</TableHead>
                    <TableHead className="h-11 px-4 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">Payment</TableHead>
                    <TableHead className="h-11 px-4 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">Reference</TableHead>
                    <TableHead className="h-11 px-4 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">Buyer</TableHead>
                    <TableHead className="h-11 px-4 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">Status</TableHead>
                    <TableHead className="h-11 px-4 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">Issuance</TableHead>
                    <TableHead className="h-11 px-4 text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">Redeemed</TableHead>
                    <TableHead className="h-11 px-6 text-right text-[11px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12">
                        <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                          <span>Loading order history...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                        No orders found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order) => (
                      <TableRow key={order.id} className="group border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <TableCell className="py-6 px-6 align-top">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <code className="px-2 py-1 bg-gray-100 rounded text-[10px] font-medium text-gray-600">
                              {shorten(order.id, 6, 4)}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => copyText(order.id)}
                            >
                              <Copy className="w-3.5 h-3.5 text-gray-400" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="py-6 px-4 align-top">
                          <div className="space-y-1 min-w-[150px]">
                            <div className="text-sm font-semibold text-gray-900 leading-tight">
                              {order.gaming_bundles?.title || 'Bundle'}
                            </div>
                            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-tight">
                              {order.gaming_bundles?.quantity_units} {order.gaming_bundles?.unit_label}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-6 px-4 align-top">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
                              {order.payment_provider === 'paystack'
                                ? `${order.fiat_symbol || 'NGN'} ${Number(order.amount_fiat || 0).toLocaleString()}`
                                : order.payment_provider === 'crypto'
                                  ? `DG ${Number(order.amount_dg || 0).toLocaleString()}`
                                  : 'Cash Payment'}
                            </span>
                            {order.payment_provider !== 'cash' && (
                              <Badge variant="secondary" className="w-fit px-1.5 py-0 text-[10px] h-4 font-normal bg-gray-100 text-gray-600 border-none capitalize">
                                {order.payment_provider}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-6 px-4 align-top">
                          {order.payment_reference ? (
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <code className="px-2 py-1 bg-gray-50 rounded text-[10px] font-mono text-gray-500">
                                {shorten(order.payment_reference, 8, 6)}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => copyText(order.payment_reference!)}
                              >
                                <Copy className="w-3.5 h-3.5 text-gray-400" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-300 italic">No reference</span>
                          )}
                        </TableCell>
                        <TableCell className="py-6 px-4 align-top">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900 leading-none whitespace-nowrap">
                              {order.buyer_display_name || 'Guest User'}
                            </div>
                            <div className="text-[10px] text-gray-500 tabular-nums whitespace-nowrap">
                              {order.buyer_phone || order.buyer_address ? (
                                <span className="flex items-center gap-1.5 mt-1">
                                  {order.buyer_phone || ''}
                                  {order.buyer_phone && order.buyer_address && <span className="w-1 h-1 rounded-full bg-gray-300" />}
                                  {order.buyer_address ? shorten(order.buyer_address, 4, 4) : ''}
                                </span>
                              ) : (
                                <span className="italic opacity-60">No contact info</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-6 px-4 align-top">
                          <div className="flex flex-col gap-2">
                            <Badge
                              className={`w-fit shadow-none text-[10px] px-2 py-0 h-5 font-bold transition-colors ${order.status === 'PAID'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100'
                                }`}
                              variant="outline"
                            >
                              {order.status}
                            </Badge>
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                              via {order.fulfillment_method === 'EAS' ? 'POS' : order.fulfillment_method}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-6 px-4 align-top">
                          <div className="space-y-2 min-w-[140px]">
                            {order.fulfillment_method === 'NFT' ? (
                              <>
                                <div className="text-[11px] font-bold text-gray-700 whitespace-nowrap">
                                  {order.token_id ? `Token #${order.token_id}` : 'Token pending...'}
                                </div>
                                {order.txn_hash && (
                                  (() => {
                                    const txUrl = getExplorerTxUrl(order.chain_id, order.txn_hash);
                                    return (
                                      <a
                                        className="inline-flex items-center gap-1.5 text-[10px] font-mono text-purple-600 hover:text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap"
                                        href={txUrl || '#'}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <span>{shorten(order.txn_hash, 6, 4)}</span>
                                        <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    );
                                  })()
                                )}
                              </>
                            ) : (
                              <>
                                <div className={`text-[11px] font-bold whitespace-nowrap ${order.eas_uid ? 'text-gray-700' : 'text-amber-600 flex items-center gap-1.5'}`}>
                                  {!order.eas_uid && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                                  {order.eas_uid ? 'EAS issued' : 'EAS pending'}
                                </div>
                                {order.eas_uid && (
                                  <div className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded w-fit whitespace-nowrap mt-1">
                                    {shorten(order.eas_uid, 6, 4)}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-6 px-4 align-top">
                          <div className={`text-[10px] font-black px-2 py-0.5 rounded-sm w-fit whitespace-nowrap ${order.redeemed_at
                            ? 'bg-blue-50 text-blue-600 border border-blue-100'
                            : 'bg-gray-100 text-gray-400 border border-gray-200'
                            }`}>
                            {order.redeemed_at ? 'REDEEMED' : 'PENDING'}
                          </div>
                        </TableCell>
                        <TableCell className="py-6 px-6 align-top text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-[11px] font-medium border-gray-200 hover:bg-gray-50 hover:text-gray-900 transition-all disabled:opacity-30"
                              disabled={
                                order.payment_provider !== 'paystack' ||
                                order.fulfillment_method !== 'NFT' ||
                                !order.payment_reference ||
                                Boolean(order.txn_hash) ||
                                retryingOrderId === order.id
                              }
                              onClick={() => handleRetryIssuance(order.id)}
                            >
                              {retryingOrderId === order.id ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                              ) : (
                                <RefreshCw className="w-3 h-3 mr-1.5" />
                              )}
                              Retry
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-[11px] font-medium border-gray-200 hover:bg-gray-50 hover:text-gray-900 transition-all disabled:opacity-30"
                              disabled={!order.can_reissue || rotatingOrderId === order.id}
                              onClick={() => handleReissue(order.id)}
                            >
                              {rotatingOrderId === order.id ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                              ) : (
                                <RotateCcw className="w-3 h-3 mr-1.5" />
                              )}
                              Reissue
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
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
