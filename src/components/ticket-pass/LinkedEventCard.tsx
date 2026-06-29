import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, ArrowRight, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getPublishedEventByLockAddress } from '@/utils/eventUtils';

/**
 * Shows the event a Ticket Pass unlocks (resolved by lock address) and routes back to it, closing
 * the loop: a buyer who lands on a pass discovers the event and can register. Renders nothing if
 * the linked event can't be found.
 */
export const LinkedEventCard = ({ address }: { address: string }) => {
  const { data: event } = useQuery({
    queryKey: ['event-by-lock', address?.toLowerCase()],
    queryFn: () => getPublishedEventByLockAddress(address),
    enabled: !!address,
    staleTime: 60 * 1000,
  });

  if (!event) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Covers ticket cost for this event</p>
        <div className="flex items-center gap-3">
          {event.image_url && (
            <img src={event.image_url} alt="" className="w-14 h-14 rounded object-cover shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{event.title}</p>
            {event.date && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {event.date.toLocaleDateString()}
              </p>
            )}
            {event.location && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3" />
                {event.location}
              </p>
            )}
          </div>
        </div>
        <Button asChild variant="outline" className="w-full mt-3">
          <Link to={`/event/${address}`}>
            View &amp; register <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};
