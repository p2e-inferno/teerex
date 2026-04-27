import React, { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';

// Component to sync Privy auth with Supabase
export const SupabaseAuthSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, authenticated, getAccessToken } = usePrivy();

  useEffect(() => {
    let cancelled = false;

    const syncAuth = async () => {
      if (authenticated && user) {
        try {
          console.log('User authenticated with Privy:', user.id);
          const token = await getAccessToken?.();
          if (!token || cancelled) return;
          await supabase.functions.invoke('sync-user-profile', {
            body: {},
            headers: { 'X-Privy-Authorization': `Bearer ${token}` },
          });
        } catch (error) {
          console.warn('Error syncing user profile:', error);
        }
      } else {
        console.log('User not authenticated');
      }
    };

    syncAuth();

    return () => {
      cancelled = true;
    };
  }, [authenticated, user, getAccessToken]);

  return <>{children}</>;
};
