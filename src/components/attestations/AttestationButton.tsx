
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAttestations } from '@/hooks/useAttestations';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Award } from 'lucide-react';

interface AttestationButtonProps {
  schemaUid: string;
  recipient: string;
  eventId: string;
  lockAddress: string;
  eventTitle: string;
  attestationType: 'attendance' | 'like' | 'review';
  data?: any;
  disabled?: boolean;
  className?: string;
}

export const AttestationButton: React.FC<AttestationButtonProps> = ({
  schemaUid,
  recipient,
  eventId,
  lockAddress,
  eventTitle,
  attestationType,
  data = {},
  disabled = false,
  className = ''
}) => {
  const { createEventAttestation, isLoading } = useAttestations();
  const { toast } = useToast();
  const [hasAttested, setHasAttested] = useState(false);
  const [isCheckingAttestation, setIsCheckingAttestation] = useState(true);

  // Check if user already has an attestation
  useEffect(() => {
    const checkExistingAttestation = async () => {
      if (!recipient || !eventId || !schemaUid) return;
      
      setIsCheckingAttestation(true);
      try {
        const { data: existingAttestation } = await supabase
          .from('attestations')
          .select('id')
          .eq('event_id', eventId)
          .eq('recipient', recipient)
          .eq('schema_uid', schemaUid)
          .eq('is_revoked', false)
          .single();

        setHasAttested(!!existingAttestation);
      } catch (error) {
        console.error('Error checking existing attestation:', error);
      } finally {
        setIsCheckingAttestation(false);
      }
    };

    checkExistingAttestation();
  }, [recipient, eventId, schemaUid]);

  const handleAttestation = async () => {
    try {
      const attestationData = {
        eventId,
        lockAddress,
        eventTitle,
        ...data
      };

      const result = await createEventAttestation({
        schemaUid,
        recipient,
        data: attestationData,
        revocable: true // Always allow revocable, let the schema decide
      });

      if (result.success) {
        setHasAttested(true);
        toast({
          title: 'Attestation Created!',
          description: `Successfully created ${attestationType} attestation for ${eventTitle}`,
        });
      } else {
        throw new Error(result.error || 'Failed to create attestation');
      }
    } catch (error) {
      toast({
        title: 'Attestation Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  const getButtonText = () => {
    if (isCheckingAttestation) return 'Checking...';
    if (hasAttested) return 'Attested ✓';
    if (isLoading) return 'Creating...';
    
    switch (attestationType) {
      case 'attendance':
        return 'Attest Attendance';
      case 'like':
        return 'Like Event';
      case 'review':
        return 'Submit Review';
      default:
        return 'Create Attestation';
    }
  };

  return (
    <Button
      onClick={handleAttestation}
      disabled={disabled || isLoading || hasAttested || isCheckingAttestation}
      className={className}
      variant={hasAttested ? 'secondary' : 'default'}
    >
      {(isLoading || isCheckingAttestation) ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Award className="w-4 h-4 mr-2" />
      )}
      {getButtonText()}
    </Button>
  );
};
