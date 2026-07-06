import { useQuery } from '@tanstack/react-query';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export interface ScoringProfile {
  type?: string;
  podium?: Record<string, number>;
  curve?: { kind?: string; from?: number; floor?: number; step?: number };
  participation?: number;
  review_window_hours?: number;
  min_participants?: number;
}

export interface Game {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  cover_url: string | null;
  scoring_profile: ScoringProfile;
}

export function useGames() {
  return useQuery<Game[]>({
    queryKey: ['games'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const data = await callEdgeFunction<{ games: Game[] }>('leaderboards', { route: 'games' }, {});
      return data.games ?? [];
    },
  });
}
