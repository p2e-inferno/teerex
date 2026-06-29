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

const HOLD_OPTIONS = [
  { value: String(24 * 60 * 60), label: '1 day' },
  { value: String(2 * 24 * 60 * 60), label: '2 days' },
  { value: String(3 * 24 * 60 * 60), label: '3 days' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placement?: number | null;
  busy?: boolean;
  onSubmit: (input: { category: RewardDisputeCategory; reasonText: string; holdDurationSecs: number }) => void;
}

export function RaiseDisputeDialog({ open, onOpenChange, placement, busy, onSubmit }: Props) {
  const [category, setCategory] = useState<RewardDisputeCategory>('wrong_winner');
  const [reasonText, setReasonText] = useState('');
  const [holdDurationSecs, setHoldDurationSecs] = useState(HOLD_OPTIONS[0].value);

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
            <Label>Hold duration</Label>
            <Select value={holdDurationSecs} onValueChange={setHoldDurationSecs}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOLD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
          <Button onClick={() => onSubmit({ category, reasonText, holdDurationSecs: Number(holdDurationSecs) })} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit dispute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
