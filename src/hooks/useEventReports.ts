import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export type ReportReason = 'spam' | 'scam' | 'inappropriate' | 'misleading' | 'impersonation' | 'other';
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface EventReport {
  id: string;
  event_id: string;
  reporter_id: string;
  reporter_wallet: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  event: {
    id: string;
    title: string;
    image_url: string | null;
    creator_id: string;
    creator_address: string | null;
    is_public: boolean;
  } | null;
}

export function useReportEvent() {
  const { getAccessToken } = usePrivy();
  return useMutation({
    mutationFn: async (input: { eventId: string; reason: ReportReason; details?: string }) => {
      const token = await getAccessToken();
      return callEdgeFunction(
        'report-event',
        { route: 'submit', event_id: input.eventId, reason: input.reason, details: input.details ?? null },
        { privyToken: token },
      );
    },
  });
}

export function useEventReports(status?: ReportStatus | 'all') {
  const { getAccessToken, authenticated } = usePrivy();
  return useQuery<EventReport[]>({
    queryKey: ['admin-event-reports', status ?? 'all'],
    enabled: authenticated,
    queryFn: async () => {
      const token = await getAccessToken();
      const data = await callEdgeFunction<{ reports: EventReport[] }>(
        'report-event',
        { route: 'admin-list', status: status && status !== 'all' ? status : undefined },
        { privyToken: token },
      );
      return data.reports ?? [];
    },
  });
}

export function useResolveReport() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reportId: string; status: 'reviewing' | 'resolved' | 'dismissed'; resolutionNote?: string }) => {
      const token = await getAccessToken();
      return callEdgeFunction<{ report: EventReport }>(
        'report-event',
        {
          route: 'admin-resolve',
          report_id: input.reportId,
          status: input.status,
          resolution_note: input.resolutionNote ?? null,
        },
        { privyToken: token },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-event-reports'] });
    },
  });
}
