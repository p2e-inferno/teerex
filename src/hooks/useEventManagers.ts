import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';

export type EventManagerPermissions = {
  manage_access: boolean;
  manage_waitlist: boolean;
  manage_discussions: boolean;
};

export type EventManager = {
  id: string;
  event_id: string;
  wallet_address: string;
  email: string | null;
  label: string | null;
  permissions: EventManagerPermissions;
  added_by: string;
  created_at: string;
  updated_at: string;
};

const DEFAULT_PERMISSIONS: EventManagerPermissions = {
  manage_access: true,
  manage_waitlist: true,
  manage_discussions: true,
};

export function useEventManagers(eventId: string | null, enabled: boolean) {
  const { getAccessToken } = usePrivy();
  const [managers, setManagers] = useState<EventManager[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const token = await getAccessToken?.();
    if (!token) throw new Error('Authentication required');
    const { data, error: invokeError } = await supabase.functions.invoke('manage-event-managers', {
      body,
      headers: { 'X-Privy-Authorization': `Bearer ${token}` },
    });
    if (invokeError) throw invokeError;
    if (!data?.ok) throw new Error(data?.error || 'Manager operation failed');
    return data;
  }, [getAccessToken]);

  const refresh = useCallback(async () => {
    if (!eventId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await call({ action: 'list', event_id: eventId });
      setManagers(data.managers || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load managers');
    } finally {
      setLoading(false);
    }
  }, [call, enabled, eventId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addManager = useCallback(async (
    identifier: string,
    permissions: EventManagerPermissions = DEFAULT_PERMISSIONS,
    label?: string,
  ) => {
    if (!eventId) return;
    setSaving(true);
    try {
      const data = await call({ action: 'add', event_id: eventId, identifier, permissions, label });
      setManagers((prev) => [data.manager, ...prev]);
    } finally {
      setSaving(false);
    }
  }, [call, eventId]);

  const updatePermissions = useCallback(async (managerId: string, permissions: EventManagerPermissions) => {
    if (!eventId) return;
    setManagers((prev) => prev.map((manager) => (
      manager.id === managerId ? { ...manager, permissions } : manager
    )));
    try {
      const data = await call({
        action: 'update_permissions',
        event_id: eventId,
        manager_id: managerId,
        permissions,
      });
      setManagers((prev) => prev.map((manager) => (
        manager.id === managerId ? data.manager : manager
      )));
    } catch (err) {
      await refresh();
      throw err;
    }
  }, [call, eventId, refresh]);

  const removeManager = useCallback(async (managerId: string) => {
    if (!eventId) return;
    const previous = managers;
    setManagers((prev) => prev.filter((manager) => manager.id !== managerId));
    try {
      await call({ action: 'remove', event_id: eventId, manager_id: managerId });
    } catch (err) {
      setManagers(previous);
      throw err;
    }
  }, [call, eventId, managers]);

  return {
    managers,
    loading,
    saving,
    error,
    refresh,
    addManager,
    updatePermissions,
    removeManager,
    defaultPermissions: DEFAULT_PERMISSIONS,
  };
}
