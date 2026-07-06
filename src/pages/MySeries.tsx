import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { ExternalLink, Loader2, Pencil, Plus, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { EdgeFunctionError } from '@/lib/edgeFunctions';
import { useGames } from '@/hooks/useGames';
import {
  useCreateSeries,
  useMySeries,
  useUpdateSeries,
  type Series,
} from '@/hooks/useSeries';

interface SeriesFormData {
  game_id: string;
  name: string;
  season_label: string;
  starts_at: string;
  ends_at: string;
}

const emptyForm = (): SeriesFormData => ({
  game_id: '',
  name: '',
  season_label: '',
  starts_at: '',
  ends_at: '',
});

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const toIsoOrNull = (date: string) => (date ? new Date(date).toISOString() : null);
// The date input is day-granular; the season must include events on its final day.
const toEndOfDayIsoOrNull = (date: string) => (date ? `${date}T23:59:59.999Z` : null);

const MySeries = () => {
  const { toast } = useToast();
  const { authenticated, login } = usePrivy();
  const { data: series = [], isLoading } = useMySeries();
  const { data: games = [] } = useGames();
  const createSeries = useCreateSeries();
  const updateSeries = useUpdateSeries();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Series | null>(null);
  const [form, setForm] = useState<SeriesFormData>(emptyForm());
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const gameName = (gameId: string) => games.find((g) => g.id === gameId)?.name ?? 'Game';
  const busy = createSeries.isPending || updateSeries.isPending;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (s: Series) => {
    setEditing(s);
    setForm({
      game_id: s.game_id,
      name: s.name,
      season_label: s.season_label ?? '',
      starts_at: toDateInput(s.starts_at),
      ends_at: toDateInput(s.ends_at),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      season_label: form.season_label.trim() || null,
      starts_at: toIsoOrNull(form.starts_at),
      ends_at: toEndOfDayIsoOrNull(form.ends_at),
    };
    try {
      if (editing) {
        await updateSeries.mutateAsync({ board_id: editing.id, ...payload });
        toast({ title: 'Series updated', description: `${form.name} has been saved.` });
      } else {
        await createSeries.mutateAsync({ game_id: form.game_id, ...payload });
        toast({
          title: 'Series created',
          description: 'Standings will build up as your events finalize results.',
        });
      }
      setDialogOpen(false);
    } catch (err) {
      toast({
        title: editing ? 'Could not update series' : 'Could not create series',
        description: err instanceof EdgeFunctionError ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (s: Series) => {
    try {
      setTogglingId(s.id);
      await updateSeries.mutateAsync({ board_id: s.id, is_active: !s.is_active });
      toast({
        title: s.is_active ? 'Series deactivated' : 'Series activated',
        description: s.is_active
          ? 'It is hidden from public listings and no longer refreshed.'
          : 'It is publicly visible and refreshes as results finalize.',
      });
    } catch (err) {
      toast({
        title: 'Could not update series',
        description: err instanceof EdgeFunctionError ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  if (!authenticated) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl text-center">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">My Series</h1>
        <p className="text-muted-foreground mb-6">
          Sign in to create a series that tracks standings across your tournaments.
        </p>
        <Button onClick={login}>Sign in</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-amber-500" /> My Series
          </h1>
          <p className="text-muted-foreground mt-1">
            A series aggregates finalized standings across all your events for one game.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New series
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-2/3" />
                <div className="h-4 bg-muted rounded w-1/3" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : series.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-10">
            <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <CardTitle className="text-lg">No series yet</CardTitle>
            <CardDescription>
              Create one to track standings across your tournaments.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pb-10">
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Create your first series
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {series.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{s.name}</CardTitle>
                    <CardDescription>
                      {gameName(s.game_id)}
                      {s.season_label ? ` · ${s.season_label}` : ''}
                    </CardDescription>
                  </div>
                  {!s.is_active && <Badge variant="secondary">Inactive</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {s.last_recomputed_at && (
                  <p className="text-xs text-muted-foreground">
                    Standings updated {new Date(s.last_recomputed_at).toLocaleString()}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/series/${s.id}`}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> View standings
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggleActive(s)}
                    disabled={togglingId === s.id}
                  >
                    {togglingId === s.id && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    {s.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit series' : 'New series'}</DialogTitle>
            <DialogDescription>
              Only finalized results count, and each event scores a player once with their best
              placement. An optional season window limits which results are included.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!editing && (
              <div className="space-y-2">
                <Label>Game</Label>
                <Select
                  value={form.game_id}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, game_id: v }))}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a game" />
                  </SelectTrigger>
                  <SelectContent>
                    {games.map((game) => (
                      <SelectItem key={game.id} value={game.id}>{game.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="series-name">Name</Label>
              <Input
                id="series-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Lagos CODM Championship"
                minLength={2}
                maxLength={80}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="series-season">Season label (optional)</Label>
              <Input
                id="series-season"
                value={form.season_label}
                onChange={(e) => setForm((prev) => ({ ...prev, season_label: e.target.value }))}
                placeholder="Season 1 · 2026"
                maxLength={60}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="series-starts">Season starts (optional)</Label>
                <Input
                  id="series-starts"
                  type="date"
                  value={form.starts_at}
                  onChange={(e) => setForm((prev) => ({ ...prev, starts_at: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="series-ends">Season ends (optional)</Label>
                <Input
                  id="series-ends"
                  type="date"
                  value={form.ends_at}
                  onChange={(e) => setForm((prev) => ({ ...prev, ends_at: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || (!editing && !form.game_id)}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? 'Save changes' : 'Create series'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MySeries;
