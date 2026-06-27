import { useMemo, useState } from 'react';
import { isAddress } from 'ethers';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RewardPoolOnchainPosition, WinnerAssignmentInput } from '@/types/rewardPool';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positions: RewardPoolOnchainPosition[];
  busy?: boolean;
  onSubmit: (batch: WinnerAssignmentInput[]) => void;
}

/**
 * Creator/manager winner assignment. One input per placement (prefilled with the current winner).
 * Only changed, validly-addressed rows are submitted as a single atomic batch.
 */
export function AssignWinnersDialog({ open, onOpenChange, positions, busy, onSubmit }: Props) {
  const [values, setValues] = useState<Record<number, string>>({});

  const handleChange = (placement: number, value: string) =>
    setValues((prev) => ({ ...prev, [placement]: value }));

  const batch = useMemo<WinnerAssignmentInput[]>(() => {
    const out: WinnerAssignmentInput[] = [];
    for (const pos of positions) {
      const raw = values[pos.placement];
      if (raw == null) continue;
      const account = raw.trim();
      if (!isAddress(account)) continue;
      if (account.toLowerCase() === (pos.winner ?? '').toLowerCase()) continue;
      out.push({ account, placement: pos.placement });
    }
    return out;
  }, [positions, values]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign winners</DialogTitle>
          <DialogDescription>
            Enter the winning wallet for each placement. Each address must hold a ticket for this
            event, and one address can win only one placement.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[50vh] space-y-3 overflow-y-auto px-1">
          {positions.map((pos) => (
            <div key={pos.placement} className="space-y-1">
              <Label htmlFor={`winner-${pos.placement}`}>
                Placement #{pos.placement}
                {pos.claimed && <span className="ml-2 text-xs text-muted-foreground">(claimed — locked)</span>}
              </Label>
              <Input
                id={`winner-${pos.placement}`}
                placeholder="0x…"
                defaultValue={pos.winner ?? ''}
                disabled={pos.claimed}
                onChange={(e) => handleChange(pos.placement, e.target.value)}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSubmit(batch)} disabled={busy || batch.length === 0}>
            {busy ? 'Assigning…' : `Assign ${batch.length || ''}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
