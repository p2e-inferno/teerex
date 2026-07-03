import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Gift, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { useUserPayoutAccount } from '@/hooks/useUserPayoutAccount';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Bell } from 'lucide-react';
import { DgRedemptionFlowPanel } from './dg-redemption/DgRedemptionFlowPanel';
import { DgRedemptionHistoryList } from './dg-redemption/DgRedemptionHistoryList';
import { useDgRedemptionFlow } from './dg-redemption/useDgRedemptionFlow';
import {
  formatCountdown,
  payoutMethodOf,
  RECENT_REDEMPTIONS_PAGE_SIZE,
  type DgPayoutMethod,
  type RedemptionLimits,
  type RedemptionMethods,
  type RedemptionPagination,
  type RedemptionStatus,
} from './dg-redemption/types';

interface DgRedemptionCardProps {
  address: string;
  chainId: number;
}

export const DgRedemptionCard: React.FC<DgRedemptionCardProps> = ({ address, chainId }) => {
  const { getAccessToken } = usePrivy();
  const { payoutAccount, isLoading: isBankLoading } = useUserPayoutAccount();

  const fiatEnvEnabled = useMemo(() => {
    const raw = (import.meta as any).env?.VITE_ENABLE_FIAT;
    if (raw === undefined || raw === null || raw === '') return false;
    return String(raw).toLowerCase() === 'true';
  }, []);

  const [methods, setMethods] = useState<RedemptionMethods | null>(null);
  const [activeTab, setActiveTab] = useState<DgPayoutMethod>('ngn');
  const userChoseTab = useRef(false);
  const [payoutWalletAddress, setPayoutWalletAddress] = useState(address.toLowerCase());
  const userChoseWallet = useRef(false);

  const [recentRedemptions, setRecentRedemptions] = useState<RedemptionStatus[]>([]);
  const [recentPagination, setRecentPagination] = useState<RedemptionPagination>({
    total: 0,
    limit: RECENT_REDEMPTIONS_PAGE_SIZE,
    offset: 0,
    has_more: false,
  });
  const [limits, setLimits] = useState<RedemptionLimits | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryPageLoading, setIsHistoryPageLoading] = useState(false);
  const [notifyingIntentId, setNotifyingIntentId] = useState<string | null>(null);
  const [notifyCooldowns, setNotifyCooldowns] = useState<Record<string, string>>({});
  const [cancelIntentId, setCancelIntentId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [expiredReviewTarget, setExpiredReviewTarget] = useState<RedemptionStatus | null>(null);
  const [expiredReviewTxHash, setExpiredReviewTxHash] = useState('');

  useEffect(() => {
    if (userChoseWallet.current) return;
    setPayoutWalletAddress(address.toLowerCase());
  }, [address]);

  useEffect(() => {
    if (Object.keys(notifyCooldowns).length === 0) return;
    const id = window.setInterval(() => {
      setNotifyCooldowns((current) => {
        const active = Object.fromEntries(
          Object.entries(current).filter(([, nextNotifyAt]) => new Date(nextNotifyAt).getTime() > Date.now())
        );
        return Object.keys(active).length === Object.keys(current).length ? { ...current } : active;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [notifyCooldowns]);

  const rememberNotifyCooldowns = useCallback((redemptions: RedemptionStatus[] | null | undefined) => {
    const entries = (redemptions || [])
      .filter((redemption) =>
        redemption.next_admin_notify_at &&
        new Date(redemption.next_admin_notify_at).getTime() > Date.now()
      )
      .map((redemption) => [redemption.id, redemption.next_admin_notify_at as string]);
    if (entries.length === 0) return;
    setNotifyCooldowns((current) => ({ ...current, ...Object.fromEntries(entries) }));
  }, []);

  const loadHistory = useCallback(async (options?: { offset?: number; append?: boolean }) => {
    const offset = Math.max(options?.offset || 0, 0);
    const append = Boolean(options?.append);
    if (append) {
      setIsHistoryPageLoading(true);
    } else {
      setIsHistoryLoading(true);
    }
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({
        limit: String(RECENT_REDEMPTIONS_PAGE_SIZE),
        offset: String(offset),
      });
      const data = await callEdgeFunction<any>(`list-user-dg-redemptions?${params.toString()}`, {}, {
        privyToken: token,
        withAnonKey: true,
        method: 'GET',
      });
      const redemptions = data.redemptions || [];
      setRecentRedemptions((current) => {
        if (!append) return redemptions;
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...redemptions.filter((item: RedemptionStatus) => !existingIds.has(item.id))];
      });
      setRecentPagination(data.pagination || {
        total: redemptions.length,
        limit: RECENT_REDEMPTIONS_PAGE_SIZE,
        offset,
        has_more: false,
      });
      setLimits(data.limits || null);
      if (data.methods) {
        setMethods({
          ngn_enabled: Boolean(data.methods.ngn_enabled),
          usdc_enabled: Boolean(data.methods.usdc_enabled),
        });
      }
      rememberNotifyCooldowns(redemptions);
    } finally {
      setIsHistoryLoading(false);
      setIsHistoryPageLoading(false);
    }
  }, [getAccessToken, rememberNotifyCooldowns]);

  useEffect(() => {
    loadHistory().catch((error) => {
      console.error('Failed to load Redeem DG history:', error);
    });
  }, [loadHistory]);

  const cryptoTabDisabled = methods ? !methods.usdc_enabled : false;
  const fiatTabDisabled = !fiatEnvEnabled || (methods ? !methods.ngn_enabled : false);

  useEffect(() => {
    if (!methods || userChoseTab.current) return;
    setActiveTab(methods.usdc_enabled ? 'usdc' : 'ngn');
  }, [methods]);

  useEffect(() => {
    if (activeTab === 'usdc' && cryptoTabDisabled && !fiatTabDisabled) setActiveTab('ngn');
    if (activeTab === 'ngn' && fiatTabDisabled && !cryptoTabDisabled) setActiveTab('usdc');
  }, [activeTab, cryptoTabDisabled, fiatTabDisabled]);

  const refreshHistory = useCallback(() => {
    loadHistory().catch((error) => {
      console.error('Failed to refresh Redeem DG history:', error);
    });
  }, [loadHistory]);

  const ngnFlow = useDgRedemptionFlow({
    payoutMethod: 'ngn',
    address,
    chainId,
    limits,
    hasPayoutAccount: Boolean(payoutAccount),
    onHistoryChanged: refreshHistory,
    rememberNotifyCooldowns,
  });
  const usdcFlow = useDgRedemptionFlow({
    payoutMethod: 'usdc',
    address,
    chainId,
    payoutWalletAddress,
    limits,
    hasPayoutAccount: true,
    onHistoryChanged: refreshHistory,
    rememberNotifyCooldowns,
  });
  const flowFor = (method: DgPayoutMethod) => (method === 'usdc' ? usdcFlow : ngnFlow);

  const getNotifyCooldownMs = useCallback((intentId?: string | null) => {
    if (!intentId) return 0;
    const nextNotifyAt = notifyCooldowns[intentId];
    if (!nextNotifyAt) return 0;
    return Math.max(new Date(nextNotifyAt).getTime() - Date.now(), 0);
  }, [notifyCooldowns]);

  const notifyButtonContent = useCallback((intentId?: string | null) => {
    const cooldownMs = getNotifyCooldownMs(intentId);
    if (cooldownMs > 0) return `Notify Admin (${formatCountdown(new Date(Date.now() + cooldownMs).toISOString())})`;
    return 'Notify Admin';
  }, [getNotifyCooldownMs]);

  const notifyAdmin = useCallback(async (intentId: string) => {
    if (!intentId) return;
    if (getNotifyCooldownMs(intentId) > 0) return;
    setNotifyingIntentId(intentId);
    try {
      const token = await getAccessToken();
      const data = await callEdgeFunction<any>('notify-dg-redemption-admin', {
        intent_id: intentId,
      }, {
        privyToken: token,
        withAnonKey: true,
      });
      if (data.next_notify_at) {
        setNotifyCooldowns((current) => ({ ...current, [intentId]: data.next_notify_at }));
      }
      await loadHistory();
      toast.success('Admin notified');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to notify admin');
    } finally {
      setNotifyingIntentId(null);
    }
  }, [getAccessToken, getNotifyCooldownMs, loadHistory]);

  const requestCancel = useCallback((intentId: string) => {
    setCancelIntentId(intentId);
    setShowCancelDialog(true);
  }, []);

  const handleCancel = useCallback(async (intentId: string) => {
    setIsCancelling(true);
    try {
      const token = await getAccessToken();
      await callEdgeFunction<any>('cancel-dg-redemption', {
        intent_id: intentId,
      }, {
        privyToken: token,
        withAnonKey: true,
      });
      ngnFlow.clearQuote(intentId);
      usdcFlow.clearQuote(intentId);
      toast.success('Redeem DG request cancelled');
      refreshHistory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel Redeem DG request');
    } finally {
      setIsCancelling(false);
      setShowCancelDialog(false);
      setCancelIntentId(null);
    }
  }, [getAccessToken, ngnFlow, usdcFlow, refreshHistory]);

  const resumeRedemption = useCallback((item: RedemptionStatus) => {
    const method = payoutMethodOf(item);
    if ((method === 'usdc' && cryptoTabDisabled) || (method === 'ngn' && fiatTabDisabled)) {
      toast.error('This Redeem DG method is currently unavailable');
      return;
    }
    userChoseTab.current = true;
    setActiveTab(method);
    flowFor(method).resume(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cryptoTabDisabled, fiatTabDisabled, ngnFlow, usdcFlow]);

  const openExpiredReviewDialog = useCallback((item: RedemptionStatus) => {
    setExpiredReviewTarget(item);
    setExpiredReviewTxHash('');
  }, []);

  const submitExpiredReviewDialog = useCallback(async () => {
    if (!expiredReviewTarget) return;
    const flow = flowFor(payoutMethodOf(expiredReviewTarget));
    const submitted = await flow.requestExpiredReviewFor(expiredReviewTarget.id, expiredReviewTxHash);
    if (!submitted) return;
    setExpiredReviewTarget(null);
    setExpiredReviewTxHash('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiredReviewTarget, expiredReviewTxHash, ngnFlow, usdcFlow]);

  const isRequestingExpiredReview = ngnFlow.isRequestingExpiredReview || usdcFlow.isRequestingExpiredReview;

  const panelProps = {
    address,
    chainId,
    limits,
    payoutAccount,
    isBankLoading,
    payoutWalletAddress,
    onPayoutWalletChange: (next: string) => {
      userChoseWallet.current = true;
      setPayoutWalletAddress(next.toLowerCase());
    },
    notifyAdmin,
    notifyingIntentId,
    getNotifyCooldownMs,
    notifyButtonContent,
    onRequestCancel: requestCancel,
    isCancelling,
    cancelIntentId,
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5" />
          Redeem DG
        </CardTitle>
        <CardDescription>
          Redeem DG rewards as USDC to a linked wallet or to your saved Nigerian bank account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {cryptoTabDisabled && fiatTabDisabled ? (
          <Alert>
            <AlertDescription>Redeem DG is currently unavailable. Check back later.</AlertDescription>
          </Alert>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              userChoseTab.current = true;
              setActiveTab(value === 'usdc' ? 'usdc' : 'ngn');
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="usdc" disabled={cryptoTabDisabled}>
                Crypto (USDC)
              </TabsTrigger>
              <TabsTrigger value="ngn" disabled={fiatTabDisabled}>
                Fiat (NGN)
              </TabsTrigger>
            </TabsList>
            <TabsContent value="usdc" className="mt-4">
              {cryptoTabDisabled ? (
                <p className="text-sm text-muted-foreground">Crypto redemption is currently disabled.</p>
              ) : (
                <DgRedemptionFlowPanel flow={usdcFlow} {...panelProps} />
              )}
            </TabsContent>
            <TabsContent value="ngn" className="mt-4">
              {fiatTabDisabled ? (
                <p className="text-sm text-muted-foreground">Fiat redemption is currently disabled.</p>
              ) : (
                <DgRedemptionFlowPanel flow={ngnFlow} {...panelProps} />
              )}
            </TabsContent>
          </Tabs>
        )}

        <DgRedemptionHistoryList
          items={recentRedemptions}
          pagination={recentPagination}
          isLoading={isHistoryLoading}
          isPageLoading={isHistoryPageLoading}
          chainId={chainId}
          onRefresh={() => loadHistory({ offset: 0 }).catch((error) => {
            console.error('Failed to refresh Redeem DG history:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to refresh Redeem DG requests');
          })}
          onLoadMore={() => loadHistory({
            offset: recentPagination.offset + recentPagination.limit,
            append: true,
          }).catch((error) => {
            console.error('Failed to load more Redeem DG requests:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to load more Redeem DG requests');
          })}
          onResume={resumeRedemption}
          onRequestExpiredReview={openExpiredReviewDialog}
          onRequestCancel={requestCancel}
          notifyAdmin={notifyAdmin}
          notifyingIntentId={notifyingIntentId}
          getNotifyCooldownMs={getNotifyCooldownMs}
          notifyButtonContent={notifyButtonContent}
          isCancelling={isCancelling}
          cancelIntentId={cancelIntentId}
        />
      </CardContent>

      <Dialog open={Boolean(expiredReviewTarget)} onOpenChange={(open) => {
        if (open) return;
        setExpiredReviewTarget(null);
        setExpiredReviewTxHash('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request admin review</DialogTitle>
            <DialogDescription>
              Submit the transaction hash only if you sent this DG transfer after the expired quote was created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="text-xs text-muted-foreground">Redeem</div>
              <div className="font-medium">{expiredReviewTarget?.amount_dg || expiredReviewTarget?.amount_dg_raw || '0'} DG</div>
              <div className="mt-2 text-xs text-muted-foreground">Quote created</div>
              <div>{expiredReviewTarget?.created_at ? new Date(expiredReviewTarget.created_at).toLocaleString() : 'Unknown'}</div>
            </div>
            <div className="space-y-2">
              <Label>Transaction Hash</Label>
              <Input
                value={expiredReviewTxHash}
                onChange={(event) => setExpiredReviewTxHash(event.target.value.trim())}
                placeholder="0x..."
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setExpiredReviewTarget(null);
                setExpiredReviewTxHash('');
              }}
              disabled={isRequestingExpiredReview}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submitExpiredReviewDialog} disabled={isRequestingExpiredReview}>
              {isRequestingExpiredReview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
              Request Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Redeem DG Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this request? This action cannot be undone, and any details for this transaction will be removed from your view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>No, keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (cancelIntentId) {
                  handleCancel(cancelIntentId);
                }
              }}
              disabled={isCancelling}
            >
              {isCancelling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Yes, cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
