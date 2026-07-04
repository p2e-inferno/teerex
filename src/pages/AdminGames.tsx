import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, Gamepad2, RefreshCw } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import type { ScoringProfile } from '@/hooks/useGames';

interface AdminGame {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  cover_url: string | null;
  is_active: boolean;
  scoring_profile: ScoringProfile;
  created_at: string;
  updated_at: string;
}

interface GameFormData {
  slug: string;
  name: string;
  category: string;
  cover_url: string;
  is_active: boolean;
  podium1: number;
  podium2: number;
  podium3: number;
  curveFrom: number;
  curveStep: number;
  curveFloor: number;
  participation: number;
  reviewWindowHours: number;
}

const SCORING_PRESETS: Record<string, Partial<GameFormData>> = {
  standard: { podium1: 100, podium2: 80, podium3: 65, curveFrom: 55, curveStep: 5, curveFloor: 1, participation: 5 },
  battle_royale: { podium1: 100, podium2: 80, podium3: 65, curveFrom: 55, curveStep: 2, curveFloor: 1, participation: 3 },
  winner_takes_most: { podium1: 150, podium2: 60, podium3: 30, curveFrom: 15, curveStep: 3, curveFloor: 0, participation: 0 },
};

const defaultFormData = (): GameFormData => ({
  slug: '',
  name: '',
  category: '',
  cover_url: '',
  is_active: true,
  ...(SCORING_PRESETS.standard as Required<Pick<GameFormData, 'podium1' | 'podium2' | 'podium3' | 'curveFrom' | 'curveStep' | 'curveFloor' | 'participation'>>),
  reviewWindowHours: 72,
});

const toScoringProfile = (form: GameFormData): ScoringProfile => ({
  type: 'placement_points',
  podium: { '1': form.podium1, '2': form.podium2, '3': form.podium3 },
  curve: { kind: 'linear', from: form.curveFrom, step: form.curveStep, floor: form.curveFloor },
  participation: form.participation,
  review_window_hours: form.reviewWindowHours,
  min_participants: 0,
});

const previewPoints = (form: GameFormData): string => {
  const parts = [`1st ${form.podium1}`, `2nd ${form.podium2}`, `3rd ${form.podium3}`];
  for (let p = 4; p <= 7; p++) {
    parts.push(`${p}th ${Math.max(form.curveFloor, form.curveFrom - (p - 4) * form.curveStep)}`);
  }
  parts.push('…');
  parts.push(`participants ${form.participation}`);
  return parts.join(' · ');
};

const AdminGames: React.FC = () => {
  const { user, getAccessToken } = usePrivy();
  const [games, setGames] = useState<AdminGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingGameId, setTogglingGameId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<AdminGame | null>(null);
  const [formData, setFormData] = useState<GameFormData>(defaultFormData);

  const preview = useMemo(() => previewPoints(formData), [formData]);

  const loadGames = useCallback(async (opts?: { background?: boolean }) => {
    try {
      if (!opts?.background) setIsLoading(true);
      const token = await getAccessToken?.();
      const data = await callEdgeFunction<{ games: AdminGame[] }>(
        'admin-leaderboards',
        { route: 'list-games' },
        { privyToken: token, withAnonKey: true },
      );
      setGames(data.games || []);
    } catch (error: unknown) {
      console.error('Error loading games:', error);
      toast({
        title: 'Error Loading Games',
        description: error instanceof Error ? error.message : 'There was an error loading the games catalog.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  const applyPreset = (key: string) => {
    const preset = SCORING_PRESETS[key];
    if (preset) setFormData(prev => ({ ...prev, ...preset }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const token = await getAccessToken?.();
      await callEdgeFunction('admin-leaderboards', {
        route: 'upsert-game',
        slug: formData.slug,
        name: formData.name,
        category: formData.category || null,
        cover_url: formData.cover_url || null,
        is_active: formData.is_active,
        scoring_profile: toScoringProfile(formData),
      }, { privyToken: token, withAnonKey: true });

      toast({
        title: editingGame ? 'Game Updated' : 'Game Added',
        description: `${formData.name} has been saved.`,
      });
      setDialogOpen(false);
      setEditingGame(null);
      setFormData(defaultFormData());
      loadGames({ background: true });
    } catch (error: unknown) {
      toast({
        title: 'Error Saving Game',
        description: error instanceof Error ? error.message : 'There was an error saving the game.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (game: AdminGame) => {
    const profile = game.scoring_profile || {};
    const podium = profile.podium || {};
    const curve = profile.curve || {};
    setEditingGame(game);
    setFormData({
      slug: game.slug,
      name: game.name,
      category: game.category || '',
      cover_url: game.cover_url || '',
      is_active: game.is_active,
      podium1: Number(podium['1'] ?? 100),
      podium2: Number(podium['2'] ?? 80),
      podium3: Number(podium['3'] ?? 65),
      curveFrom: Number(curve.from ?? 55),
      curveStep: Number(curve.step ?? 5),
      curveFloor: Number(curve.floor ?? 1),
      participation: Number(profile.participation ?? 5),
      reviewWindowHours: Number(profile.review_window_hours ?? 72),
    });
    setDialogOpen(true);
  };

  const handleToggleActive = async (game: AdminGame) => {
    try {
      setTogglingGameId(game.id);
      const newState = !game.is_active;
      setGames(prev => prev.map(g => (g.id === game.id ? { ...g, is_active: newState } : g)));
      const token = await getAccessToken?.();
      await callEdgeFunction('admin-leaderboards', {
        route: 'set-game-active',
        game_id: game.id,
        is_active: newState,
      }, { privyToken: token, withAnonKey: true });
      toast({
        title: newState ? 'Game Activated' : 'Game Deactivated',
        description: `${game.name} is now ${newState ? 'selectable for new events' : 'hidden from event creation'}.`,
      });
      loadGames({ background: true });
    } catch (error: unknown) {
      setGames(prev => prev.map(g => (g.id === game.id ? { ...g, is_active: game.is_active } : g)));
      toast({
        title: 'Error Updating Game',
        description: error instanceof Error ? error.message : 'There was an error updating the game.',
        variant: 'destructive',
      });
    } finally {
      setTogglingGameId(null);
    }
  };

  const openAddDialog = () => {
    setEditingGame(null);
    setFormData(defaultFormData());
    setDialogOpen(true);
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Please connect your wallet to access admin features.</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
              <Gamepad2 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Games Catalog
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Curate the supported games and their standings scoring. Organizers can only select active games.
          </p>
        </div>

        <div className="flex justify-between items-center mb-8">
          <Button onClick={() => loadGames()} variant="outline" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog} className="bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" />
                Add Game
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingGame ? 'Edit Game' : 'Add New Game'}</DialogTitle>
                <DialogDescription>
                  Scoring points are derived from this profile at read time — changing it never rewrites past results.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="game_slug">Slug</Label>
                    <Input
                      id="game_slug"
                      value={formData.slug}
                      onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase() }))}
                      placeholder="codm"
                      pattern="[a-z0-9][a-z0-9-]{1,48}"
                      disabled={!!editingGame}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="game_name">Name</Label>
                    <Input
                      id="game_name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Call of Duty: Mobile"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="game_category">Category (Optional)</Label>
                    <Input
                      id="game_category"
                      value={formData.category}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      placeholder="shooter"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="game_cover">Cover Image URL (Optional)</Label>
                    <Input
                      id="game_cover"
                      value={formData.cover_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, cover_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Scoring Preset</Label>
                  <Select onValueChange={applyPreset}>
                    <SelectTrigger>
                      <SelectValue placeholder="Apply a preset" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard tournament</SelectItem>
                      <SelectItem value="battle_royale">Battle royale (shallow decay)</SelectItem>
                      <SelectItem value="winner_takes_most">Winner takes most</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="podium1">1st place</Label>
                    <Input id="podium1" type="number" min={0} value={formData.podium1}
                      onChange={(e) => setFormData(prev => ({ ...prev, podium1: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="podium2">2nd place</Label>
                    <Input id="podium2" type="number" min={0} value={formData.podium2}
                      onChange={(e) => setFormData(prev => ({ ...prev, podium2: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="podium3">3rd place</Label>
                    <Input id="podium3" type="number" min={0} value={formData.podium3}
                      onChange={(e) => setFormData(prev => ({ ...prev, podium3: Number(e.target.value) || 0 }))} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="curveFrom">4th place starts at</Label>
                    <Input id="curveFrom" type="number" min={0} value={formData.curveFrom}
                      onChange={(e) => setFormData(prev => ({ ...prev, curveFrom: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="curveStep">Step down per place</Label>
                    <Input id="curveStep" type="number" min={0} value={formData.curveStep}
                      onChange={(e) => setFormData(prev => ({ ...prev, curveStep: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="curveFloor">Minimum points</Label>
                    <Input id="curveFloor" type="number" min={0} value={formData.curveFloor}
                      onChange={(e) => setFormData(prev => ({ ...prev, curveFloor: Number(e.target.value) || 0 }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="participation">Participation points (0 = none)</Label>
                    <Input id="participation" type="number" min={0} value={formData.participation}
                      onChange={(e) => setFormData(prev => ({ ...prev, participation: Number(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reviewWindow">Standings review window (hours)</Label>
                    <Input id="reviewWindow" type="number" min={1} value={formData.reviewWindowHours}
                      onChange={(e) => setFormData(prev => ({ ...prev, reviewWindowHours: Number(e.target.value) || 72 }))} />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Points preview</p>
                  <p className="text-sm">{preview}</p>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="game_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                  />
                  <Label htmlFor="game_active">Active (selectable in event creation)</Label>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingGame ? 'Update Game' : 'Add Game'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={`skeleton-${i}`} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-3 bg-gray-200 rounded"></div>
                </CardContent>
              </Card>
            ))
          ) : (
            games.map((game) => (
              <Card key={game.id} className="border-0 shadow-lg bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${game.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      <div>
                        <CardTitle className="text-lg">{game.name}</CardTitle>
                        <CardDescription>{game.slug}{game.category ? ` · ${game.category}` : ''}</CardDescription>
                      </div>
                    </div>
                    {!game.is_active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      const podium = game.scoring_profile?.podium || {};
                      const participation = game.scoring_profile?.participation ?? 0;
                      return `1st ${podium['1'] ?? '—'} · 2nd ${podium['2'] ?? '—'} · 3rd ${podium['3'] ?? '—'} · participants ${participation}`;
                    })()}
                  </p>

                  <div className="flex items-center justify-between pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleActive(game)}
                      disabled={togglingGameId === game.id}
                    >
                      {togglingGameId === game.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : null}
                      {game.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(game)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {games.length === 0 && !isLoading && (
          <Card className="border-0 shadow-lg">
            <CardHeader className="text-center py-12">
              <Gamepad2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <CardTitle>No Games Yet</CardTitle>
              <CardDescription>Add the first supported game to enable tournament standings.</CardDescription>
            </CardHeader>
            <CardContent className="text-center pb-12">
              <Button onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Game
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminGames;
