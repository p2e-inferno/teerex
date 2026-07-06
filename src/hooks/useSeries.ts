import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import type { Game, ScoringProfile } from '@/hooks/useGames';

export interface Series {
  id: string;
  scope: string;
  game_id: string;
  organizer_id: string | null;
  name: string;
  season_label: string | null;
  starts_at: string | null;
  ends_at: string | null;
  scoring_profile: ScoringProfile | null;
  is_active: boolean;
  last_recomputed_at: string | null;
  created_at: string;
}

export interface SeriesStandingRow {
  player_key: string;
  player_id: string | null;
  wallet_address: string | null;
  rank: number;
  points: number;
  events_played: number;
  wins: number;
  computed_at: string;
  display_name: string | null;
}

export interface SeriesStandingsData {
  board: Series;
  game: Game | null;
  scoring_profile: ScoringProfile;
  standings: SeriesStandingRow[];
}

export function useGameSeries(gameId?: string | null) {
  return useQuery<Series[]>({
    queryKey: ['game-series', gameId ?? null],
    enabled: Boolean(gameId),
    queryFn: async () => {
      const data = await callEdgeFunction<{ series: Series[] }>('leaderboards', {
        route: 'series',
        game_id: gameId,
      }, {});
      return data.series ?? [];
    },
  });
}

export function useSeriesStandings(boardId?: string | null) {
  return useQuery<SeriesStandingsData>({
    queryKey: ['series-standings', boardId ?? null],
    enabled: Boolean(boardId),
    queryFn: () =>
      callEdgeFunction<SeriesStandingsData>('leaderboards', {
        route: 'series-standings',
        board_id: boardId,
      }, {}),
  });
}

export function useMySeries(enabled = true) {
  const { getAccessToken, authenticated } = usePrivy();
  return useQuery<Series[]>({
    queryKey: ['my-series'],
    enabled: enabled && authenticated,
    queryFn: async () => {
      const token = await getAccessToken();
      const data = await callEdgeFunction<{ series: Series[] }>('leaderboards', {
        route: 'my-series',
      }, { privyToken: token });
      return data.series ?? [];
    },
  });
}

export interface SeriesInput {
  game_id?: string;
  name?: string;
  season_label?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
}

export function useCreateSeries() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SeriesInput) => {
      const token = await getAccessToken();
      const data = await callEdgeFunction<{ series: Series }>('leaderboards', {
        route: 'create-series',
        ...input,
      }, { privyToken: token });
      return data.series;
    },
    onSuccess: (series) => {
      void queryClient.invalidateQueries({ queryKey: ['my-series'] });
      void queryClient.invalidateQueries({ queryKey: ['game-series', series.game_id] });
    },
  });
}

export function useUpdateSeries() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ board_id, ...patch }: SeriesInput & { board_id: string }) => {
      const token = await getAccessToken();
      const data = await callEdgeFunction<{ series: Series }>('leaderboards', {
        route: 'update-series',
        board_id,
        ...patch,
      }, { privyToken: token });
      return data.series;
    },
    onSuccess: (series) => {
      void queryClient.invalidateQueries({ queryKey: ['my-series'] });
      void queryClient.invalidateQueries({ queryKey: ['game-series', series.game_id] });
      void queryClient.invalidateQueries({ queryKey: ['series-standings', series.id] });
    },
  });
}

export function useMyDisplayName() {
  const { getAccessToken, authenticated } = usePrivy();
  return useQuery<string | null>({
    queryKey: ['my-display-name'],
    enabled: authenticated,
    queryFn: async () => {
      const token = await getAccessToken();
      const data = await callEdgeFunction<{ display_name: string | null }>('leaderboards', {
        route: 'my-display-name',
      }, { privyToken: token });
      return data.display_name ?? null;
    },
  });
}

export function useSetDisplayName() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (displayName: string | null) => {
      const token = await getAccessToken();
      return callEdgeFunction<{ display_name: string | null }>('leaderboards', {
        route: 'set-display-name',
        display_name: displayName,
      }, { privyToken: token });
    },
    onSuccess: () => {
      // Names surface in every standings read; refresh whatever is on screen.
      void queryClient.invalidateQueries({ queryKey: ['my-display-name'] });
      void queryClient.invalidateQueries({ queryKey: ['event-standings'] });
      void queryClient.invalidateQueries({ queryKey: ['series-standings'] });
    },
  });
}
