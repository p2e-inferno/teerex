import React, { useState } from 'react';
import { ethers } from 'ethers';
import { EAS } from '@ethereum-attestation-service/eas-sdk';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useWallets } from '@privy-io/react-auth';
import { useDelegatedAttestation } from '@/hooks/useDelegatedAttestation';
import { useAttestationEncoding } from '@/hooks/useAttestationEncoding';
import { Zap, Loader2 } from 'lucide-react';

interface Event {
  id: string;
  title: string;
  lock_address: string;
}

interface DirectEASAttestationButtonProps {
  schemaUid: string;
  recipient: string;
  selectedEvent: Event | null;
  deadlineSecs: number;
  chainId: number;
  disabled?: boolean;
  onResult?: (result: string) => void;
}

export const DirectEASAttestationButton: React.FC<DirectEASAttestationButtonProps> = ({
  schemaUid,
  recipient,
  selectedEvent,
  deadlineSecs,
  chainId,
  disabled = false,
  onResult,
}) => {
  const { wallets } = useWallets();
  const wallet = wallets?.[0];
  const { signDelegatedAttestation } = useDelegatedAttestation();
  const { encodeEventAttendanceData } = useAttestationEncoding();
  const [loading, setLoading] = useState(false);

  const handleDirectAttestation = async () => {
    try {
      setLoading(true);
      onResult?.('Validating inputs...');

      // Validation
      if (!wallet) {
        toast({ title: 'Connect wallet', variant: 'destructive' });
        return;
      }

      if (!selectedEvent) {
        toast({ title: 'Select event', variant: 'destructive' });
        return;
      }

      if (!schemaUid || !recipient) {
        toast({ title: 'Missing fields', description: 'Provide schema UID and recipient', variant: 'destructive' });
        return;
      }

      // Step 1: Encode attestation data
      onResult?.('Step 1/4: Encoding attestation data...');
      const encoded = encodeEventAttendanceData(
        selectedEvent.id,
        selectedEvent.lock_address,
        selectedEvent.title
      );

      // Step 2: Sign delegated attestation using EAS SDK
      onResult?.('Step 2/4: Signing with EAS SDK...');
      const sa = await signDelegatedAttestation({
        schemaUid,
        recipient,
        data: encoded,
        deadlineSecondsFromNow: deadlineSecs,
        chainId,
      });

      toast({
        title: 'Signature created',
        description: 'Now submitting attestation via EAS...'
      });

      // Step 3: Initialize EAS and connect signer
      onResult?.('Step 3/4: Connecting to EAS contract...');
      const provider = await wallet.getEthereumProvider();
      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();

      // EAS contract address (Base Sepolia/Mainnet)
      const easAddress = '0x4200000000000000000000000000000000000021';
      const eas = new EAS(easAddress);
      eas.connect(signer);

      // Step 4: Execute delegated attestation
      onResult?.('Step 4/4: Executing attestByDelegation...');
      const transaction = await eas.attestByDelegation({
        schema: schemaUid,
        data: {
          recipient,
          expirationTime: 0n,
          revocable: false,
          refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
          data: encoded,
        },
        signature: sa.signature,
        attester: sa.attester,
        deadline: sa.deadline,
      });

      onResult?.('Waiting for confirmation...');
      const newAttestationUID = await transaction.wait();

      const successMsg = `✅ EAS SDK Direct Success! UID: ${newAttestationUID}`;
      onResult?.(successMsg);

      toast({
        title: 'EAS SDK attestation created!',
        description: `UID: ${newAttestationUID}`,
      });

    } catch (err: any) {
      console.error('EAS SDK direct attestation error:', err);
      const errorMsg = `❌ EAS SDK Error: ${err?.message || 'Failed'}`;
      onResult?.(errorMsg);

      toast({
        title: 'EAS SDK attestation failed',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleDirectAttestation}
      disabled={disabled || loading || !wallet}
      className="border-blue-500 text-blue-600 hover:bg-blue-50"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <Zap className="h-4 w-4 mr-2" />
          Test EAS SDK Direct
        </>
      )}
    </Button>
  );
};
