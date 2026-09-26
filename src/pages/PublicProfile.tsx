import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EventCard } from '@/components/events/EventCard';
import { CollectibleCard } from '@/components/collectibles/CollectibleCard';
import { useHostProfile } from '@/hooks/useEventHost';
import { useIdentityLabel } from '@/hooks/useIdentityLabel';
import { initialsFrom } from '@/lib/avatar';
import { listCollectibles } from '@/lib/collectibles/collectibleApi';
import { getUserKeyBalance } from '@/utils/lockUtils';
import { useMultiEventTicketRealtime } from '@/hooks/useMultiEventTicketRealtime';
import type { Collectible } from '@/types/collectible';

interface Owned { collectible: Collectible; quantity: number; }

export default function PublicProfile() {
  const { address = '' } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = requested === 'created' || requested === 'collected' ? requested : 'events';
  const eventProfile = useHostProfile(address);
  const events = useMemo(() => eventProfile.data?.events ?? [], [eventProfile.data?.events]);
  const { keysSoldMap } = useMultiEventTicketRealtime(events);
  const [created, setCreated] = useState<Collectible[]>([]);
  const [collected, setCollected] = useState<Owned[]>([]);
  const [loadingCollectibles, setLoadingCollectibles] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoadingCollectibles(true);
      try {
        const [createdResult, allResult] = await Promise.all([
          listCollectibles({ creatorAddress: address, pageSize: 48 }),
          listCollectibles({ pageSize: 48 }),
        ]);
        const owned = await Promise.all(allResult.collectibles.map(async (item) => ({ item, quantity: await getUserKeyBalance(item.lock_address, address, item.chain_id) })));
        if (!cancelled) {
          setCreated(createdResult.collectibles);
          setCollected(owned.filter((row) => row.quantity > 0).map((row) => ({ collectible: row.item, quantity: row.quantity })));
        }
      } finally { if (!cancelled) setLoadingCollectibles(false); }
    };
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) void run(); else setLoadingCollectibles(false);
    return () => { cancelled = true; };
  }, [address]);

  const profileHost = eventProfile.data?.host;
  const collectibleName = created[0]?.creator_display_name || collected.find((row) => row.collectible.creator_address.toLowerCase() === address.toLowerCase())?.collectible.creator_display_name;
  const identity = useIdentityLabel({ address, displayName: profileHost?.display_name || collectibleName, fallback: 'TeeRex user', enabled: Boolean(address) });
  const total = events.length + created.length + collected.length;

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return <div className="container mx-auto max-w-3xl px-6 py-16"><Card><CardContent className="py-16 text-center">This profile address is invalid.</CardContent></Card></div>;
  if (!eventProfile.isLoading && !loadingCollectibles && total === 0) return <div className="container mx-auto max-w-3xl px-6 py-16"><Card><CardContent className="py-16 text-center">This TeeRex profile has no public work or collection yet.</CardContent></Card></div>;

  return (
    <div className="container mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center gap-4"><Avatar className="h-16 w-16"><AvatarFallback>{initialsFrom(identity.label)}</AvatarFallback></Avatar><div><h1 className="text-2xl font-bold">{identity.label}</h1><p className="text-sm text-muted-foreground">{events.length} events · {created.length} created · {collected.length} collected</p></div></div>
      <div className="mb-8 inline-flex rounded-lg border p-1"><Button size="sm" variant={tab === 'events' ? 'default' : 'ghost'} onClick={() => setParams({ tab: 'events' })}>Events</Button><Button size="sm" variant={tab === 'created' ? 'default' : 'ghost'} onClick={() => setParams({ tab: 'created' })}>Created</Button><Button size="sm" variant={tab === 'collected' ? 'default' : 'ghost'} onClick={() => setParams({ tab: 'collected' })}>Collected</Button></div>
      {tab === 'events' && (eventProfile.isLoading ? <div className="py-16 text-center text-muted-foreground">Loading events…</div> : events.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">No public events yet.</CardContent></Card> : <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} keysSold={keysSoldMap[event.id]} onViewDetails={(value) => navigate(`/event/${value.id}`)} />)}</div>)}
      {tab === 'created' && (loadingCollectibles ? <div className="py-16 text-center text-muted-foreground">Loading work…</div> : created.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">No public collectibles created yet.</CardContent></Card> : <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{created.map((item) => <CollectibleCard key={item.id} collectible={item} />)}</div>)}
      {tab === 'collected' && (loadingCollectibles ? <div className="py-16 text-center text-muted-foreground">Loading collection…</div> : collected.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">No public TeeRex collectibles owned yet.</CardContent></Card> : <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{collected.map(({ collectible, quantity }) => <CollectibleCard key={collectible.id} collectible={collectible} ownedQuantity={quantity} />)}</div>)}
    </div>
  );
}
