import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import type { UseCreatorPermissionsReturn } from '../types';

/**
 * Hook to check if the current user is the event creator
 * Compares Privy user ID (DID) with creator ID from event
 */
export const useCreatorPermissions = (creatorId: string): UseCreatorPermissionsReturn => {
  const { authenticated, user } = usePrivy();

  const [isCreator, setIsCreator] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    setIsChecking(true);

    if (!authenticated || !user?.id || !creatorId) {
      console.log('[Creator Check] Missing data:', { authenticated, userId: user?.id, creatorId });
      setIsCreator(false);
      setIsChecking(false);
      return;
    }

    // Compare Privy user IDs (DIDs)
    const match = user.id === creatorId;

    console.log('[Creator Check]', {
      userId: user.id,
      creatorId,
      match,
    });

    setIsCreator(match);
    setIsChecking(false);
  }, [authenticated, user?.id, creatorId]);

  return {
    isCreator,
    isChecking,
  };
};
