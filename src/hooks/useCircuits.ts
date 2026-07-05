import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import type { Game, ScoringProfile } from '@/hooks/useGames';

export interface Circuit {
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

export interface CircuitStandingRow {
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

export interface CircuitStandingsData {
  board: Circuit;
  game: Game | null;
  scoring_profile: ScoringProfile;
  standings: CircuitStandingRow[];
}

export function useGameCircuits(gameId?: string | null) {
  return useQuery<Circuit[]>({
    queryKey: ['game-circuits', gameId ?? null],
    enabled: Boolean(gameId),
    queryFn: async () => {
      const data = await callEdgeFunction<{ circuits: Circuit[] }>('leaderboards', {
        route: 'circuits',
        game_id: gameId,
      }, {});
      return data.circuits ?? [];
    },
  });
}

export function useCircuitStandings(boardId?: string | null) {
  return useQuery<CircuitStandingsData>({
    queryKey: ['circuit-standings', boardId ?? null],
    enabled: Boolean(boardId),
    queryFn: () =>
      callEdgeFunction<CircuitStandingsData>('leaderboards', {
        route: 'circuit-standings',
        board_id: boardId,
      }, {}),
  });
}

export function useMyCircuits(enabled = true) {
  const { getAccessToken, authenticated } = usePrivy();
  return useQuery<Circuit[]>({
    queryKey: ['my-circuits'],
    enabled: enabled && authenticated,
    queryFn: async () => {
      const token = await getAccessToken();
      const data = await callEdgeFunction<{ circuits: Circuit[] }>('leaderboards', {
        route: 'my-circuits',
      }, { privyToken: token });
      return data.circuits ?? [];
    },
  });
}

export interface CircuitInput {
  game_id?: string;
  name?: string;
  season_label?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
}

export function useCreateCircuit() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CircuitInput) => {
      const token = await getAccessToken();
      const data = await callEdgeFunction<{ circuit: Circuit }>('leaderboards', {
        route: 'create-circuit',
        ...input,
      }, { privyToken: token });
      return data.circuit;
    },
    onSuccess: (circuit) => {
      void queryClient.invalidateQueries({ queryKey: ['my-circuits'] });
      void queryClient.invalidateQueries({ queryKey: ['game-circuits', circuit.game_id] });
    },
  });
}

export function useUpdateCircuit() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ board_id, ...patch }: CircuitInput & { board_id: string }) => {
      const token = await getAccessToken();
      const data = await callEdgeFunction<{ circuit: Circuit }>('leaderboards', {
        route: 'update-circuit',
        board_id,
        ...patch,
      }, { privyToken: token });
      return data.circuit;
    },
    onSuccess: (circuit) => {
      void queryClient.invalidateQueries({ queryKey: ['my-circuits'] });
      void queryClient.invalidateQueries({ queryKey: ['game-circuits', circuit.game_id] });
      void queryClient.invalidateQueries({ queryKey: ['circuit-standings', circuit.id] });
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
      void queryClient.invalidateQueries({ queryKey: ['circuit-standings'] });
    },
  });
}
