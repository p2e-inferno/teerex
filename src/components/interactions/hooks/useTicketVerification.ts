import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { getUserKeyBalance } from '@/utils/lockUtils';
import type { UseTicketVerificationReturn } from '../types';

/**
 * Hook to verify if the current user has a valid ticket for an event
 * Uses Unlock Protocol to check key ownership
 */
export const useTicketVerification = (lockAddress: string, chainId: number): UseTicketVerificationReturn => {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];

  const [hasTicket, setHasTicket] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [ticketCount, setTicketCount] = useState(0);

  useEffect(() => {
    const checkTicket = async () => {
      // Reset state
      setIsChecking(true);
      setHasTicket(false);
      setTicketCount(0);

      // Early return if not authenticated or no wallet
      if (!authenticated || !wallet?.address || !lockAddress || !chainId) {
        setIsChecking(false);
        return;
      }

      try {
        // Check key balance via Unlock Protocol
        const balance = await getUserKeyBalance(lockAddress, wallet.address, chainId);

        setTicketCount(balance);
        setHasTicket(balance > 0);
      } catch (error) {
        console.error('Error checking ticket ownership:', error);
        setHasTicket(false);
        setTicketCount(0);
      } finally {
        setIsChecking(false);
      }
    };

    checkTicket();
  }, [authenticated, wallet?.address, lockAddress, chainId]);

  return {
    hasTicket,
    isChecking,
    ticketCount,
  };
};