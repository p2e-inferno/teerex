
import { useState, useEffect, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { 
  createAttestation, 
  revokeAttestation, 
  getEventAttestations, 
  getUserAttestations,
  getAttestationSchemas,
  CreateAttestationParams,
  AttestationResult
} from '@/utils/attestationUtils';

export const useAttestations = () => {
  const { wallets } = useWallets();
  const [isLoading, setIsLoading] = useState(false);

  const createEventAttestation = async (params: Omit<CreateAttestationParams, 'wallet'>): Promise<AttestationResult> => {
    setIsLoading(true);
    try {
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error('No wallet connected');
      }

      const result = await createAttestation({
        ...params,
        wallet
      });

      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const revokeEventAttestation = async (schemaUid: string, attestationUid: string, chainId?: number): Promise<AttestationResult> => {
    setIsLoading(true);
    try {
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error('No wallet connected');
      }

      const result = await revokeAttestation(schemaUid, attestationUid, wallet, chainId);
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createEventAttestation,
    revokeEventAttestation,
    getEventAttestations,
    getUserAttestations,
    getAttestationSchemas,
    isLoading
  };
};

export const useEventAttestations = (eventId: string) => {
  const [attestations, setAttestations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAttestations = useCallback(async () => {
    if (!eventId) return;
    
    setIsLoading(true);
    try {
      const data = await getEventAttestations(eventId);
      setAttestations(data);
    } catch (error) {
      console.error('Error fetching event attestations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchAttestations();
  }, [fetchAttestations]);

  return { attestations, isLoading, refetch: fetchAttestations };
};

export const useUserAttestations = (userAddress: string) => {
  const [attestations, setAttestations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAttestations = useCallback(async () => {
    if (!userAddress) return;
    
    setIsLoading(true);
    try {
      const data = await getUserAttestations(userAddress);
      setAttestations(data);
    } catch (error) {
      console.error('Error fetching user attestations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchAttestations();
  }, [fetchAttestations]);

  return { attestations, isLoading, refetch: fetchAttestations };
};
