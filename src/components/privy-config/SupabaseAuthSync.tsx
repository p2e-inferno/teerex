import React, { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';

// Component to sync Privy auth with Supabase
export const SupabaseAuthSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, authenticated } = usePrivy();

  useEffect(() => {
    const syncAuth = async () => {
      if (authenticated && user) {
        try {
          console.log('User authenticated with Privy:', user.id);
          // We'll handle authentication at the individual API level
          // since Privy tokens aren't directly compatible with Supabase
        } catch (error) {
          console.error('Error syncing auth:', error);
        }
      } else {
        console.log('User not authenticated');
      }
    };

    syncAuth();
  }, [authenticated, user]);

  return <>{children}</>;
};
