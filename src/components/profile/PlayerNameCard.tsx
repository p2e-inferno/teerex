import { useEffect, useState } from 'react';
import { Gamepad2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { EdgeFunctionError } from '@/lib/edgeFunctions';
import { useMyDisplayName, useSetDisplayName } from '@/hooks/useCircuits';

export function PlayerNameCard() {
  const { toast } = useToast();
  const { data: currentName, isLoading } = useMyDisplayName();
  const setDisplayName = useSetDisplayName();
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(currentName ?? '');
  }, [currentName]);

  const trimmed = value.trim();
  const dirty = trimmed !== (currentName ?? '');
  const valid = trimmed === '' || (trimmed.length >= 2 && trimmed.length <= 40);

  const handleSave = async () => {
    try {
      await setDisplayName.mutateAsync(trimmed === '' ? null : trimmed);
      toast({
        title: trimmed === '' ? 'Player name cleared' : 'Player name saved',
        description: trimmed === ''
          ? 'Standings will show your wallet address instead.'
          : `You will appear as "${trimmed}" on standings and circuits.`,
      });
    } catch (err) {
      toast({
        title: 'Could not save player name',
        description: err instanceof EdgeFunctionError ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gamepad2 className="h-5 w-5 text-primary" /> Player name
        </CardTitle>
        <CardDescription>
          Shown publicly on event standings and circuit leaderboards instead of your wallet address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="player-display-name">Display name</Label>
          <Input
            id="player-display-name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. ShadowStriker"
            maxLength={40}
            disabled={isLoading || setDisplayName.isPending}
          />
          {!valid && (
            <p className="text-xs text-destructive">Use 2–40 characters, or clear it entirely.</p>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isLoading || setDisplayName.isPending || !dirty || !valid}
        >
          {setDisplayName.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {trimmed === '' && currentName ? 'Clear name' : 'Save name'}
        </Button>
      </CardContent>
    </Card>
  );
}
