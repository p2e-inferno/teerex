import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useWallets } from '@privy-io/react-auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  Loader2
} from 'lucide-react';

interface AttestationChallengeDialogProps {
  attestationId: string;
  challengedUserAddress: string;
  eventTitle: string;
  children: React.ReactNode;
}

export const AttestationChallengeDialog: React.FC<AttestationChallengeDialogProps> = ({
  attestationId,
  challengedUserAddress,
  eventTitle,
  children
}) => {
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const { toast } = useToast();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [challengeReason, setChallengeReason] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');

  const handleSubmitChallenge = async () => {
    if (!wallet?.address || !challengeReason.trim()) {
      toast({
        title: 'Invalid Input',
        description: 'Please provide a reason for the challenge',
        variant: 'destructive'
      });
      return;
    }

    if (wallet.address === challengedUserAddress) {
      toast({
        title: 'Invalid Challenge',
        description: 'You cannot challenge your own attestation',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Insert challenge into database
      const { error } = await supabase
        .from('attestation_challenges')
        .insert({
          attestation_id: attestationId,
          challenger_address: wallet.address,
          challenged_address: challengedUserAddress,
          challenge_reason: challengeReason.trim(),
          evidence_description: evidenceDescription.trim() || null,
          evidence_url: evidenceUrl.trim() || null,
          stake_amount: 10 // Fixed stake amount for now
        });

      if (error) throw error;

      // Update challenger's reputation (small penalty for challenging)
      await supabase.rpc('update_reputation_score', {
        user_addr: wallet.address,
        score_change: -2,
        attestation_type: 'challenge'
      });

      toast({
        title: '🚨 Challenge Submitted',
        description: `Your challenge has been submitted for review. The community will evaluate the evidence.`,
      });

      // Reset form and close dialog
      setChallengeReason('');
      setEvidenceDescription('');
      setEvidenceUrl('');
      setIsOpen(false);

    } catch (error) {
      console.error('Error submitting challenge:', error);
      toast({
        title: 'Challenge Failed',
        description: 'There was an error submitting your challenge. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <span>Challenge Attestation</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="bg-orange-50 dark:bg-orange-950/20 p-4 rounded-lg">
            <p className="text-sm text-orange-700 dark:text-orange-300">
              <strong>Important:</strong> Challenging false attestations helps maintain the integrity of our reputation system. 
              However, false challenges will negatively impact your reputation.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Event</label>
            <Input value={eventTitle} disabled />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Challenged User</label>
            <Input 
              value={`${challengedUserAddress.slice(0, 6)}...${challengedUserAddress.slice(-4)}`} 
              disabled 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Challenge Reason <span className="text-red-500">*</span>
            </label>
            <Textarea
              placeholder="Explain why you believe this attestation is false or misleading..."
              value={challengeReason}
              onChange={(e) => setChallengeReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Evidence Description (Optional)</label>
            <Textarea
              placeholder="Describe any evidence you have to support your challenge..."
              value={evidenceDescription}
              onChange={(e) => setEvidenceDescription(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Evidence URL (Optional)</label>
            <Input
              placeholder="https://example.com/evidence"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              Link to photos, videos, or other evidence supporting your challenge
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-950/20 p-3 rounded-lg">
            <div className="flex items-center space-x-2 text-sm text-yellow-700 dark:text-yellow-300">
              <AlertTriangle className="w-4 h-4" />
              <span><strong>Stake:</strong> 10 reputation points will be at risk</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => setIsOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmitChallenge}
            disabled={isSubmitting || !challengeReason.trim()}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <AlertTriangle className="w-4 h-4 mr-2" />
            )}
            Submit Challenge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};