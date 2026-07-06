import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { EdgeFunctionError } from '@/lib/edgeFunctions';
import {
  useStandingsTicketHolders,
  useSubmitExtendedPlacements,
} from '@/hooks/useEventStandings';
import { IdentityName } from '@/components/identity/IdentityName';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
}

/**
 * Organizer editor for placements below the prize line. Placements are implicit from list order
 * (prize floor + 1, +2, ...) so the RPC's contiguity rule can never be violated from this UI.
 */
export function ExtendedPlacementsDialog({ open, onOpenChange, eventId }: Props) {
  const { toast } = useToast();
  const { data, isLoading } = useStandingsTicketHolders(eventId, open);
  const submit = useSubmitExtendedPlacements(eventId);

  const [ranked, setRanked] = useState<string[]>([]);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setInitializedFor(null);
      return;
    }
    if (data && initializedFor !== data.event_id) {
      setRanked(data.entries.map((e) => e.wallet));
      setInitializedFor(data.event_id);
    }
  }, [open, data, initializedFor]);

  const unranked = useMemo(() => {
    const rankedSet = new Set(ranked);
    return (data?.holders ?? []).filter((h) => !rankedSet.has(h.wallet));
  }, [data?.holders, ranked]);

  const prizeFloor = data?.prize_floor ?? 0;
  const locked = Boolean(data?.sheet_final);
  const hadEntries = (data?.entries.length ?? 0) > 0;
  const canSubmit = !submit.isPending && (ranked.length > 0 || hadEntries);
  const isClearing = ranked.length === 0 && hadEntries;

  const move = (index: number, delta: number) => {
    setRanked((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = async () => {
    try {
      await submit.mutateAsync(
        ranked.map((wallet, i) => ({ wallet, placement: prizeFloor + i + 1 })),
      );
      toast({
        title: isClearing ? 'Standings cleared' : 'Standings submitted',
        description: isClearing
          ? 'Organizer-reported placements were removed. Remaining players stay in the Participated tier.'
          : 'Placements are pending review and finalize after the review window.',
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Could not submit standings',
        description: err instanceof EdgeFunctionError ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Extend event standings</DialogTitle>
          <DialogDescription>
            Rank ticket holders below the prize winners. Rank as many as you know — everyone else
            stays in the Participated tier. You can re-order until the review window closes.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading ticket holders…</p>
        ) : !data || prizeFloor === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Ranking opens once prize winners are assigned. Assign winners first, then rank the
            remaining ticket holders here.
          </p>
        ) : locked ? (
          <p className="py-4 text-sm text-muted-foreground">
            These standings are final and can no longer be edited.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium">
                Ranked (starting at #{prizeFloor + 1})
              </div>
              {ranked.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No one ranked yet. Add players from the list below in finishing order.
                </p>
              ) : (
                <ScrollArea className="max-h-52">
                  <div className="space-y-1 pr-2">
                    {ranked.map((wallet, i) => (
                      <div key={wallet} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm">
                        <span className="w-10 shrink-0 font-medium text-slate-600">#{prizeFloor + i + 1}</span>
                        <IdentityName address={wallet} className="min-w-0 flex-1 truncate text-xs" />
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === ranked.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-slate-400 hover:text-red-600"
                          onClick={() => setRanked((prev) => prev.filter((w) => w !== wallet))}
                          aria-label="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">
                Unranked ticket holders <span className="font-normal text-muted-foreground">(stay as Participated)</span>
              </div>
              {unranked.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {(data.holders.length === 0)
                    ? 'No eligible ticket holders — prize winners are already ranked.'
                    : 'Everyone is ranked.'}
                </p>
              ) : (
                <ScrollArea className="max-h-40">
                  <div className="space-y-1 pr-2">
                    {unranked.map((h) => (
                      <div key={h.wallet} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
                        <IdentityName address={h.wallet} className="min-w-0 flex-1 truncate text-xs" />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setRanked((prev) => [...prev, h.wallet])}
                        >
                          <Plus className="h-3 w-3" /> Rank
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            Cancel
          </Button>
          {!locked && prizeFloor > 0 && (
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submit.isPending ? 'Submitting…' : isClearing ? 'Clear standings' : 'Submit standings'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
