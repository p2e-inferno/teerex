import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { EventCard } from '@/components/events/EventCard';
import { useHostProfile } from '@/hooks/useEventHost';
import { useIdentityLabel } from '@/hooks/useIdentityLabel';
import { initialsFrom } from '@/lib/avatar';
import { useMultiEventTicketRealtime } from '@/hooks/useMultiEventTicketRealtime';

export default function HostProfile() {
  const { address } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useHostProfile(address);
  const host = data?.host;
  const events = useMemo(() => data?.events ?? [], [data?.events]);
  const { keysSoldMap } = useMultiEventTicketRealtime(events);
  const displayAddress = host?.creator_address || address || '';
  const identityLabel = useIdentityLabel({
    address: displayAddress,
    displayName: host?.display_name,
    fallback: 'Host',
    enabled: Boolean(host),
  });

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-12">
        <div className="mb-8 flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-12">
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            This host could not be found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { host: loadedHost } = data;
  const name = identityLabel.label;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
            {initialsFrom(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-gray-900">{name}</h1>
          <p className="text-sm text-muted-foreground">
            {loadedHost.hosted_public_count} {loadedHost.hosted_public_count === 1 ? 'event' : 'events'} hosted
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            This host has no public events yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              keysSold={keysSoldMap[event.id]}
              onViewDetails={(ev) => navigate(`/event/${ev.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
