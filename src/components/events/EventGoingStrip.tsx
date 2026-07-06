import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useEventHostSummary } from '@/hooks/useEventHost';
import type { RecentHolder } from '@/hooks/useEventHost';
import { useIdentityLabel } from '@/hooks/useIdentityLabel';
import { initialsFrom } from '@/lib/avatar';

const MAX_AVATARS = 5;

interface EventGoingStripProps {
  eventId: string;
  /** Live ticket count from realtime; a change refetches the holder summary. */
  ticketsSold?: number;
}

function HolderAvatar({ holder }: { holder: RecentHolder }) {
  const identity = useIdentityLabel({
    address: holder.wallet,
    displayName: holder.display_name,
  });

  return (
    <Avatar className="h-8 w-8 ring-2 ring-white">
      <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
        {initialsFrom(identity.label)}
      </AvatarFallback>
    </Avatar>
  );
}

export function EventGoingStrip({ eventId, ticketsSold }: EventGoingStripProps) {
  const queryClient = useQueryClient();
  const { data } = useEventHostSummary(eventId);
  const prevSold = useRef(ticketsSold);

  useEffect(() => {
    if (ticketsSold === undefined || prevSold.current === ticketsSold) return;
    prevSold.current = ticketsSold;
    void queryClient.invalidateQueries({ queryKey: ['event-host-summary', eventId] });
  }, [ticketsSold, eventId, queryClient]);

  const social = data?.social;
  if (!social || social.ticket_holder_count === 0) return null;

  const shown = social.recent_holders.slice(0, MAX_AVATARS);
  const count = social.ticket_holder_count;

  return (
    <div className="flex items-center gap-3">
      {shown.length > 0 && (
        <div className="flex -space-x-2">
          {shown.map((holder) => (
            <HolderAvatar key={holder.wallet} holder={holder} />
          ))}
        </div>
      )}
      <div className="text-sm text-gray-600">
        <span className="font-semibold text-gray-900">{count}</span>{' '}
        {count === 1 ? 'person attending' : 'attending'}
      </div>
    </div>
  );
}
