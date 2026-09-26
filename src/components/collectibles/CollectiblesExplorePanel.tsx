import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CollectibleCard } from '@/components/collectibles/CollectibleCard';
import { listCollectibles } from '@/lib/collectibles/collectibleApi';
import type { Collectible } from '@/types/collectible';

export function CollectiblesExplorePanel() {
  const [items, setItems] = useState<Collectible[]>([]);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCollectibles({ page: 1, pageSize: 12, query: debounced }).then((result) => {
      if (cancelled) return;
      setItems(result.collectibles);
      setHasMore(result.has_more);
      setPage(1);
    }).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [debounced]);

  const loadMore = async () => {
    const next = page + 1;
    const result = await listCollectibles({ page: next, pageSize: 12, query: debounced });
    setItems((current) => [...current, ...result.collectibles]);
    setPage(next);
    setHasMore(result.has_more);
  };

  return (
    <div className="space-y-6">
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search collectibles by name…" className="pl-10" />
      </div>
      {loading ? (
        <div className="py-16 text-center text-muted-foreground">Loading collectibles…</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No collectibles found yet.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => <CollectibleCard key={item.id} collectible={item} />)}
          </div>
          {hasMore && <div className="text-center"><Button variant="outline" onClick={loadMore}>Load more</Button></div>}
        </>
      )}
    </div>
  );
}
