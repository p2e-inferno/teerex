import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import type { EventManagerPermissions } from '@/hooks/useEventManagers';

type PermissionState = {
  authorized: boolean;
  isCreator: boolean;
  isOnchainManager: boolean;
  isOffchainManager: boolean;
  permissions: EventManagerPermissions;
};

const EMPTY_PERMISSIONS: EventManagerPermissions = {
  manage_access: false,
  manage_waitlist: false,
  manage_discussions: false,
  manage_results: false,
};

export function useEventManagerPermissions(eventId: string | null) {
  const { getAccessToken, authenticated } = usePrivy();
  const [state, setState] = useState<PermissionState>({
    authorized: false,
    isCreator: false,
    isOnchainManager: false,
    isOffchainManager: false,
    permissions: EMPTY_PERMISSIONS,
  });
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    if (!eventId || !authenticated) {
      setChecked(true);
      return;
    }
    setLoading(true);
    setChecked(false);
    try {
      const token = await getAccessToken?.();
      if (!token) return;
      const data = await callEdgeFunction<any>('manage-event-managers', { action: 'my_permissions', event_id: eventId }, { privyToken: token });
      setState({
        authorized: Boolean(data.authorized),
        isCreator: Boolean(data.isCreator),
        isOnchainManager: Boolean(data.isOnchainManager),
        isOffchainManager: Boolean(data.isOffchainManager),
        permissions: { ...EMPTY_PERMISSIONS, ...(data.permissions || {}) },
      });
    } finally {
      setLoading(false);
      setChecked(true);
    }
  }, [authenticated, eventId, getAccessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    loading,
    checked,
    refresh,
    canManageManagers: state.isCreator,
    canManageAccess: state.isCreator || state.isOnchainManager || state.permissions.manage_access,
    canManageWaitlist: state.isCreator || state.isOnchainManager || state.permissions.manage_waitlist,
    canManageDiscussions: state.isCreator || state.isOnchainManager || state.permissions.manage_discussions,
    canManageResults: state.isCreator || state.isOnchainManager || state.permissions.manage_results,
  };
}
