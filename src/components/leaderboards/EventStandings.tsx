import { useMemo, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { HelpCircle, ListOrdered, Medal, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { EdgeFunctionError } from '@/lib/edgeFunctions';
import { useEventManagerPermissions } from '@/hooks/useEventManagerPermissions';
import { useEventStandings, useReportStandingsIssue, type StandingRow } from '@/hooks/useEventStandings';
import { useRewardPools } from '@/hooks/useRewardPools';
import { useTicketBalance } from '@/hooks/useTicketBalance';
import { useToast } from '@/hooks/use-toast';
import { RaiseDisputeDialog } from '@/components/rewards/RaiseDisputeDialog';
import { ExtendedPlacementsDialog } from './ExtendedPlacementsDialog';
import type { ScoringProfile } from '@/hooks/useGames';
import type { RewardDisputeCategory } from '@/types/rewardPool';

const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

function statusBadge(row: StandingRow) {
  if (row.display_status === 'final') {
    return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Final</Badge>;
  }
  if (row.display_status === 'under_dispute') {
    return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Under dispute</Badge>;
  }
  if (row.display_status === 'ready_to_finalize') {
    return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Finalization pending</Badge>;
  }
  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
      {row.source === 'organizer' ? 'Review window open' : 'Dispute window open'}
    </Badge>
  );
}

function PointsRules({ profile }: { profile: ScoringProfile }) {
  const podium = Object.entries(profile.podium ?? {})
    .map(([place, pts]) => ({ place: Number(place), pts }))
    .sort((a, b) => a.place - b.place);
  const curve = profile.curve ?? {};
  const participation = Number(profile.participation ?? 0);

  return (
    <div className="space-y-2 text-xs leading-relaxed text-slate-600">
      <div className="font-semibold text-slate-900">How points work</div>
      {podium.length > 0 && (
        <p>
          Podium: {podium.map((p) => `#${p.place} = ${p.pts}`).join(' · ')} points.
        </p>
      )}
      {Number(curve.from ?? 0) > 0 && (
        <p>
          Placements below the podium start at {curve.from} points and decrease by {curve.step ?? 5} per
          place, never below {curve.floor ?? 0}.
        </p>
      )}
      <p>
        {participation > 0
          ? `Everyone else with a ticket earns ${participation} participation point${participation === 1 ? '' : 's'}.`
          : 'Participation earns no points for this game.'}
      </p>
      <p>
        If an event has multiple prize pools, a player counts once — their best placement.
      </p>
      <p>
        Prize placements are verified against the on-chain prize pool. Organizer-reported placements
        finalize after a review window during which ticket holders can report issues.
      </p>
    </div>
  );
}

function StandingsRow({ row, rank }: { row: StandingRow; rank: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-slate-50/80 px-3 py-2 text-sm">
      <span className="w-10 shrink-0 font-semibold text-slate-700">{rank}</span>
      <div className="min-w-0 flex-1">
        {row.alias && <div className="truncate font-medium text-slate-950">{row.alias}</div>}
        <div className={cn('truncate font-mono text-xs', row.alias ? 'text-slate-500' : 'text-slate-900')}>
          {short(row.wallet_address)}
        </div>
      </div>
      <span className={cn(
        'shrink-0 font-semibold tabular-nums',
        row.placement == null ? 'text-slate-400' : 'text-slate-900',
      )}>
        {row.points} pts
      </span>
      {statusBadge(row)}
    </div>
  );
}

interface Props {
  event: {
    id: string;
    lock_address: string;
    chain_id: number;
    creator_id?: string | null;
  };
}

/**
 * Event Standings section: prize placements (verified anchor), organizer-extended placements,
 * and the Participated tier. Rendered only for events linked to a game.
 */
export function EventStandings({ event }: Props) {
  const { toast } = useToast();
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const viewerAddress = authenticated ? wallet?.address ?? null : null;

  const { data } = useEventStandings(event.id);
  const { data: pools = [] } = useRewardPools(event.lock_address, event.chain_id);
  const permissions = useEventManagerPermissions(event.id);
  const { data: balance = 0 } = useTicketBalance({
    lockAddress: event.lock_address,
    chainId: event.chain_id,
    userAddress: viewerAddress ?? undefined,
  });
  const reportIssue = useReportStandingsIssue(event.id);

  const isCreator = permissions.isCreator || (authenticated && !!user?.id && !!event.creator_id && user.id === event.creator_id);
  const canManage = permissions.canManageResults;
  const isTicketHolder = authenticated && (balance ?? 0) > 0;

  const [editorOpen, setEditorOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const bands = useMemo(() => {
    const rows = data?.standings ?? [];
    return {
      prize: rows.filter((r) => r.placement != null && r.source === 'reward_pool'),
      organizer: rows.filter((r) => r.placement != null && r.source === 'organizer'),
      participated: rows.filter((r) => r.placement == null),
    };
  }, [data?.standings]);

  // The section exists only for events opted into a game; gameless events keep prizes only.
  if (!data || !data.game) return null;

  const hasRows = data.standings.length > 0;
  if (!hasRows && !canManage) return null;

  const organizerReviewOpen = bands.organizer.some((r) => r.display_status === 'review_open');
  const reportPool = pools[0] ?? null;
  const showReport = organizerReviewOpen && isTicketHolder && !isCreator && reportPool != null;
  const showExtend = canManage && pools.length > 0 && bands.prize.length > 0;

  const submitReport = async (input: { category: RewardDisputeCategory; reasonText: string; holdDurationSecs: number }) => {
    if (!viewerAddress || !reportPool) return;
    try {
      await reportIssue.mutateAsync({
        rewardPoolId: reportPool.id,
        disputerAddress: viewerAddress,
        reasonText: input.reasonText,
      });
      toast({ title: 'Report submitted', description: 'The standings issue has been sent for review.' });
      setReportOpen(false);
    } catch (err) {
      toast({
        title: 'Could not submit report',
        description: err instanceof EdgeFunctionError ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-blue-600" />
          Event Standings
          {data.game && <span className="text-sm font-normal text-slate-500">· {data.game.name}</span>}
        </h3>
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900" aria-label="How points work">
              <HelpCircle className="h-3.5 w-3.5" /> How points work
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <PointsRules profile={data.scoring_profile} />
          </PopoverContent>
        </Popover>
      </div>

      {!hasRows ? (
        <p className="text-sm text-muted-foreground">
          Standings are generated from declared prize winners. Create a prize pool and assign
          winners after your tournament ends to publish standings.
        </p>
      ) : (
        <div className="space-y-4">
          {bands.prize.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-amber-700">
                <Medal className="h-3.5 w-3.5" /> Top finishers
              </div>
              {bands.prize.map((r) => (
                <StandingsRow key={r.result_id} row={r} rank={`#${r.placement}`} />
              ))}
            </div>
          )}

          {bands.organizer.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase text-slate-500">Honorable mentions</div>
              {bands.organizer.map((r) => (
                <StandingsRow key={r.result_id} row={r} rank={`#${r.placement}`} />
              ))}
            </div>
          )}

          {bands.participated.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase text-slate-400">Participated</div>
              {bands.participated.map((r) => (
                <StandingsRow key={r.result_id} row={r} rank={`T-${r.tied_rank ?? '-'}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {(showExtend || showReport) && (
        <div className="flex flex-wrap items-center gap-2">
          {showExtend && (
            <Button size="sm" variant="outline" onClick={() => setEditorOpen(true)}>
              {bands.organizer.length > 0 ? 'Edit extended standings' : 'Rank remaining players'}
            </Button>
          )}
          {showReport && (
            <Button size="sm" variant="ghost" onClick={() => setReportOpen(true)} disabled={reportIssue.isPending}>
              <ShieldAlert className="h-4 w-4" /> Report ranking issue
            </Button>
          )}
        </div>
      )}

      {canManage && (
        <ExtendedPlacementsDialog open={editorOpen} onOpenChange={setEditorOpen} eventId={event.id} />
      )}
      {showReport && (
        <RaiseDisputeDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          placement={null}
          defaultCategory="standings"
          busy={reportIssue.isPending}
          onSubmit={submitReport}
        />
      )}
    </section>
  );
}
