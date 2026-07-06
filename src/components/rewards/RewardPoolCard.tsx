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
import { FieldHelp } from '@/components/ui/field-help';
import { getExplorerTxUrl } from '@/lib/config/network-config';
import { cn } from '@/lib/utils';
import { formatCountdownLabelFromMs } from '@/utils/dateUtils';
import { useRewardPoolOnchainState } from '@/hooks/useRewardPoolOnchainState';
import { useRewardControllerActions } from '@/hooks/useRewardControllerActions';
import { IdentityName } from '@/components/identity/IdentityName';
import { RewardPoolBadge } from './RewardPoolBadge';
import { RewardDisputesList } from './RewardDisputesList';
import { AssignWinnersDialog } from './AssignWinnersDialog';
import { RaiseDisputeDialog } from './RaiseDisputeDialog';
import type {
  RewardDisputeCategory,
  RewardPool,
  RewardPoolOnchainPosition,
} from '@/types/rewardPool';

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '-');

const isoToSecs = (iso?: string | null): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};

const formatCountdown = (targetSecs: number | null | undefined, nowSecs: number): string | null => {
  return formatCountdownLabelFromMs(targetSecs ? targetSecs * 1000 : null, nowSecs * 1000);
};

const formatDateFromSecs = (secs: number | null | undefined): string => (
  secs ? new Date(secs * 1000).toLocaleString() : '-'
);

const MIN_CLAIM_DURATION_SECS = 3 * 24 * 60 * 60;
const FREEZE_BACKSTOP_SECS = 30 * 24 * 60 * 60; // MAX_FREEZE_BACKSTOP in TeeRexRewardsControllerV1.

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
  promptWinnerAliases?: boolean;
}

export function RewardPoolCard({ pool, viewerAddress, isTicketHolder, eventEndsAt, promptWinnerAliases = false }: Props) {
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const onchain = useRewardPoolOnchainState(pool.controller_address, pool.pool_id, pool.chain_id);
  const actions = useRewardControllerActions(wallet);
  const onchainData = onchain.data;
  const onchainPending = !onchainData && (onchain.isLoading || onchain.isFetching);
  const onchainVerificationError = !onchainData && onchain.isError;
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
  const poolEndSecs = claimEndSecs != null ? claimEndSecs + (onchainData?.frozenAccrued ?? 0) : null;
  const eventEnded = eventEndSecs == null || nowSecs >= eventEndSecs;
  // Mirrors closePool()'s on-chain `noTickets` gate: the zero-ticket fast exit only exists before
  // claimStart. Once the claim window opens, the creator must use reclaim() after claimEnd instead.
  const noTicketsExitReady = onchainData?.ticketSupply === 0n
    && claimStartSecs != null
    && nowSecs < claimStartSecs;

  // Winner names are off-chain metadata; merge them in by placement regardless of whether the rest
  // of the row comes from the on-chain read or the DB mirror.
  const aliasByPlacement = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const p of pool.positions) map.set(p.placement, p.winner_alias ?? null);
    return map;
  }, [pool.positions]);

  const positions = useMemo<DisplayPosition[]>(() => {
    if (onchainData?.positions?.length) {
      return onchainData.positions.map((p) => ({
        ...p,
        winnerAlias: aliasByPlacement.get(p.placement) ?? null,
      }));
    }
    return pool.positions.map((p) => {
      const assignedAt = p.assigned_at ? Math.floor(new Date(p.assigned_at).getTime() / 1000) : 0;
      const holdUntil = p.hold_until ? Math.floor(new Date(p.hold_until).getTime() / 1000) : 0;
      const opensAt = Math.max(
        claimStartSecs ?? 0,
        assignedAt + pool.challenge_window_secs,
        holdUntil,
      );

      return {
        placement: p.placement,
        amountWei: BigInt(p.amount_wei),
        winner: p.winner_address,
        winnerAlias: p.winner_alias ?? null,
        claimed: p.claimed,
        reclaimed: p.reclaimed ?? false,
        canClaim: false,
        opensAt,
        closesAt: Math.max(poolEndSecs ?? 0, opensAt + MIN_CLAIM_DURATION_SECS),
        assignedAt,
        holdUntil,
        claimedAt: p.claimed_at ? Math.floor(new Date(p.claimed_at).getTime() / 1000) : 0,
      };
    });
  }, [aliasByPlacement, claimStartSecs, onchainData, pool.challenge_window_secs, pool.positions, poolEndSecs]);

  const myPositions = useMemo(
    () => positions.filter((p) => p.winner && p.winner.toLowerCase() === viewer),
    [positions, viewer],
  );
  const hasEditablePlacements = useMemo(
    () => positions.some((p) => !p.claimed && !p.reclaimed),
    [positions],
  );
  const hasUnassignedPlacements = useMemo(
    () => positions.some((p) => !p.claimed && !p.reclaimed && !p.winner),
    [positions],
  );
  const hasDeclaredPlacements = useMemo(
    () => positions.some((p) => !p.claimed && !p.reclaimed && Boolean(p.winner)),
    [positions],
  );
  const canAssignUnassignedPlacements = hasUnassignedPlacements
    && poolEndSecs != null
    && nowSecs <= poolEndSecs;
  const canReplaceDeclaredWinners = hasDeclaredPlacements
    && claimStartSecs != null
    && nowSecs < claimStartSecs;
  const winnerDeclarationClosesSecs = poolEndSecs;

  useEffect(() => {
    const nextClaimOpen = positions
      .filter((p) => p.winner && !p.claimed && !p.reclaimed && !p.canClaim && p.opensAt > nowSecs)
      .reduce((min, p) => Math.min(min, p.opensAt), Number.POSITIVE_INFINITY);
    const nextAssignmentClose = poolEndSecs && poolEndSecs > nowSecs ? poolEndSecs : Number.POSITIVE_INFINITY;
    const nextReclaimOpen = isCreator && onchainData && !onchainData.closed && !onchainData.frozen
      ? onchainData.claimEnd + onchainData.frozenAccrued
      : Number.POSITIVE_INFINITY;
    const nextEventEnd = eventEndSecs && eventEndSecs > nowSecs ? eventEndSecs : Number.POSITIVE_INFINITY;
    const nextClaimStart = claimStartSecs && claimStartSecs > nowSecs ? claimStartSecs : Number.POSITIVE_INFINITY;
    const nextClaimEnd = claimEndSecs && claimEndSecs > nowSecs ? claimEndSecs : Number.POSITIVE_INFINITY;
    const nextAt = Math.min(
      nextAssignmentClose,
      nextClaimOpen,
      nextReclaimOpen,
      nextEventEnd,
      nextClaimStart,
      nextClaimEnd,
    );
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
  }, [claimEndSecs, claimStartSecs, eventEndSecs, isCreator, nowSecs, onchainData, poolEndSecs, positions, refetchOnchain]);

  // A freeze blocks claims/reclaims only until the on-chain backstop (MAX_FREEZE_BACKSTOP); past it,
  // an abandoned freeze no longer locks escrow, so the recovery path must be exposed in the UI.
  const freezeBlocksNow = Boolean(onchainData?.frozen) && onchainData != null &&
    nowSecs <= onchainData.claimEnd + onchainData.frozenAccrued + FREEZE_BACKSTOP_SECS;

  const canClaimPosition = (position: DisplayPosition) => (
    !position.claimed &&
    !position.reclaimed &&
    !onchainData?.closed &&
    !freezeBlocksNow &&
    (Boolean(position.canClaim) ||
      Boolean(
        position.opensAt &&
        position.closesAt &&
        nowSecs >= position.opensAt &&
        nowSecs <= position.closesAt,
      ))
  );

  const canDisputePosition = (position: DisplayPosition) => (
    Boolean(position.winner) &&
    !position.claimed &&
    !position.reclaimed &&
    Boolean(position.opensAt) &&
    nowSecs < position.opensAt
  );

  const closeBlockedReason = useMemo(() => {
    if (!isCreator) return 'Only the prize pool creator can cancel it.';
    if (onchainVerificationError) return 'Unable to verify this prize pool on-chain. If this event still points to an older rewards controller, refresh after the controller and network config are updated.';
    if (onchainPending) return 'Checking on-chain cancellation status...';
    if (!onchainData) return 'This prize pool could not be found on-chain.';
    if (onchainData.closed) return 'This prize pool is already closed.';
    if (onchainData.frozen) return 'This prize pool is frozen while a dispute is reviewed.';
    if (onchainData.assignedCount > 0) {
      return 'Winners are already declared. Prize pool cannot be closed while claims are in progress. Unclaimed prize funds can be reclaimed after the claim window closes.';
    }
    if (onchainData.ticketSupply === null) return 'Checking ticket supply before cancellation...';
    if (noTicketsExitReady) return null;
    if (onchainData.attendanceEarlyExitReady) return null;
    if (onchainData.ticketSupply === 0n) {
      return 'The claim window has already started, so the no-tickets cancellation is no longer available. You can reclaim any unclaimed prize funds after the claim window closes.';
    }
    if (onchainData.attendanceCancelInitiated && !onchainData.attendanceRefundComplete) {
      return 'Event cancellation refunds are still in progress. The prize pool can be cancelled after those refunds complete.';
    }
    return 'This prize pool is locked for winner claims. You can reclaim any unclaimed prize funds after the claim window closes.';
  }, [isCreator, noTicketsExitReady, onchainData, onchainPending, onchainVerificationError]);

  const assignBlockedReason = useMemo(() => {
    if (!canManageWinners) return null;
    if (onchainVerificationError) return 'Unable to verify this prize pool on-chain. If this event still points to an older rewards controller, refresh after the controller and network config are updated.';
    if (onchainPending) return 'Checking on-chain prize pool status...';
    if (!onchainData) return 'This prize pool could not be found on-chain.';
    if (onchainData.closed) return 'This prize pool is closed.';
    if (onchainData.frozen) return 'This prize pool is frozen while a dispute is reviewed.';
    if (!eventEnded) return 'Winners can be declared after the event ends.';
    if (!hasEditablePlacements) return 'All prize placements are already settled.';
    if (hasUnassignedPlacements && !canAssignUnassignedPlacements) {
      return 'Winner declaration closed when the claim window ended. Ask the arbitrator to extend the claim window, then assign again.';
    }
    if (hasDeclaredPlacements && !canReplaceDeclaredWinners && !hasUnassignedPlacements) {
      return 'Declared winners are locked because the claim window has opened.';
    }
    return null;
  }, [
    canAssignUnassignedPlacements,
    canManageWinners,
    canReplaceDeclaredWinners,
    eventEnded,
    hasDeclaredPlacements,
    hasEditablePlacements,
    hasUnassignedPlacements,
    onchainData,
    onchainPending,
    onchainVerificationError,
  ]);

  const canReclaim = isCreator && onchainData
    ? !onchainData.closed && !freezeBlocksNow && nowSecs > onchainData.claimEnd + onchainData.frozenAccrued
    : false;
  const canDisputeAnyPosition = positions.some(canDisputePosition);
  const canClose = isCreator && !closeBlockedReason;
  const canOpenAssign = canManageWinners && !assignBlockedReason;
  const showAssignAction = canManageWinners;
  const showCloseAction = isCreator;
  const showReclaimAction = isCreator && canReclaim;
  const showDisputeAction = isTicketHolder && !isCreator && canDisputeAnyPosition;

  const openTx = async () => {
    if (!pool.tx_hash) return;
    try {
      const url = await getExplorerTxUrl(pool.chain_id, pool.tx_hash);
      window.open(url, '_blank', 'noopener');
    } catch { /* explorer not configured */ }
  };

  const submitDispute = async (input: { category: RewardDisputeCategory; reasonText: string; holdDurationSecs: number }) => {
    if (!viewerAddress) return;
    const ok = await actions.raiseDispute(pool, {
      placement: disputePlacement,
      category: input.category,
      reasonText: input.reasonText,
      holdDurationSecs: input.holdDurationSecs,
      disputerAddress: viewerAddress,
    });
    if (ok) setDisputeOpen(false);
  };

  const cancelReadyLabel = noTicketsExitReady
    ? 'Ready: no tickets issued'
    : onchainData?.attendanceEarlyExitReady
      ? 'Ready: event cancelled and refunds complete'
      : null;

  const closeHelperText = cancelReadyLabel
    ? `${cancelReadyLabel}. Canceling returns the prize escrow to the creator.`
    : closeBlockedReason;
  const closeDisabledReason = !canClose ? closeBlockedReason : null;
  const showActionPanel = (
    showAssignAction ||
    showCloseAction ||
    showReclaimAction ||
    showDisputeAction ||
    Boolean(assignBlockedReason) ||
    (isCreator && Boolean(closeHelperText))
  );
  const actionPanelMessages = Array.from(new Set([
    assignBlockedReason,
    isCreator && canClose ? closeHelperText : null,
  ].filter((message): message is string => Boolean(message))));

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
            label="Claim window starts"
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
                      <div className={cn(
                        'flex flex-wrap items-center gap-2',
                        p.winnerAlias ? 'text-xs text-slate-500' : 'text-slate-950',
                      )}>
                        <IdentityName
                          address={winnerAddress}
                          displayName={p.winnerAlias}
                          className="font-medium"
                        />
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
                        {!p.claimed && p.reclaimed && (
                          <span className="text-xs font-medium text-slate-400">reclaimed</span>
                        )}
                        {claimable && (
                          <span className="text-xs font-medium text-blue-600">claimable</span>
                        )}
                        {isTicketHolder && !isCreator && canDisputePosition(p) && (
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
          <div className="space-y-3 rounded-lg border border-blue-100/80 bg-gradient-to-br from-white via-white to-blue-50/70 p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <Trophy className="h-4 w-4" />
              </span>
              <div>
                <div className="font-semibold text-slate-950">Your prizes</div>
                <div className="text-xs text-slate-500">Rewards assigned to your wallet</div>
              </div>
            </div>

            <div className="space-y-2">
              {myPositions.map((p) => {
                const claimable = canClaimPosition(p);
                const opensCountdown = formatCountdown(p.opensAt, nowSecs);
                const lateAssigned = !p.claimed && !p.reclaimed && p.opensAt > 0
                  && poolEndSecs != null && p.opensAt > poolEndSecs;
                return (
                  <div
                    key={p.placement}
                    className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white/90 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,220px)]"
                  >
                    <div className="min-w-0 rounded-lg border border-blue-100 bg-blue-50/45 p-3">
                      <div className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-bold uppercase leading-tight text-blue-700 ring-1 ring-blue-100">
                        Position #{p.placement}
                      </div>
                      <div className="mt-3 text-[11px] font-bold uppercase leading-tight text-slate-500">
                        Reward amount
                      </div>
                      <div className="mt-1 break-words text-2xl font-bold leading-tight text-slate-950">
                        {fmt(p.amountWei)}
                      </div>
                    </div>

                    {p.claimed ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 pt-0.5 text-[11px] font-bold uppercase leading-tight text-emerald-700">
                            Claimed
                          </div>
                        </div>
                        <div className="mt-3 text-xl font-bold leading-tight text-emerald-950">Complete</div>
                      </div>
                    ) : p.reclaimed ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 pt-0.5 text-[11px] font-bold uppercase leading-tight text-slate-600">
                            Claim window closed
                          </div>
                        </div>
                        <div className="mt-3 text-sm font-semibold leading-tight text-slate-700">
                          This prize was not claimed in time and the funds were returned to the organizer.
                        </div>
                      </div>
                    ) : claimable ? (
                      <div className="rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 pt-0.5 text-[11px] font-bold uppercase leading-tight text-blue-700">
                            Ready to claim
                          </div>
                        </div>
                        <Button
                          size="sm"
                          disabled={actions.isBusy}
                          onClick={() => actions.claim(pool, p.placement)}
                          className="mt-3 w-full bg-slate-950 text-white hover:bg-slate-800"
                        >
                          {actions.isBusy ? 'Claiming...' : 'Claim prize'}
                        </Button>
                      </div>
                    ) : (
                      <TimelineItem
                        icon="calendar"
                        label="Your claim unlocks"
                        value={opensCountdown ?? 'Not open yet'}
                        detail={p.opensAt ? formatDateFromSecs(p.opensAt) : undefined}
                      />
                    )}

                    {lateAssigned && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 sm:col-span-2">
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>
                          Assigned late — your claim window runs {formatDateFromSecs(p.opensAt)} → {formatDateFromSecs(p.closesAt)}, extended past the pool window so you keep the full claim period.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showActionPanel && (
          <div className="rounded-lg border border-slate-200 bg-white/75 p-3">
            {canManageWinners && winnerDeclarationClosesSecs != null && (
              <div className={cn(
                'mb-3 rounded-lg border px-3 py-2.5',
                winnerDeclarationClosesSecs > nowSecs
                  ? 'border-amber-200/70 bg-amber-50/60'
                  : 'border-slate-200 bg-slate-50/70',
              )}>
                <div className="flex items-start gap-2">
                  <span className={cn(
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    winnerDeclarationClosesSecs > nowSecs
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-500',
                  )}>
                    <Clock className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className={cn(
                      'text-[11px] font-bold uppercase leading-tight tracking-normal',
                      winnerDeclarationClosesSecs > nowSecs ? 'text-amber-700' : 'text-slate-500',
                    )}>
                      Winner declaration closes
                    </div>
                    <div className="mt-2 text-xl font-bold leading-tight text-slate-950">
                      {formatCountdown(winnerDeclarationClosesSecs, nowSecs) ?? formatDateFromSecs(winnerDeclarationClosesSecs)}
                    </div>
                    <div className="mt-1 text-xs leading-snug text-slate-500">
                      Empty placements can be assigned until {formatDateFromSecs(winnerDeclarationClosesSecs)}.
                      {' '}Declared winners lock at {formatDateFromSecs(claimStartSecs)}.
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                <span className="inline-flex items-center gap-1">
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
                  {closeDisabledReason && (
                    <FieldHelp
                      text={closeDisabledReason}
                      className="text-slate-400 hover:text-slate-700"
                    />
                  )}
                </span>
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

            {actionPanelMessages.length > 0 && (
              <div className="mt-3 space-y-1 text-xs leading-relaxed text-slate-500">
                {actionPanelMessages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
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
        canAssignUnassignedPlacements={canAssignUnassignedPlacements}
        canReplaceDeclaredWinners={canReplaceDeclaredWinners}
        aliasNudge={promptWinnerAliases}
        busy={actions.isBusy}
        onSubmit={async ({ batch, aliasUpdates }) => { const ok = await actions.assign(pool, batch, aliasUpdates); if (ok) setAssignOpen(false); }}
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
