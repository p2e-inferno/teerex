import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import MetaTags from '@/components/MetaTags';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { getPublishedEventById } from '@/utils/eventUtils';
import { EventDiscussionsPanel } from '@/components/interactions/core/EventDiscussionsPanel';

const EventDiscussions = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  type EventData = Awaited<ReturnType<typeof getPublishedEventById>>;
  const [event, setEvent] = useState<EventData>(null);
  const [isLoading, setIsLoading] = useState(true);

  const highlightPostId = useMemo(() => {
    const post = searchParams.get('post');
    return post && post.trim().length > 0 ? post : null;
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const data = await getPublishedEventById(id);
        if (!mounted) return;
        setEvent(data);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const eventIdentifier = event?.lock_address ? event.lock_address.toLowerCase() : event?.id;

  if (!id) {
    return null;
  }

  if (!isLoading && !event) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-semibold">Event Discussions</h1>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Event not found.</p>
            <Button variant="outline" onClick={() => navigate('/explore')}>
              Browse events
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <MetaTags
        title={event ? `${event.title} | Discussions` : 'Event Discussions'}
        description={event ? `Discussions for ${event.title}` : 'Event discussions'}
      />

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate(eventIdentifier ? `/event/${eventIdentifier}` : `/event/${id}`)}
            className="-ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {event && (
            <div className="text-right">
              <div className="text-sm font-semibold text-foreground truncate max-w-[220px] sm:max-w-[420px]">
                {event.title}
              </div>
              <div className="text-xs text-muted-foreground">Event Discussions</div>
            </div>
          )}
        </div>

        {event && (
          <EventDiscussionsPanel
            eventId={event.id}
            eventIdentifier={eventIdentifier || id}
            lockAddress={event.lock_address || ''}
            chainId={event.chain_id}
            creatorId={event.creator_id}
            highlightPostId={highlightPostId}
          />
        )}
      </div>
    </>
  );
};

export default EventDiscussions;
