import { useMemo, useState } from 'react';
import { isAddress } from 'ethers';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  RewardPoolOnchainPosition,
  WinnerAliasUpdate,
  WinnerAssignmentInput,
} from '@/types/rewardPool';

interface SubmitPayload {
  batch: WinnerAssignmentInput[];
  aliasUpdates: WinnerAliasUpdate[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positions: RewardPoolOnchainPosition[];
  canAssignUnassignedPlacements: boolean;
  canReplaceDeclaredWinners: boolean;
  aliasNudge?: boolean;
  busy?: boolean;
  onSubmit: (payload: SubmitPayload) => void;
}

interface RowValue {
  account?: string;
  alias?: string;
}

/**
 * Creator/manager winner assignment. One input per placement (prefilled with the current winner and
 * its optional name). Address changes go on-chain as a single atomic batch; name changes are
 * off-chain only, so a name can be edited without re-assigning the winner.
 */
export function AssignWinnersDialog({
  open,
  onOpenChange,
  positions,
  canAssignUnassignedPlacements,
  canReplaceDeclaredWinners,
  aliasNudge = false,
  busy,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<Record<number, RowValue>>({});

  const handleChange = (placement: number, field: keyof RowValue, value: string) =>
    setValues((prev) => ({ ...prev, [placement]: { ...prev[placement], [field]: value } }));

  const { batch, aliasUpdates } = useMemo<SubmitPayload>(() => {
    const batch: WinnerAssignmentInput[] = [];
    const aliasUpdates: WinnerAliasUpdate[] = [];
    for (const pos of positions) {
      if (pos.claimed || pos.reclaimed) continue; // settled placements are immutable
      const entry = values[pos.placement];

      const addressEditable = pos.winner ? canReplaceDeclaredWinners : canAssignUnassignedPlacements;
      if (addressEditable && entry?.account != null) {
        const account = entry.account.trim();
        if (isAddress(account) && account.toLowerCase() !== (pos.winner ?? '').toLowerCase()) {
          batch.push({ account, placement: pos.placement });
        }
      }

      // Aliases are cosmetic and editable whenever a winner exists (e.g. typo fix after the claim
      // window opens), but never emitted for a placement that has no winner and isn't being assigned
      // one now — that would attach an orphan name to an empty placement.
      const willHaveWinner = Boolean(pos.winner) || batch.some((b) => b.placement === pos.placement);
      const rawAlias = entry?.alias;
      if (willHaveWinner && rawAlias != null) {
        const alias = rawAlias.trim();
        if (alias !== (pos.winnerAlias ?? '').trim()) {
          aliasUpdates.push({ placement: pos.placement, alias: alias.length ? alias : null });
        }
      }
    }
    return { batch, aliasUpdates };
  }, [canAssignUnassignedPlacements, canReplaceDeclaredWinners, positions, values]);

  const changeCount = batch.length + aliasUpdates.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign winners</DialogTitle>
          <DialogDescription>
            Enter the winning wallet for each placement. Each address must hold a ticket for this
            event, and one address can win only one placement.
            {aliasNudge && (
              <>
                {' '}This event feeds game standings — add each winner&apos;s player name so the
                standings show names instead of wallet addresses.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[50vh] space-y-3 overflow-y-auto px-1">
          {positions.map((pos) => {
            const settled = pos.claimed || pos.reclaimed;
            const addressLocked = settled
              || (pos.winner ? !canReplaceDeclaredWinners : !canAssignUnassignedPlacements);
            // Alias stays editable for a declared winner even once the address is locked.
            const aliasLocked = settled || (!pos.winner && !canAssignUnassignedPlacements);
            return (
              <div key={pos.placement} className="space-y-1">
                <Label htmlFor={`winner-${pos.placement}`}>
                  Placement #{pos.placement}
                  {pos.claimed && <span className="ml-2 text-xs text-muted-foreground">(claimed — locked)</span>}
                  {!pos.claimed && pos.reclaimed && (
                    <span className="ml-2 text-xs text-muted-foreground">(reclaimed — locked)</span>
                  )}
                  {!pos.claimed && !pos.reclaimed && pos.winner && !canReplaceDeclaredWinners && (
                    <span className="ml-2 text-xs text-muted-foreground">(winner locked — name still editable)</span>
                  )}
                  {!pos.claimed && !pos.reclaimed && !pos.winner && !canAssignUnassignedPlacements && (
                    <span className="ml-2 text-xs text-muted-foreground">(assignment window closed — locked)</span>
                  )}
                </Label>
                <Input
                  id={`winner-${pos.placement}`}
                  placeholder="0x…"
                  defaultValue={pos.winner ?? ''}
                  disabled={addressLocked}
                  onChange={(e) => handleChange(pos.placement, 'account', e.target.value)}
                />
                <Input
                  id={`winner-alias-${pos.placement}`}
                  placeholder="Optional name (e.g. Team Alpha)"
                  defaultValue={pos.winnerAlias ?? ''}
                  maxLength={80}
                  disabled={aliasLocked}
                  onChange={(e) => handleChange(pos.placement, 'alias', e.target.value)}
                />
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSubmit({ batch, aliasUpdates })} disabled={busy || changeCount === 0}>
            {busy ? 'Saving…' : `Save ${changeCount || ''}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
