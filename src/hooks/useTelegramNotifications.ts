import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';

export type TelegramNotificationStatus = {
  ok: true;
  linked: boolean;
  enabled: boolean;
  linked_at?: string | null;
  disabled_at?: string | null;
  subscribed?: boolean;
};

export type TelegramStartLinkResponse = {
  ok: true;
  deep_link: string;
  expires_at: string;
};

const key = (organizerPrivyUserId?: string | null) => ['telegram-notifications', organizerPrivyUserId || null] as const;

export function useTelegramNotifications(organizerPrivyUserId?: string | null) {
  const { authenticated, getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: key(organizerPrivyUserId),
    enabled: authenticated,
    queryFn: async () => {
      const token = await getAccessToken();
      return callEdgeFunction<TelegramNotificationStatus>(
        'telegram-notifications',
        {
          action: 'status',
          ...(organizerPrivyUserId ? { organizer_privy_user_id: organizerPrivyUserId } : {}),
        },
        { privyToken: token },
      );
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key(organizerPrivyUserId) });

  const startLink = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      return callEdgeFunction<TelegramStartLinkResponse>(
        'telegram-notifications',
        { action: 'start_link' },
        { privyToken: token },
      );
    },
  });

  const disable = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      return callEdgeFunction<{ ok: true; linked: boolean; enabled: boolean }>(
        'telegram-notifications',
        { action: 'disable' },
        { privyToken: token },
      );
    },
    onSuccess: invalidate,
  });

  const subscribeOrganizer = useMutation({
    mutationFn: async (targetOrganizerId: string = organizerPrivyUserId || '') => {
      const token = await getAccessToken();
      return callEdgeFunction<{ ok: true; subscribed: boolean }>(
        'telegram-notifications',
        { action: 'subscribe_organizer', organizer_privy_user_id: targetOrganizerId },
        { privyToken: token },
      );
    },
    onSuccess: invalidate,
  });

  const unsubscribeOrganizer = useMutation({
    mutationFn: async (targetOrganizerId: string = organizerPrivyUserId || '') => {
      const token = await getAccessToken();
      return callEdgeFunction<{ ok: true; unsubscribed: boolean }>(
        'telegram-notifications',
        { action: 'unsubscribe_organizer', organizer_privy_user_id: targetOrganizerId },
        { privyToken: token },
      );
    },
    onSuccess: invalidate,
  });

  return {
    status: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refresh: query.refetch,
    startLink,
    disable,
    subscribeOrganizer,
    unsubscribeOrganizer,
  };
}
