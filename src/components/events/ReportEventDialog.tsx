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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EdgeFunctionError } from '@/lib/edgeFunctions';
import { useReportEvent, type ReportReason } from '@/hooks/useEventReports';
import type { PublishedEvent } from '@/types/event';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'misleading', label: 'Misleading information' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'other', label: 'Something else' },
];

interface ReportEventDialogProps {
  event: PublishedEvent;
  children: React.ReactNode;
}

export function ReportEventDialog({ event, children }: ReportEventDialogProps) {
  const { authenticated, login } = usePrivy();
  const { toast } = useToast();
  const reportEvent = useReportEvent();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');

  const handleSubmit = async () => {
    if (!reason) return;
    try {
      await reportEvent.mutateAsync({ eventId: event.id, reason, details: details.trim() || undefined });
      toast({ title: 'Report submitted', description: 'Thanks — our team will review this event.' });
      setReason('');
      setDetails('');
      setOpen(false);
    } catch (err) {
      const message = err instanceof EdgeFunctionError ? err.message : 'Please try again.';
      toast({
        title: 'Could not submit report',
        description: message === 'already_reported' ? 'You have already reported this event.' : message,
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
          <DialogTitle>Report event</DialogTitle>
          <DialogDescription>
            Let us know what's wrong with "{event.title}". Reports are confidential.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-reason">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
              <SelectTrigger id="report-reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-details">Details (optional)</Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add any context that will help us review…"
              rows={4}
              maxLength={2000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={reportEvent.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!reason || reportEvent.isPending}>
            {reportEvent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
