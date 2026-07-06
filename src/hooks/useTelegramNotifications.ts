import { useEffect, useState } from 'react';
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
const POLL_INTERVAL_MS = 3_000;
const LINK_POLL_WINDOW_MS = 5 * 60 * 1000;

export function useTelegramNotifications(organizerPrivyUserId?: string | null) {
  const { authenticated, getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  const [linkPollingUntil, setLinkPollingUntil] = useState<number | null>(null);

  const shouldPollForLink = Boolean(linkPollingUntil && Date.now() < linkPollingUntil);

  const query = useQuery({
    queryKey: key(organizerPrivyUserId),
    enabled: authenticated,
    refetchInterval: shouldPollForLink ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
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

  const isPollingForLink = shouldPollForLink && query.data?.linked !== true;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['telegram-notifications'] });

  useEffect(() => {
    if (!linkPollingUntil) return;

    const delay = Math.max(linkPollingUntil - Date.now(), 0);
    const timeoutId = window.setTimeout(() => setLinkPollingUntil(null), delay);
    return () => window.clearTimeout(timeoutId);
  }, [linkPollingUntil]);

  useEffect(() => {
    if (query.data?.linked === true) {
      setLinkPollingUntil(null);
    }
  }, [query.data?.linked]);

  const startLink = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      return callEdgeFunction<TelegramStartLinkResponse>(
        'telegram-notifications',
        { action: 'start_link' },
        { privyToken: token },
      );
    },
    onSuccess: (response) => {
      const expiresAt = Date.parse(response.expires_at);
      const pollUntil = Math.min(
        Date.now() + LINK_POLL_WINDOW_MS,
        Number.isFinite(expiresAt) ? expiresAt : Date.now() + LINK_POLL_WINDOW_MS,
      );
      setLinkPollingUntil(pollUntil);
      void invalidate();
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
    isPollingForLink,
    error: query.error,
    refresh: query.refetch,
    startLink,
    disable,
    subscribeOrganizer,
    unsubscribeOrganizer,
  };
}
