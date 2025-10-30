import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { usePrivy } from '@privy-io/react-auth';
import { useDelegatedAttestation } from '@/hooks/useDelegatedAttestation';
import { useAttestationEncoding } from '@/hooks/useAttestationEncoding';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Loader2 } from 'lucide-react';

interface Event {
  id: string;
  title: string;
  lock_address: string;
}

interface GaslessEASAttestationButtonProps {
  schemaUid: string;
  recipient: string;
  selectedEvent: Event | null;
  deadlineSecs: number;
  chainId: number;
  disabled?: boolean;
  onResult?: (result: string) => void;
}

export const GaslessEASAttestationButton: React.FC<GaslessEASAttestationButtonProps> = ({
  schemaUid,
  recipient,
  selectedEvent,
  deadlineSecs,
  chainId,
  disabled = false,
  onResult,
}) => {
  const { getAccessToken } = usePrivy();
  const { signDelegatedAttestation } = useDelegatedAttestation();
  const { encodeEventAttendanceData } = useAttestationEncoding();
  const [loading, setLoading] = useState(false);

  const handleGaslessAttestation = async () => {
    try {
      setLoading(true);
      onResult?.('Validating inputs...');

      // Validation
      if (!selectedEvent) {
        toast({ title: 'Select event', variant: 'destructive' });
        return;
      }

      if (!schemaUid || !recipient) {
        toast({
          title: 'Missing fields',
          description: 'Provide schema UID and recipient',
          variant: 'destructive'
        });
        return;
      }

      // Step 1: Encode attestation data
      onResult?.('Step 1/3: Encoding attestation data...');
      const encoded = encodeEventAttendanceData(
        selectedEvent.id,
        selectedEvent.lock_address,
        selectedEvent.title
      );

      // Step 2: Sign delegated attestation using EAS SDK
      onResult?.('Step 2/3: Signing with EAS SDK (user signs, no gas)...');
      const sa = await signDelegatedAttestation({
        schemaUid,
        recipient,
        data: encoded,
        deadlineSecondsFromNow: deadlineSecs,
        chainId,
      });

      toast({
        title: 'Signature created',
        description: 'Service wallet will submit transaction (gasless for you)...'
      });

      // Step 3: Send to edge function for gasless execution
      onResult?.('Step 3/3: Service wallet submitting transaction (you pay no gas)...');

      const requestBody = {
        schemaUid,
        recipient,
        data: encoded,
        deadline: Number(sa.deadline),
        signature: sa.signature,
        chainId,
        eventId: selectedEvent.id,
      };

      console.log('[GaslessEAS] Sending to edge function:', requestBody);
      console.log('[GaslessEAS] Signature details:', {
        signature: sa.signature,
        type: typeof sa.signature,
        length: sa.signature?.length,
        startsWithOx: sa.signature?.startsWith?.('0x'),
      });

      const token = await getAccessToken?.();
      const { data, error } = await supabase.functions.invoke('eas-gasless-attestation', {
        body: requestBody,
        headers: token ? { 'X-Privy-Authorization': `Bearer ${token}` } : undefined,
      });

      console.log('[GaslessEAS] Edge function response:', { data, error });

      if (error || !data?.ok) {
        const errorDetail = error?.message || data?.error || JSON.stringify(data) || 'Failed';
        console.error('[GaslessEAS] Edge function error:', errorDetail);
        throw new Error(errorDetail);
      }

      const successMsg = `✅ Gasless Success! You paid NO gas! UID: ${data.uid}`;
      onResult?.(successMsg);

      toast({
        title: '🎉 Gasless attestation created!',
        description: `UID: ${data.uid} | TX: ${data.txHash}`,
      });

    } catch (err: any) {
      console.error('Gasless EAS attestation error:', err);
      const errorMsg = `❌ Gasless Error: ${err?.message || 'Failed'}`;
      onResult?.(errorMsg);

      toast({
        title: 'Gasless attestation failed',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="default"
      onClick={handleGaslessAttestation}
      disabled={disabled || loading}
      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 mr-2" />
          Gasless Attestation (No Gas!)
        </>
      )}
    </Button>
  );
};
