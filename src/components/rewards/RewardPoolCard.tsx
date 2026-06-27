import { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useWallets } from '@privy-io/react-auth';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Lock,
  RotateCcw,
  ShieldAlert,
  Trophy,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getExplorerTxUrl } from '@/lib/config/network-config';
import { cn } from '@/lib/utils';
import { useRewardPoolOnchainState } from '@/hooks/useRewardPoolOnchainState';
import { useRewardControllerActions } from '@/hooks/useRewardControllerActions';
import { RewardPoolBadge } from './RewardPoolBadge';
import { RewardDisputesList } from './RewardDisputesList';
import { AssignWinnersDialog } from './AssignWinnersDialog';
import { RaiseDisputeDialog } from './RaiseDisputeDialog';
import type {
  RewardDisputeCategory,
  RewardPool,
  RewardPoolOnchainPosition,
} from '@/types/rewardPool';

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}...${a.slice(-6)}` : '-');
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '-');

const isoToSecs = (iso?: string | null): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};

const formatCountdown = (targetSecs: number | null | undefined, nowSecs: number): string | null => {
  if (!targetSecs) return null;
  const diff = targetSecs - nowSecs;
  if (diff <= 0) return 'Now';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatDateFromSecs = (secs: number | null | undefined): string => (
  secs ? new Date(secs * 1000).toLocaleString() : '-'
);

type DisplayPosition = RewardPoolOnchainPosition;

interface TimelineItemProps {
  icon: 'clock' | 'calendar' | 'check' | 'warn';
  label: string;
  value: string;
  detail?: string;
  muted?: boolean;
}

function TimelineItem({ icon, label, value, detail, muted }: TimelineItemProps) {
  const Icon = icon === 'calendar'
    ? CalendarClock
    : icon === 'check'
      ? CheckCircle2
      : icon === 'warn'
        ? AlertTriangle
        : Clock;

  return (
    <div className={cn(
      'rounded-lg border px-3 py-2.5',
      muted ? 'border-slate-200 bg-slate-50/70' : 'border-amber-200/70 bg-amber-50/60',
    )}>
      <div className="flex items-start gap-2">
        <span className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          muted ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700',
        )}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className={cn(
          'min-w-0 pt-0.5 text-[11px] font-bold uppercase leading-tight tracking-normal',
          muted ? 'text-slate-500' : 'text-amber-700',
        )}>
          {label}
        </div>
      </div>
      <div className="mt-3 text-xl font-bold leading-tight text-slate-950">{value}</div>
      {detail && <div className="mt-1 break-words text-xs leading-snug text-slate-500">{detail}</div>}
    </div>
  );
}

interface Props {
  pool: RewardPool;
  viewerAddress?: string | null;
  isTicketHolder: boolean;
  eventEndsAt?: string | null;
}

export function RewardPoolCard({ pool, viewerAddress, isTicketHolder, eventEndsAt }: Props) {
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const onchain = useRewardPoolOnchainState(pool.controller_address, pool.pool_id, pool.chain_id);
  const actions = useRewardControllerActions(wallet);
  const onchainData = onchain.data;
  const refetchOnchain = onchain.refetch;

  const [assignOpen, setAssignOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputePlacement, setDisputePlacement] = useState<number | null>(null);
  const [copiedWinner, setCopiedWinner] = useState<string | null>(null);
  const [nowSecs, setNowSecs] = useState(() => Math.floor(Date.now() / 1000));

  const decimals = pool.token_decimals ?? 18;
  const symbol = pool.payout_token_symbol ?? 'ETH';
  const fmt = (wei: string | bigint) => `${ethers.formatUnits(wei ?? '0', decimals)} ${symbol}`;

  const viewer = viewerAddress?.toLowerCase() ?? null;
  const isCreator = viewer != null && viewer === pool.creator_address.toLowerCase();
  const isManager = viewer != null && (pool.managers ?? []).some((m) => m.toLowerCase() === viewer);
  const canManageWinners = isCreator || isManager;
  const eventEndSecs = useMemo(() => isoToSecs(eventEndsAt), [eventEndsAt]);
  const claimStartSecs = onchainData?.claimStart ?? isoToSecs(pool.claim_start);
  const claimEndSecs = onchainData?.claimEnd ?? isoToSecs(pool.claim_end);
  const eventEnded = eventEndSecs == null || nowSecs >= eventEndSecs;

  const positions = useMemo<DisplayPosition[]>(() => {
    if (onchainData?.positions?.length) return onchainData.positions;
    return pool.positions.map((p) => ({
      placement: p.placement,
      amountWei: BigInt(p.amount_wei),
      winner: p.winner_address,
      claimed: p.claimed,
      canClaim: false,
      opensAt: 0,
      assignedAt: p.assigned_at ? Math.floor(new Date(p.assigned_at).getTime() / 1000) : 0,
      holdUntil: p.hold_until ? Math.floor(new Date(p.hold_until).getTime() / 1000) : 0,
      claimedAt: p.claimed_at ? Math.floor(new Date(p.claimed_at).getTime() / 1000) : 0,
    }));
  }, [onchainData, pool.positions]);

  const myPositions = useMemo(
    () => positions.filter((p) => p.winner && p.winner.toLowerCase() === viewer),
    [positions, viewer],
  );

  useEffect(() => {
    const nextClaimOpen = positions
      .filter((p) => p.winner && !p.claimed && !p.canClaim && p.opensAt > nowSecs)
      .reduce((min, p) => Math.min(min, p.opensAt), Number.POSITIVE_INFINITY);
    const nextReclaimOpen = isCreator && onchainData && !onchainData.closed && !onchainData.frozen
      ? onchainData.claimEnd + onchainData.frozenAccrued
      : Number.POSITIVE_INFINITY;
    const nextEventEnd = eventEndSecs && eventEndSecs > nowSecs ? eventEndSecs : Number.POSITIVE_INFINITY;
    const nextClaimStart = claimStartSecs && claimStartSecs > nowSecs ? claimStartSecs : Number.POSITIVE_INFINITY;
    const nextClaimEnd = claimEndSecs && claimEndSecs > nowSecs ? claimEndSecs : Number.POSITIVE_INFINITY;
    const nextAt = Math.min(nextClaimOpen, nextReclaimOpen, nextEventEnd, nextClaimStart, nextClaimEnd);
    const delayMs = Number.isFinite(nextAt)
      ? Math.max(1_000, Math.min((nextAt - nowSecs) * 1000 + 500, 60_000))
      : 60_000;
    const timer = window.setTimeout(() => {
      setNowSecs(Math.floor(Date.now() / 1000));
      if (Number.isFinite(nextAt) && nextAt <= Math.floor(Date.now() / 1000) + 1) {
        void refetchOnchain();
      }
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [claimEndSecs, claimStartSecs, eventEndSecs, isCreator, nowSecs, onchainData, positions, refetchOnchain]);

  const canClaimPosition = (position: { claimed: boolean; canClaim?: boolean; opensAt?: number }) => (
    !position.claimed &&
    !onchainData?.closed &&
    !onchainData?.frozen &&
    (Boolean(position.canClaim) || Boolean(position.opensAt && nowSecs >= position.opensAt))
  );

  const closeBlockedReason = useMemo(() => {
    if (!isCreator) return 'Only the prize pool creator can cancel it.';
    if (!onchainData) return 'Checking on-chain cancellation status...';
    if (onchainData.closed) return 'This prize pool is already closed.';
    if (onchainData.frozen) return 'This prize pool is frozen while a dispute is reviewed.';
    if (onchainData.assignedCount > 0) {
      return 'Winners are already declared. Unclaimed prize funds can be reclaimed after the claim window closes.';
    }
    if (onchainData.ticketSupply === null) return 'Checking ticket supply before cancellation...';
    if (onchainData.ticketSupply === 0n) return null;
    if (onchainData.attendanceEarlyExitReady) return null;
    if (onchainData.attendanceCancelInitiated && !onchainData.attendanceRefundComplete) {
      return 'Event cancellation refunds are still in progress. The prize pool can be cancelled after those refunds complete.';
    }
    return 'This prize pool is locked for winner claims. You can reclaim any unclaimed prize funds after the claim window closes.';
  }, [isCreator, onchainData]);

  const assignBlockedReason = useMemo(() => {
    if (!canManageWinners) return null;
    if (!onchainData) return 'Checking on-chain prize pool status...';
    if (onchainData.closed) return 'This prize pool is closed.';
    if (onchainData.frozen) return 'This prize pool is frozen while a dispute is reviewed.';
    if (!eventEnded) return 'Winners can be declared after the event ends.';
    return null;
  }, [canManageWinners, eventEnded, onchainData]);

  const canReclaim = isCreator && onchainData
    ? !onchainData.closed && !onchainData.frozen && nowSecs > onchainData.claimEnd + onchainData.frozenAccrued
    : false;
  const canClose = isCreator && !closeBlockedReason;
  const canOpenAssign = canManageWinners && !assignBlockedReason;
  const showAssignAction = canManageWinners;
  const showCloseAction = isCreator;
  const showReclaimAction = isCreator && canReclaim;
  const showDisputeAction = isTicketHolder && !isCreator;

  const openTx = async () => {
    if (!pool.tx_hash) return;
    try {
      const url = await getExplorerTxUrl(pool.chain_id, pool.tx_hash);
      window.open(url, '_blank', 'noopener');
    } catch { /* explorer not configured */ }
  };

  const submitDispute = async (input: { category: RewardDisputeCategory; reasonText: string }) => {
    if (!viewerAddress) return;
    const ok = await actions.raiseDispute(pool, {
      placement: disputePlacement,
      category: input.category,
      reasonText: input.reasonText,
      disputerAddress: viewerAddress,
    });
    if (ok) setDisputeOpen(false);
  };

  const cancelReadyLabel = onchainData?.ticketSupply === 0n
    ? 'Ready: no tickets issued'
    : onchainData?.attendanceEarlyExitReady
      ? 'Ready: event cancelled and refunds complete'
      : null;

  const closeHelperText = cancelReadyLabel
    ? `${cancelReadyLabel}. Canceling returns the prize escrow to the creator.`
    : closeBlockedReason;
  const showActionPanel = (
    showAssignAction ||
    showCloseAction ||
    showReclaimAction ||
    showDisputeAction ||
    Boolean(assignBlockedReason) ||
    (isCreator && Boolean(closeHelperText))
  );

  const copyWinnerAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedWinner(address.toLowerCase());
      window.setTimeout(() => setCopiedWinner((current) => (
        current === address.toLowerCase() ? null : current
      )), 1500);
    } catch {
      // Copy failure is non-blocking; the address remains visible.
    }
  };

  return (
    <Card className="overflow-hidden rounded-lg border-amber-100/80 bg-gradient-to-br from-white via-white to-amber-50/40 shadow-sm">
      <CardHeader className="space-y-4 border-b border-amber-100/70 pb-4">
        <div className="flex justify-end">
          <RewardPoolBadge status={pool.status} />
        </div>

        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200/70">
            <Trophy className="h-5 w-5" />
          </span>
          <div className="min-w-0 text-xl font-semibold leading-tight text-slate-950">Prize pool</div>
        </div>

        <div className="rounded-lg border border-amber-100 bg-white/80 p-3">
          <div className="break-words text-2xl font-bold leading-tight text-slate-950">{fmt(pool.total_funded_wei)}</div>
          <button onClick={openTx} className="mt-2 inline-flex max-w-full items-center gap-1 text-xs font-medium text-slate-500 hover:text-amber-700 hover:underline">
            <span className="truncate">Verify on-chain</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span>Prize funds are escrowed on-chain and pay only to declared winners. Ticket holders can dispute results before claims open.</span>
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 text-sm">
        <div className="grid grid-cols-1 gap-2">
          {eventEndSecs && (
            <TimelineItem
              icon={eventEnded ? 'check' : 'clock'}
              label="Winner declaration opens"
              value={formatCountdown(eventEndSecs, nowSecs) ?? fmtDate(eventEndsAt)}
              detail={formatDateFromSecs(eventEndSecs)}
              muted={eventEnded}
            />
          )}
          <TimelineItem
            icon={claimStartSecs && nowSecs >= claimStartSecs ? 'check' : 'calendar'}
            label="Claim opens"
            value={formatCountdown(claimStartSecs, nowSecs) ?? fmtDate(pool.claim_start)}
            detail={formatDateFromSecs(claimStartSecs)}
            muted={Boolean(claimStartSecs && nowSecs >= claimStartSecs)}
          />
          <TimelineItem
            icon={claimEndSecs && nowSecs >= claimEndSecs ? 'warn' : 'clock'}
            label="Claim closes"
            value={formatCountdown(claimEndSecs, nowSecs) ?? fmtDate(pool.claim_end)}
            detail={formatDateFromSecs(claimEndSecs)}
            muted={Boolean(claimEndSecs && nowSecs >= claimEndSecs)}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white/85 p-3">
          <div className="mb-3 space-y-3">
            <div className="flex justify-end">
              <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium leading-tight text-slate-600">
                {Math.round(pool.challenge_window_secs / 3600)}h dispute window
              </div>
            </div>
            <div>
              <div className="font-semibold text-slate-950">Declared winners</div>
              <div className="text-xs text-slate-500">
                {positions.some((p) => p.winner) ? 'Event winner assignments' : 'No winners declared yet'}
              </div>
            </div>
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {positions.map((p) => {
              const claimable = canClaimPosition(p);
              const winnerAddress = p.winner;
              const copied = winnerAddress ? copiedWinner === winnerAddress.toLowerCase() : false;
              return (
                <div key={p.placement} className="rounded-md bg-slate-50/80 px-3 py-2">
                  {winnerAddress ? (
                    <div className="space-y-1.5">
                      <div className="font-medium text-slate-600">#{p.placement} · {fmt(p.amountWei)}</div>
                      <div className="flex flex-wrap items-center gap-2 text-slate-950">
                        <span className="font-medium">{short(winnerAddress)}</span>
                        <button
                          type="button"
                          onClick={() => copyWinnerAddress(winnerAddress)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900"
                          aria-label="Copy winner address"
                          title={copied ? 'Copied' : 'Copy winner address'}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        {p.claimed && <span className="text-xs font-medium text-emerald-600">claimed</span>}
                        {claimable && (
                          <span className="text-xs font-medium text-blue-600">claimable</span>
                        )}
                        {isTicketHolder && !isCreator && !p.claimed && (
                          <button
                            onClick={() => { setDisputePlacement(p.placement); setDisputeOpen(true); }}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Dispute result
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-600">#{p.placement} · {fmt(p.amountWei)}</span>
                      <span className="text-slate-950">TBD</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {myPositions.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
            <div className="font-medium text-blue-950">Your prizes</div>
            {myPositions.map((p) => (
              <div key={p.placement} className="flex items-center justify-between gap-3">
                <span>#{p.placement} · {fmt(p.amountWei)}</span>
                {p.claimed ? (
                  <span className="text-xs font-medium text-emerald-600">Claimed</span>
                ) : canClaimPosition(p) ? (
                  <Button size="sm" disabled={actions.isBusy} onClick={() => actions.claim(pool, p.placement)}>
                    {actions.isBusy ? 'Claiming...' : 'Claim'}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {p.opensAt ? `Opens ${new Date(p.opensAt * 1000).toLocaleString()}` : 'Not open yet'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {showActionPanel && (
          <div className="rounded-lg border border-slate-200 bg-white/75 p-3">
            <div className="flex flex-wrap gap-2">
              {showAssignAction && (
                <Button
                  size="sm"
                  onClick={() => setAssignOpen(true)}
                  disabled={actions.isBusy || !canOpenAssign}
                  className="bg-slate-900 text-white shadow-sm hover:bg-slate-800"
                >
                  Assign winners
                </Button>
              )}
              {showCloseAction && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => actions.close(pool)}
                  disabled={actions.isBusy || !canClose}
                  className={cn(
                    'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
                    !canClose && 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-50',
                  )}
                >
                  <RotateCcw className="h-4 w-4" />
                  Cancel prize pool
                </Button>
              )}
              {showReclaimAction && (
                <Button size="sm" variant="outline" onClick={() => actions.reclaim(pool)} disabled={actions.isBusy}>
                  Reclaim unclaimed
                </Button>
              )}
              {showDisputeAction && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setDisputePlacement(null); setDisputeOpen(true); }}
                  disabled={actions.isBusy}
                >
                  <ShieldAlert className="h-4 w-4" /> Raise a dispute
                </Button>
              )}
            </div>

            {(assignBlockedReason || closeHelperText) && (
              <div className="mt-3 space-y-1 text-xs leading-relaxed text-slate-500">
                {assignBlockedReason && <p>{assignBlockedReason}</p>}
                {isCreator && closeHelperText && <p>{closeHelperText}</p>}
              </div>
            )}
          </div>
        )}

        <RewardDisputesList
          rewardPoolId={pool.id}
          requesterAddress={viewerAddress}
          enabled={isCreator || isTicketHolder}
        />
      </CardContent>

      <AssignWinnersDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        positions={positions}
        busy={actions.isBusy}
        onSubmit={async (batch) => { const ok = await actions.assign(pool, batch); if (ok) setAssignOpen(false); }}
      />
      <RaiseDisputeDialog
        open={disputeOpen}
        onOpenChange={setDisputeOpen}
        placement={disputePlacement}
        busy={actions.isBusy}
        onSubmit={submitDispute}
      />
    </Card>
  );
}
