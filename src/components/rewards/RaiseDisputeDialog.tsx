import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  REWARD_DISPUTE_CATEGORY_OPTIONS,
  REWARD_POOL_DISPUTE_CATEGORY_OPTIONS,
} from '@/lib/rewards/disputeCategories';
import type { RewardDisputeCategory } from '@/types/rewardPool';

const HOLD_OPTIONS = [
  { value: String(24 * 60 * 60), label: '1 day' },
  { value: String(2 * 24 * 60 * 60), label: '2 days' },
  { value: String(3 * 24 * 60 * 60), label: '3 days' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placement?: number | null;
  defaultCategory?: RewardDisputeCategory;
  busy?: boolean;
  onSubmit: (input: { category: RewardDisputeCategory; reasonText: string; holdDurationSecs: number }) => void;
}

export function RaiseDisputeDialog({ open, onOpenChange, placement, defaultCategory = 'wrong_winner', busy, onSubmit }: Props) {
  const [category, setCategory] = useState<RewardDisputeCategory>(defaultCategory);
  const [reasonText, setReasonText] = useState('');
  const [holdDurationSecs, setHoldDurationSecs] = useState(HOLD_OPTIONS[0].value);
  const categoryOptions = defaultCategory === 'standings'
    ? REWARD_DISPUTE_CATEGORY_OPTIONS.filter((option) => option.value === 'standings')
    : REWARD_POOL_DISPUTE_CATEGORY_OPTIONS;
  const isStandings = category === 'standings';

  useEffect(() => {
    if (open) setCategory(defaultCategory);
  }, [open, defaultCategory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isStandings ? 'Report a ranking issue' : 'Raise a dispute'}</DialogTitle>
          <DialogDescription>
            {placement ? `Disputing placement #${placement}. ` : ''}
            {isStandings
              ? 'Standings reports are reviewed by the team before organizer-reported placements finalize.'
              : 'Disputes are reviewed by an arbitrator. Funds for the contested placement are held during the review window.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as RewardDisputeCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isStandings && (
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
          )}
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
          <Button onClick={() => onSubmit({ category, reasonText, holdDurationSecs: isStandings ? 0 : Number(holdDurationSecs) })} disabled={busy}>
            {busy ? 'Submitting…' : isStandings ? 'Submit report' : 'Submit dispute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
