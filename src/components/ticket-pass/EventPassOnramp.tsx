import { Link } from 'react-router-dom';
import { Coins, ArrowRight } from 'lucide-react';
import type { PublishedEvent } from '@/types/event';
import { useTicketPassesForEvent } from '@/hooks/useTicketPassesForEvent';

/**
 * Fiat→crypto onramp shown at the event purchase point. Renders only when an active Ticket Pass is
 * explicitly linked to this event, so it sits exactly where a buyer who lacks the token or gas hits
 * friction. It routes to the existing pass flow (single pass → detail, multiple → filtered explorer)
 * rather than duplicating any purchase UI.
 */
export const EventPassOnramp = ({
  event,
}: {
  event: Pick<PublishedEvent, 'lock_address' | 'currency'>;
}) => {
  const { data: passes = [] } = useTicketPassesForEvent(event.lock_address);
  if (!passes.length) return null;

  const to = passes.length === 1
    ? `/ticket-passes/${passes[0].id}`
    : `/ticket-passes?event=${event.lock_address}`;

  const token = event.currency && event.currency !== 'FREE' ? event.currency : 'funds';

  return (
    <Link
      to={to}
      className="block rounded-lg border border-purple-200 bg-purple-50 p-3 hover:bg-purple-100 transition-colors"
    >
      <div className="flex items-center gap-2 text-sm text-purple-800">
        <Coins className="w-4 h-4 shrink-0" />
        <span className="flex-1">Need {token} or gas to join? Get it instantly with a Ticket Pass.</span>
        <ArrowRight className="w-4 h-4 shrink-0" />
      </div>
    </Link>
  );
};
