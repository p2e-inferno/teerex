import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { EventCard } from '@/components/events/EventCard';
import { useHostOtherEventsInfinite } from '@/hooks/useEventHost';
import { Skeleton } from '@/components/ui/skeleton';

export function MoreFromHost({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useHostOtherEventsInfinite(eventId, 6);

  const observerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    const current = observerRef.current;
    if (current) {
      observer.observe(current);
    }
    return () => {
      if (current) {
        observer.unobserve(current);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Handle loading state
  if (isLoading) {
    return (
      <div className="space-y-4 pt-8 border-t border-slate-100">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">More from this host</h2>
        <div className="flex gap-6 overflow-x-auto pb-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-shrink-0 w-[290px] border border-slate-100 rounded-2xl overflow-hidden shadow-sm space-y-4 p-4 bg-white">
              <Skeleton className="w-full aspect-square rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 bg-slate-200 w-1/4 rounded-full" />
                <Skeleton className="h-6 bg-slate-200 w-3/4 rounded-md" />
                <Skeleton className="h-4 bg-slate-200 w-5/6 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const events = data?.pages.flatMap((page) => page.events) || [];

  if (events.length === 0) return null;

  return (
    <div className="space-y-6 pt-8 border-t border-slate-100">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">More from this host</h2>
        <span className="text-xs text-slate-400 font-medium bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
          {events.length} event{events.length > 1 ? 's' : ''} total
        </span>
      </div>
      
      {/* Horizontal Scroll Wrapper */}
      <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent snap-x snap-mandatory">
        {events.map((event) => (
          <div key={event.id} className="flex-shrink-0 w-[290px] snap-start transition-all duration-300 hover:-translate-y-0.5">
            <EventCard
              event={event}
              onViewDetails={(ev) => navigate(`/event/${ev.id}`)}
              showActions={false}
              aspectRatio="square"
            />
          </div>
        ))}

        {/* Target for infinite scrolling */}
        {hasNextPage && (
          <div ref={observerRef} className="flex-shrink-0 flex items-center justify-center w-24 snap-start">
            {isFetchingNextPage ? (
              <div className="flex flex-col items-center gap-2 text-[10px] text-slate-400 font-medium text-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                <span>Loading more...</span>
              </div>
            ) : (
              <div className="w-1" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
