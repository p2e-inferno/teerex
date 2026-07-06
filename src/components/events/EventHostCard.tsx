import { Link } from 'react-router-dom';
import { Mail, Flag } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { PublishedEvent } from '@/types/event';
import { useEventHostSummary } from '@/hooks/useEventHost';
import { useIdentityLabel } from '@/hooks/useIdentityLabel';
import { initialsFrom } from '@/lib/avatar';
import { ContactHostDialog } from './ContactHostDialog';
import { ReportEventDialog } from './ReportEventDialog';

export function EventHostCard({
  event,
  layout = 'horizontal',
}: {
  event: PublishedEvent;
  layout?: 'horizontal' | 'vertical';
}) {
  const { data } = useEventHostSummary(event.id);
  const host = data?.host;

  const address = event.creator_address || host?.creator_address || null;
  const identityLabel = useIdentityLabel({
    address,
    displayName: host?.display_name,
    fallback: 'Host',
  });
  const name = identityLabel.label;
  const hostedCount = host?.hosted_public_count ?? null;

  const identity = (
    <div className="flex items-center gap-3">
      <Avatar className="h-10 w-10 border border-slate-200/50 shadow-sm shrink-0">
        <AvatarFallback className="bg-gradient-to-br from-indigo-50 to-purple-50 text-indigo-600 text-xs font-bold">
          {initialsFrom(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Hosted by</div>
        <div className="truncate font-semibold text-slate-900 leading-snug">{name}</div>
        {hostedCount != null && hostedCount > 1 && (
          <div className="text-xs text-slate-500 mt-0.5">{hostedCount} events hosted</div>
        )}
      </div>
    </div>
  );

  if (layout === 'vertical') {
    return (
      <div className="flex flex-col gap-4 py-4 w-full">
        {address ? (
          <Link
            to={`/host/${address}`}
            className="rounded-xl transition-colors hover:bg-slate-50 p-2 -mx-2"
          >
            {identity}
          </Link>
        ) : (
          <div className="p-2 -mx-2">{identity}</div>
        )}
        <div className="flex flex-col gap-2 w-full">
          <ContactHostDialog event={event}>
            <Button variant="outline" className="w-full justify-center bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-semibold shadow-sm transition-all duration-200 h-9">
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Contact Host
            </Button>
          </ContactHostDialog>
          <ReportEventDialog event={event}>
            <Button variant="ghost" className="w-full justify-center text-slate-400 hover:text-red-500 hover:bg-red-50/50 transition-colors duration-200 h-9">
              <Flag className="mr-1.5 h-3.5 w-3.5" />
              Report Event
            </Button>
          </ReportEventDialog>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-2">
      {address ? (
        <Link
          to={`/host/${address}`}
          className="-mx-2 rounded-xl px-2 py-1 transition-colors hover:bg-slate-50"
        >
          {identity}
        </Link>
      ) : (
        identity
      )}
      <div className="flex items-center gap-2">
        <ContactHostDialog event={event}>
          <Button variant="outline" size="sm" className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-semibold shadow-sm transition-all duration-200">
            <Mail className="mr-1.5 h-3.5 w-3.5" />
            Contact Host
          </Button>
        </ContactHostDialog>
        <ReportEventDialog event={event}>
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-500 hover:bg-red-50/50 transition-colors duration-200">
            <Flag className="mr-1.5 h-3.5 w-3.5" />
            Report Event
          </Button>
        </ReportEventDialog>
      </div>
    </div>
  );
}
