import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RewardDisputeCategory } from '@/types/rewardPool';

const CATEGORIES: { value: RewardDisputeCategory; label: string }[] = [
  { value: 'wrong_winner', label: 'Wrong winner declared' },
  { value: 'rules_breach', label: 'Organizer broke the stated rules' },
  { value: 'collusion', label: 'Suspected collusion' },
  { value: 'not_paid', label: "Won but couldn't claim" },
  { value: 'other', label: 'Other' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placement?: number | null;
  busy?: boolean;
  onSubmit: (input: { category: RewardDisputeCategory; reasonText: string }) => void;
}

export function RaiseDisputeDialog({ open, onOpenChange, placement, busy, onSubmit }: Props) {
  const [category, setCategory] = useState<RewardDisputeCategory>('wrong_winner');
  const [reasonText, setReasonText] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raise a dispute</DialogTitle>
          <DialogDescription>
            {placement ? `Disputing placement #${placement}. ` : ''}
            Disputes are reviewed by an arbitrator. Funds for the contested placement are held during
            the review window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as RewardDisputeCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispute-reason">Details</Label>
            <Textarea
              id="dispute-reason"
              placeholder="Explain what's wrong and include any evidence links."
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={5}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSubmit({ category, reasonText })} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit dispute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
