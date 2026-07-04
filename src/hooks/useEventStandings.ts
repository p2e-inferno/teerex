import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import type { Game, ScoringProfile } from '@/hooks/useGames';

export type StandingDisplayStatus = 'provisional' | 'under_dispute' | 'final';

export interface StandingRow {
  result_id: string;
  wallet_address: string;
  player_id: string | null;
  placement: number | null;
  tied_rank: number | null;
  points: number;
  source: string;
  status: string;
  alias: string | null;
  display_status: StandingDisplayStatus;
  participant_count: number | null;
}

export interface EventStandingsData {
  event_id: string;
  standings: StandingRow[];
  game: Game | null;
  scoring_profile: ScoringProfile;
}

export function useEventStandings(eventId?: string | null, enabled = true) {
  return useQuery<EventStandingsData>({
    queryKey: ['event-standings', eventId ?? null],
    enabled: Boolean(eventId) && enabled,
    queryFn: () =>
      callEdgeFunction<EventStandingsData>('leaderboards', {
        route: 'event-standings',
        event_id: eventId,
      }, {}),
  });
}

export interface TicketHolderEntry {
  wallet: string;
  granted_at: string | null;
}

export interface OrganizerEntry {
  wallet: string;
  placement: number;
  status: string;
}

export interface TicketHoldersData {
  event_id: string;
  prize_floor: number;
  holders: TicketHolderEntry[];
  entries: OrganizerEntry[];
  sheet_final: boolean;
}

export function useStandingsTicketHolders(eventId?: string | null, enabled = false) {
  const { getAccessToken } = usePrivy();
  return useQuery<TicketHoldersData>({
    queryKey: ['standings-ticket-holders', eventId ?? null],
    enabled: Boolean(eventId) && enabled,
    queryFn: async () => {
      const token = await getAccessToken();
      return callEdgeFunction<TicketHoldersData>('leaderboards', {
        route: 'ticket-holders',
        event_id: eventId,
      }, { privyToken: token });
    },
  });
}

export function useSubmitExtendedPlacements(eventId?: string | null) {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: { wallet: string; placement: number }[]) => {
      const token = await getAccessToken();
      return callEdgeFunction<{ submitted: number }>('leaderboards', {
        route: 'submit-extended-placements',
        event_id: eventId,
        entries,
      }, { privyToken: token });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['event-standings', eventId ?? null] });
      void queryClient.invalidateQueries({ queryKey: ['standings-ticket-holders', eventId ?? null] });
    },
  });
}

export function useReportStandingsIssue(eventId?: string | null) {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      rewardPoolId: string;
      disputerAddress: string;
      reasonText?: string;
      evidenceUrls?: string[];
    }) => {
      const token = await getAccessToken();
      return callEdgeFunction('raise-reward-dispute', {
        reward_pool_id: input.rewardPoolId,
        placement: null,
        disputer_address: input.disputerAddress,
        category: 'standings',
        reason_text: input.reasonText ?? null,
        evidence_urls: input.evidenceUrls ?? [],
      }, { privyToken: token });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['event-standings', eventId ?? null] });
    },
  });
}
