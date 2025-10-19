import { useState, useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWallets } from '@privy-io/react-auth';
import TEEREX_ABI from '@/lib/abi/teerex-abi';
import { getBatchAttestationAddress } from '@/lib/config/contract-config';

export interface SignedAttestation {
  schemaUid: string; // 0x...
  recipient: string; // address
  data: string; // bytes hex
  deadline: bigint; // seconds
  signature: string; // 0x...
  digest?: string; // EIP-712 hash
}

export const useBatchAttestation = (chainId: number) => {
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const [isLoading, setIsLoading] = useState(false);
  const [signed, setSigned] = useState<SignedAttestation[]>([]);
  const contractAddress = useMemo(() => {
    try {
      return getBatchAttestationAddress(chainId);
    } catch {
      return '';
    }
  }, [chainId]);

  const getSigner = useCallback(async () => {
    if (!wallet) throw new Error('Wallet not connected');
    const provider = await wallet.getEthereumProvider();
    const ethersProvider = new ethers.BrowserProvider(provider);
    return ethersProvider.getSigner();
  }, [wallet]);

  const getContractRO = useCallback(async () => {
    if (!contractAddress) throw new Error('Missing contract address');
    const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
    return new ethers.Contract(contractAddress, TEEREX_ABI, provider);
  }, [contractAddress]);

  const getContractRW = useCallback(async () => {
    if (!contractAddress) throw new Error('Missing contract address');
    const signer = await getSigner();
    return new ethers.Contract(contractAddress, TEEREX_ABI, signer);
  }, [contractAddress, getSigner]);

  // Write functions
  const registerEventLock = useCallback(async (lockAddress: string) => {
    const c = await getContractRW();
    setIsLoading(true);
    try {
      const tx = await c.registerEventLock(lockAddress);
      await tx.wait();
      return { success: true, hash: tx.hash };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed' };
    } finally {
      setIsLoading(false);
    }
  }, [getContractRW]);

  const setSchemaEnabled = useCallback(async (schemaUid: string, enabled: boolean) => {
    const c = await getContractRW();
    setIsLoading(true);
    try {
      const tx = await c.setSchemaEnabled(schemaUid, enabled);
      await tx.wait();
      return { success: true, hash: tx.hash };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed' };
    } finally {
      setIsLoading(false);
    }
  }, [getContractRW]);

  const setCreatorLock = useCallback(async (lockAddress: string) => {
    const c = await getContractRW();
    setIsLoading(true);
    try {
      const tx = await c.setCreatorLock(lockAddress);
      await tx.wait();
      return { success: true, hash: tx.hash };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed' };
    } finally {
      setIsLoading(false);
    }
  }, [getContractRW]);

  const setAdminLock = useCallback(async (lockAddress: string) => {
    const c = await getContractRW();
    setIsLoading(true);
    try {
      const tx = await c.setAdminLock(lockAddress);
      await tx.wait();
      return { success: true, hash: tx.hash };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed' };
    } finally {
      setIsLoading(false);
    }
  }, [getContractRW]);

  const setMaxBatchSize = useCallback(async (max: number) => {
    const c = await getContractRW();
    setIsLoading(true);
    try {
      const tx = await c.setMaxBatchSize(max);
      await tx.wait();
      return { success: true, hash: tx.hash };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed' };
    } finally {
      setIsLoading(false);
    }
  }, [getContractRW]);

  const createBatchAttestations = useCallback(async () => {
    const c = await getContractRW();
    setIsLoading(true);
    try {
      if (signed.length === 0) throw new Error('No signed attestations');
      const tx = await c.createBatchAttestationsByDelegation(
        signed.map((s) => [s.schemaUid, s.recipient, s.data, s.deadline, s.signature])
      );
      const receipt = await tx.wait();
      return { success: true, hash: tx.hash, receipt };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed' };
    } finally {
      setIsLoading(false);
    }
  }, [getContractRW, signed]);

  const createSingleAttestation = useCallback(async (sa: SignedAttestation) => {
    const c = await getContractRW();
    setIsLoading(true);
    try {
      const tx = await c.createAttestationByDelegation(
        sa.schemaUid,
        sa.recipient,
        sa.data,
        sa.deadline,
        sa.signature
      );
      const receipt = await tx.wait();
      return { success: true, hash: tx.hash, receipt };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed' };
    } finally {
      setIsLoading(false);
    }
  }, [getContractRW]);

  // Read functions
  const isSchemaEnabled = useCallback(async (schemaUid: string): Promise<boolean> => {
    const c = await getContractRO();
    return await c.isSchemaEnabled(schemaUid);
  }, [getContractRO]);

  const hasValidKeyForEvent = useCallback(async (lockAddress: string, holder: string): Promise<boolean> => {
    const c = await getContractRO();
    return await c.hasValidKeyForEvent(lockAddress, holder);
  }, [getContractRO]);

  const getKeyExpiration = useCallback(async (lockAddress: string, holder: string): Promise<bigint> => {
    const c = await getContractRO();
    return await c.getKeyExpiration(lockAddress, holder);
  }, [getContractRO]);

  const isEventLock = useCallback(async (lockAddress: string): Promise<boolean> => {
    const c = await getContractRO();
    return await c.isEventLock(lockAddress);
  }, [getContractRO]);

  const getMaxBatchSize = useCallback(async (): Promise<number> => {
    const c = await getContractRO();
    const size: bigint = await c.maxBatchSize();
    return Number(size);
  }, [getContractRO]);

  const getCreatorLock = useCallback(async (): Promise<string> => {
    const c = await getContractRO();
    return await c.creatorLock();
  }, [getContractRO]);

  const getAdminLock = useCallback(async (): Promise<string> => {
    const c = await getContractRO();
    return await c.adminLock();
  }, [getContractRO]);

  // EIP-712 signature helper
  const signAttestationMessage = useCallback(
    async (schemaUid: string, recipient: string, data: string, deadlineSecondsFromNow: number = 3600) => {
      const signer = await getSigner();
      if (!contractAddress) throw new Error('Missing contract address');

      const now = Math.floor(Date.now() / 1000);
      const deadline = BigInt(now + Math.max(1, deadlineSecondsFromNow));
      const domain = {
        name: 'TeeRexBatchAttestation',
        version: '1',
        chainId,
        verifyingContract: contractAddress,
      } as const;
      const types = {
        Attestation: [
          { name: 'schemaUID', type: 'bytes32' },
          { name: 'recipient', type: 'address' },
          { name: 'data', type: 'bytes' },
          { name: 'deadline', type: 'uint256' },
        ],
      } as const;
      const value = {
        schemaUID: schemaUid,
        recipient,
        data,
        deadline,
      } as const;

      let signature: string;
      try {
        // ethers v6
        signature = await (signer as any).signTypedData(domain, types, value);
      } catch (e) {
        // ethers v5 fallback
        signature = await (signer as any)._signTypedData(domain, types, value);
      }

      // Compute digest for immutability checks
      const digest = (ethers as any).TypedDataEncoder
        ? (ethers as any).TypedDataEncoder.hash(domain as any, types as any, value as any)
        : undefined;

      const sa: SignedAttestation = { schemaUid, recipient, data, deadline, signature, digest };
      setSigned((prev) => [...prev, sa]);
      return sa;
    },
    [chainId, contractAddress, getSigner]
  );

  return {
    // Info
    contractAddress,
    chainId,
    isLoading,
    signed,

    // Write
    registerEventLock,
    setSchemaEnabled,
    setCreatorLock,
    setAdminLock,
    setMaxBatchSize,
    createBatchAttestations,
    createSingleAttestation,

    // Read
    isSchemaEnabled,
    hasValidKeyForEvent,
    getKeyExpiration,
    isEventLock,
    getMaxBatchSize,
    getCreatorLock,
    getAdminLock,

    // Sig helper
    signAttestationMessage,
  };
};
