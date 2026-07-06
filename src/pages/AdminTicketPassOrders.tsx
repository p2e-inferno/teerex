import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { ArrowLeft, Banknote, Loader2, RefreshCw, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IdentityName } from '@/components/identity/IdentityName';

interface AdminPassOrder {
  id: string;
  status: string;
  amount_fiat: number | null;
  fiat_symbol: string | null;
  buyer_email: string | null;
  buyer_address: string | null;
  payment_reference: string | null;
  refund_status: string | null;
  refund_reference: string | null;
  refund_id: string | null;
  refund_amount_kobo: number | null;
  refund_error: string | null;
  refund_requested_at: string | null;
  refund_processed_at: string | null;
  refund_last_synced_at: string | null;
  issuance_attempts: number | null;
  last_error: string | null;
  updated_at: string;
  token_id: string | null;
  pass: { title: string } | null;
}

const STATUS_FILTERS = ['queue', 'NEEDS_REVIEW', 'FAILED', 'REFUND_NEEDS_ATTENTION', 'REFUND_FAILED', 'REFUND_PENDING', 'DISPENSED', 'REFUNDED', 'all'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const FILTER_LABELS: Record<StatusFilter, string> = {
  queue: 'Review queue',
  NEEDS_REVIEW: 'Needs review',
  FAILED: 'Failed',
  REFUND_NEEDS_ATTENTION: 'Refund needs attention',
  REFUND_FAILED: 'Refund failed',
  REFUND_PENDING: 'Refund pending',
  DISPENSED: 'Delivered',
  REFUNDED: 'Refunded',
  all: 'All orders',
};

const STATUS_LABELS: Record<string, string> = {
  DISPENSED: 'Delivered',
  PAID: 'Paid',
  NEEDS_REVIEW: 'Needs review',
  FAILED: 'Failed',
  REFUND_PENDING: 'Refund pending',
  REFUND_NEEDS_ATTENTION: 'Refund needs attention',
  REFUND_FAILED: 'Refund failed',
  REFUNDED: 'Refunded',
  PENDING: 'Pending',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DISPENSED: 'default',
  PAID: 'secondary',
  NEEDS_REVIEW: 'secondary',
  FAILED: 'destructive',
  REFUND_PENDING: 'secondary',
  REFUND_NEEDS_ATTENTION: 'secondary',
  REFUND_FAILED: 'destructive',
  REFUNDED: 'outline',
  PENDING: 'outline',
};

const AdminTicketPassOrders: React.FC = () => {
  const { getAccessToken } = usePrivy();
  const [orders, setOrders] = useState<AdminPassOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('queue');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams();
      // "queue" leaves status unset so the backend returns its default NEEDS_REVIEW + FAILED view.
      if (statusFilter !== 'queue') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '100');
      const data = await callEdgeFunction<{ orders: AdminPassOrder[] }>(
        `admin-list-ticket-pass-orders?${params.toString()}`,
        {},
        { privyToken: token, withAnonKey: true, method: 'GET' },
      );
      setOrders(data.orders || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = useCallback(
    async (order: AdminPassOrder, action: 'retry' | 'mark_externally_resolved' | 'retry_refund') => {
      if (action === 'mark_externally_resolved') {
        const note = window.prompt('Resolution note required (e.g. Paystack refund reference / support ticket):')?.trim();
        if (!note) return;
        if (!window.confirm('Mark this refund externally resolved? Use this only after confirming the customer has been handled.')) return;
        setBusyId(order.id);
        try {
          const token = await getAccessToken();
          await callEdgeFunction('admin-resolve-ticket-pass-order', { order_id: order.id, action, note }, { privyToken: token, withAnonKey: true });
          toast.success('Refund marked resolved');
          await load();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Action failed');
        } finally {
          setBusyId(null);
        }
        return;
      }

      if (action === 'retry_refund') {
        const payload: Record<string, unknown> = { order_id: order.id, action };
        if (order.status === 'REFUND_NEEDS_ATTENTION') {
          const accountNumber = window.prompt('Customer refund account number from Paystack/support:')?.trim();
          if (!accountNumber) return;
          const bankId = window.prompt('Paystack bank ID for that account:')?.trim();
          if (!bankId) return;
          payload.refund_account_details = { account_number: accountNumber, bank_id: bankId };
        }
        setBusyId(order.id);
        try {
          const token = await getAccessToken();
          await callEdgeFunction('admin-resolve-ticket-pass-order', payload, { privyToken: token, withAnonKey: true });
          toast.success('Refund retry submitted');
          await load();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Refund retry failed');
        } finally {
          setBusyId(null);
        }
        return;
      }

      setBusyId(order.id);
      try {
        const token = await getAccessToken();
        const res = await callEdgeFunction<{ needs_review?: boolean; refunded?: boolean; refund_pending?: boolean; tokenId?: string | null }>(
          'admin-resolve-ticket-pass-order',
          { order_id: order.id, action: 'retry' },
          { privyToken: token, withAnonKey: true },
        );
        if (res.refunded) toast.success('Order auto-refunded');
        else if (res.refund_pending) toast.success('Refund started');
        else if (res.needs_review) toast.warning('Retry still needs review — underlying issue persists');
        else if (res.tokenId) toast.success(`Delivered (token #${res.tokenId})`);
        else toast.success('Retry submitted');
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Retry failed');
      } finally {
        setBusyId(null);
      }
    },
    [getAccessToken, load],
  );

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to admin
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Ticket Pass Orders</CardTitle>
          <CardDescription>
            Review paid orders that failed to deliver. Reconcile and refund via Paystack, then mark the order refunded,
            or retry issuance once the cause is resolved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 space-y-3">
            <div
              className="w-full overflow-x-auto overscroll-x-contain pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Ticket pass order filters"
            >
              <div className="flex w-max min-w-full gap-2 whitespace-nowrap">
                {STATUS_FILTERS.map((f) => (
                  <Button
                    key={f}
                    variant={statusFilter === f ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter(f)}
                    className="h-10 shrink-0 px-4 text-sm"
                    role="tab"
                    aria-selected={statusFilter === f}
                  >
                    {FILTER_LABELS[f]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex w-full items-center gap-2 sm:justify-end">
              <Input
                placeholder="Search reference, email, or wallet"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load()}
                className="min-w-0 flex-1 sm:max-w-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={load}
                disabled={loading}
                className="h-10 w-10 shrink-0"
              >
                <span className="sr-only">Refresh orders</span>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">No orders.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pass</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Last error</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const retryableDelivery = o.status === 'NEEDS_REVIEW' || o.status === 'FAILED';
                    const retryableRefund = o.status === 'REFUND_FAILED' || o.status === 'REFUND_NEEDS_ATTENTION';
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.pass?.title || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[o.status] || 'outline'}>
                            {STATUS_LABELS[o.status] || o.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {o.amount_fiat != null ? `${o.fiat_symbol || 'NGN'} ${o.amount_fiat}` : '—'}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate" title={o.buyer_email || o.buyer_address || ''}>
                          {o.buyer_email || (
                            o.buyer_address ? <IdentityName address={o.buyer_address} /> : '—'
                          )}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate" title={o.payment_reference || ''}>
                          {o.payment_reference || '—'}
                        </TableCell>
                        <TableCell>{o.issuance_attempts ?? 0}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-gray-500" title={o.last_error || ''}>
                          {o.refund_error || o.last_error || '—'}
                          {o.refund_status && (
                            <div className="text-[11px] text-gray-400">
                              Refund: {o.refund_status}{o.refund_last_synced_at ? ` · ${new Date(o.refund_last_synced_at).toLocaleString()}` : ''}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {retryableDelivery || retryableRefund ? (
                            <div className="inline-flex gap-2">
                              {retryableDelivery && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={busyId === o.id}
                                  onClick={() => resolve(o, 'retry')}
                                >
                                  {busyId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                                  <span className="ml-1">Retry delivery</span>
                                </Button>
                              )}
                              {retryableRefund && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={busyId === o.id}
                                  onClick={() => resolve(o, 'retry_refund')}
                                >
                                  {busyId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                                  <span className="ml-1">Retry refund</span>
                                </Button>
                              )}
                              {retryableRefund && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={busyId === o.id}
                                  onClick={() => resolve(o, 'mark_externally_resolved')}
                                >
                                  <Banknote className="h-4 w-4" />
                                  <span className="ml-1">Resolved</span>
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminTicketPassOrders;
