import React, { useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PublishedEvent } from '@/utils/eventUtils';
import { Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeEmail } from '@/utils/emailUtils';

interface WaitlistDialogProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export const WaitlistDialog: React.FC<WaitlistDialogProps> = ({ event, isOpen, onClose }) => {
  const { wallets } = useWallets();
  const { toast } = useToast();
  const [isJoining, setIsJoining] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState('');

  const handleJoinWaitlist = async () => {
    if (!event) return;

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      toast({
        title: 'Email required',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    setIsJoining(true);
    try {
      const walletAddress = wallets[0]?.address?.toLowerCase() || null;

      const { error } = await supabase
        .from('event_waitlist')
        .insert({
          event_id: event.id,
          user_email: normalizedEmail,
          wallet_address: walletAddress,
        });

      if (error) {
        // Check if it's a duplicate entry error
        if (error.code === '23505') {
          toast({
            title: 'Already on waitlist',
            description: "You're already on the waitlist for this event!",
            variant: 'default',
          });

          // Lightweight check: only trigger confirmation if not already sent
          void (async () => {
            try {
              const { data } = await supabase
                .from('event_waitlist')
                .select('confirmation_sent')
                .eq('event_id', event.id)
                .eq('user_email', normalizedEmail)
                .maybeSingle();

              if (data && data.confirmation_sent === false) {
                await supabase.functions.invoke('send-waitlist-confirmations', {
                  body: { event_id: event.id },
                });
              }
            } catch (err) {
              console.warn('[WAITLIST] Failed to trigger confirmation email on duplicate:', err?.message || err);
            }
          })();
        } else {
          throw error;
        }
        } else {
          setIsSuccess(true);
          toast({
            title: 'Joined waitlist!',
            description: "We'll notify you when tickets become available.",
          });

          // Fire-and-forget confirmation email via Edge Function
          void supabase.functions.invoke('send-waitlist-confirmations', {
            body: { event_id: event.id },
          }).catch((err) => {
            console.warn('[WAITLIST] Failed to trigger confirmation email:', err?.message || err);
          });
        }
      } catch (error) {
        console.error('Error joining waitlist:', error);
        toast({
          title: 'Error',
        description: 'Failed to join waitlist. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsJoining(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setIsSuccess(false);
    onClose();
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isSuccess ? 'You\'re on the waitlist!' : 'Join Waitlist'}
          </DialogTitle>
          <DialogDescription>
            {isSuccess
              ? `We'll notify you at ${email} when tickets become available for ${event.title}.`
              : `Get notified when tickets become available for ${event.title}.`
            }
          </DialogDescription>
        </DialogHeader>

        {!isSuccess ? (
          <>
            <div className="space-y-4 py-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Event</span>
                <span className="font-semibold">{event.title}</span>
              </div>

              {/* Email input field */}
              <div className="space-y-2 pt-2">
                <Label htmlFor="waitlist-email">Email Address *</Label>
                <Input
                  type="email"
                  id="waitlist-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={isJoining}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  We'll notify you when tickets become available
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={isJoining}>
                Cancel
              </Button>
              <Button onClick={handleJoinWaitlist} disabled={isJoining || !email} className="w-32">
                {isJoining ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  'Join Waitlist'
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="py-6 flex flex-col items-center gap-4">
            <CheckCircle className="w-16 h-16 text-green-500" />
            <p className="text-center text-muted-foreground">
              Check your email for confirmation
            </p>
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
