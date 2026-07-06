import { useParams } from 'react-router-dom';
import { HelpCircle, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSeriesStandings, type SeriesStandingRow } from '@/hooks/useSeries';
import { useIdentityLabel } from '@/hooks/useIdentityLabel';
import { PointsRules } from '@/components/leaderboards/EventStandings';
import { shortAddress } from '@/lib/identity';

function SeriesStandingListRow({ row }: { row: SeriesStandingRow }) {
  const address = row.wallet_address ?? row.player_key;
  const identity = useIdentityLabel({
    address,
    displayName: row.display_name,
  });
  const showAddress = identity.source !== 'address' && Boolean(row.wallet_address);

  return (
    <div
      className={cn(
        'grid grid-cols-[3rem_1fr_5rem_4rem_4rem] items-center gap-2 rounded-md px-3 py-2 text-sm',
        row.rank <= 3 ? 'bg-amber-50/80' : 'bg-slate-50/80',
      )}
    >
      <span className="font-semibold text-slate-700">#{row.rank}</span>
      <div className="min-w-0">
        <div className={cn('truncate', showAddress ? 'font-medium text-slate-950' : 'font-mono text-xs text-slate-900')}>
          {identity.label}
        </div>
        {showAddress && row.wallet_address && (
          <div className="truncate font-mono text-xs text-slate-500">{shortAddress(row.wallet_address)}</div>
        )}
      </div>
      <span className="text-right font-semibold tabular-nums">{row.points}</span>
      <span className="text-right tabular-nums text-slate-600">{row.events_played}</span>
      <span className="text-right tabular-nums text-slate-600">{row.wins}</span>
    </div>
  );
}

const SeriesStandings = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const { data, isLoading, isError } = useSeriesStandings(boardId);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-1/3" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl text-center">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Series not found</h1>
        <p className="text-muted-foreground">This series does not exist or has been removed.</p>
      </div>
    );
  }

  const { board, game, scoring_profile: profile, standings } = data;

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-amber-500" /> {board.name}
          </h1>
          {!board.is_active && <Badge variant="secondary">Inactive</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {game && <span>{game.name}</span>}
          {board.season_label && <span>· {board.season_label}</span>}
          {board.last_recomputed_at && (
            <span>· Updated {new Date(board.last_recomputed_at).toLocaleString()}</span>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1 text-xs hover:text-foreground" aria-label="How points work">
                <HelpCircle className="h-3.5 w-3.5" /> How points work
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 space-y-2">
              <PointsRules profile={profile} />
              <p className="text-xs leading-relaxed text-slate-600">
                Series points sum each player&apos;s finalized results across all of this
                organizer&apos;s {game?.name ?? 'game'} events{board.season_label ? ` in ${board.season_label}` : ''}.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {standings.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-10">
            <CardTitle className="text-lg">No results yet</CardTitle>
            <p className="text-sm text-muted-foreground">
              Standings appear once this organizer&apos;s events finalize their results.
            </p>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[3rem_1fr_5rem_4rem_4rem] gap-2 px-3 text-xs font-bold uppercase text-muted-foreground">
            <span>Rank</span>
            <span>Player</span>
            <span className="text-right">Points</span>
            <span className="text-right">Events</span>
            <span className="text-right">Wins</span>
          </div>
          {standings.map((row) => <SeriesStandingListRow key={row.player_key} row={row} />)}
        </div>
      )}
    </div>
  );
};

export default SeriesStandings;
