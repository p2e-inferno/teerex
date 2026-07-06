import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EdgeFunctionError } from '@/lib/edgeFunctions';
import { useContactHost } from '@/hooks/useContactHost';
import type { PublishedEvent } from '@/types/event';

const MIN_LENGTH = 10;
const MAX_LENGTH = 2000;

interface ContactHostDialogProps {
  event: PublishedEvent;
  children: React.ReactNode;
}

export function ContactHostDialog({ event, children }: ContactHostDialogProps) {
  const { authenticated, login, user } = usePrivy();
  const { toast } = useToast();
  const contactHost = useContactHost();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  const senderEmail = user?.email?.address ?? null;

  const trimmed = message.trim();
  const valid = trimmed.length >= MIN_LENGTH && trimmed.length <= MAX_LENGTH;

  const handleSend = async () => {
    try {
      await contactHost.mutateAsync({ eventId: event.id, message: trimmed });
      toast({ title: 'Message sent', description: 'The host will receive your message by email.' });
      setMessage('');
      setOpen(false);
    } catch (err) {
      toast({
        title: 'Could not send message',
        description: err instanceof EdgeFunctionError ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && !authenticated) {
          login();
          return;
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact the Host</DialogTitle>
          <DialogDescription>
            Have a question about the event? You can send a message to the host.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What's your question for the host?"
            rows={5}
            maxLength={MAX_LENGTH}
          />
          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {senderEmail ? (
                <>
                  The host will send replies to{' '}
                  <span className="font-medium text-foreground">{senderEmail}</span>.
                </>
              ) : (
                'The host will reply to you by email.'
              )}
            </span>
            <span className="shrink-0">
              {trimmed.length}/{MAX_LENGTH}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={contactHost.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!valid || contactHost.isPending}>
            {contactHost.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
