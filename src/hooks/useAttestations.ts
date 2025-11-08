
import { useState, useEffect } from 'react';
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
  const [attestations, setAttestations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAttestations = async () => {
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
  };

  useEffect(() => {
    fetchAttestations();
  }, [eventId]);

  return { attestations, isLoading, refetch: fetchAttestations };
};

export const useUserAttestations = (userAddress: string) => {
  const [attestations, setAttestations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAttestations = async () => {
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
  };

  useEffect(() => {
    fetchAttestations();
  }, [userAddress]);

  return { attestations, isLoading, refetch: fetchAttestations };
};
