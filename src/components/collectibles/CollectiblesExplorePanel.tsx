import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CollectibleCard } from '@/components/collectibles/CollectibleCard';
import { useToast } from '@/hooks/use-toast';
import { listCollectibles } from '@/lib/collectibles/collectibleApi';
import type { Collectible } from '@/types/collectible';

export function CollectiblesExplorePanel() {
  const { toast } = useToast();
  const [items, setItems] = useState<Collectible[]>([]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listCollectibles({ page: 1, pageSize: 12, query: debounced });
        if (cancelled) return;
        setItems(result.collectibles);
        setHasMore(result.has_more);
        setPage(1);
      } catch (cause) {
        if (cancelled) return;
        setItems([]);
        setHasMore(false);
        setError(cause instanceof Error ? cause.message : 'Could not load collectibles.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [debounced, reloadNonce]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await listCollectibles({ page: next, pageSize: 12, query: debounced });
      setItems((current) => [...current, ...result.collectibles]);
      setPage(next);
      setHasMore(result.has_more);
    } catch (cause) {
      toast({ title: 'Could not load more collectibles', description: cause instanceof Error ? cause.message : 'Try again.', variant: 'destructive' });
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search collectibles by name…" className="pl-10" />
      </div>
      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Loading collectibles…</div>
      ) : error ? (
        <Card><CardContent className="py-16 text-center"><div className="font-medium">Could not load collectibles</div><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button className="mt-5" variant="outline" onClick={() => setReloadNonce((value) => value + 1)}>Retry</Button></CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No collectibles found yet.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => <CollectibleCard key={item.id} collectible={item} />)}
          </div>
          {hasMore && <div className="text-center"><Button variant="outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load more'}</Button></div>}
        </>
      )}
    </div>
  );
}
