import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { PublishedEvent } from '@/types/event';
import { Loader2, Mail, Users, Filter, Link as LinkIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useMyEventsList } from '@/hooks/useMyEventsList';
import { useEventWaitlist, WaitlistFilter, WaitlistEntry } from '@/hooks/useEventWaitlist';
import { usePrivy } from '@privy-io/react-auth';

interface WaitlistManagerProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export const WaitlistManager: React.FC<WaitlistManagerProps> = ({ event, isOpen, onClose }) => {
  const { toast } = useToast();
  const { getAccessToken } = usePrivy();
  const [filter, setFilter] = useState<WaitlistFilter>('all');
  const [targetEventId, setTargetEventId] = useState<string>('');
  const [targetUrl, setTargetUrl] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const { events: myEvents } = useMyEventsList();
  const {
    entries: waitlist,
    loading: waitlistLoading,
    counts,
    refresh: refreshWaitlist,
    hasMore,
    loadMore,
  } = useEventWaitlist(event?.id || null, filter);

  useEffect(() => {
    if (isOpen && event) {
      refreshWaitlist();
      // Default target URL if not set
      if (!targetUrl) {
        const origin = window.location?.origin || 'https://teerex.live';
        setTargetUrl(`${origin}/event/${event.lock_address}`);
      }
    }
  }, [isOpen, event, refreshWaitlist, targetUrl]);

  const selectedTarget = useMemo(
    () => myEvents.find((e) => e.id === targetEventId),
    [myEvents, targetEventId]
  );

  useEffect(() => {
    if (selectedTarget) {
      const origin = window.location?.origin || 'https://teerex.live';
      setTargetUrl(`${origin}/event/${selectedTarget.lock_address}`);
    }
  }, [selectedTarget]);

  const notifyWaitlist = async () => {
    if (!event) return;
    if (!selectedTarget && !targetUrl) {
      toast({
        title: 'Target event required',
        description: 'Select a target event or provide a target URL.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      let page = 1;
      let totalNotified = 0;
      let totalFailed = 0;
      let hasMore = false;

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Authentication required to notify waitlist');
      }

      do {
        const { data, error } = await supabase.functions.invoke('notify-waitlist', {
          body: {
            event_id: event.id,
            page,
            event_url: targetUrl,
            target_title: selectedTarget?.title,
            target_date: selectedTarget?.starts_at,
          },
          headers: {
            ...(accessToken ? { 'X-Privy-Authorization': `Bearer ${accessToken}` } : {}),
          },
        });

        if (error) throw error;
        if (!data?.ok) {
          throw new Error(data?.error || 'Failed to notify waitlist');
        }

        totalNotified += data.notified || 0;
        totalFailed += data.failed || 0;
        hasMore = !!data.has_more;
        page = data.next_page || page + 1;
      } while (hasMore);

      toast({
        title: 'Notifications sent',
        description: `Notified ${totalNotified}. Failed ${totalFailed}.`,
        variant: totalFailed > 0 ? 'destructive' : 'default',
      });

      refreshWaitlist();
    } catch (err: any) {
      console.error('Error notifying waitlist:', err);
      toast({
        title: 'Notify failed',
        description: err?.message || 'Could not send notifications',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Event Waitlist</DialogTitle>
          <DialogDescription>
            People waiting for tickets to become available for {event.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Waitlist Count Summary */}
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <Users className="w-5 h-5 text-purple-600" />
              <div>
                <p className="font-semibold text-lg">{counts.total} {counts.total === 1 ? 'person' : 'people'} waiting</p>
                <p className="text-sm text-muted-foreground">
                  {counts.total === 0 ? 'No one on the waitlist yet' : 'Ready to be notified when tickets are available'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Target Event Selection */}
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="font-semibold text-sm">Target event</p>
                  <p className="text-xs text-muted-foreground">Select where to send people for tickets</p>
                </div>
              </div>

              <Select value={targetEventId} onValueChange={setTargetEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select one of your events" />
                </SelectTrigger>
                <SelectContent>
                  {myEvents.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.title} — {new Date(ev.starts_at || ev.date || ev.created_at).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Target event URL</p>
                <Input
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://app.tld/event/0x..."
                />
              </div>

              {selectedTarget && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Title: {selectedTarget.title}</div>
                  <div>Date: {selectedTarget.starts_at ? new Date(selectedTarget.starts_at).toLocaleString() : 'TBA'}</div>
                  <div>Lock: {selectedTarget.lock_address}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Waitlist Entries */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">Waitlist Entries</h3>
              <div className="flex items-center gap-2">
                <Select value={filter} onValueChange={(val) => setFilter(val as WaitlistFilter)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all"><Filter className="w-3 h-3 mr-1 inline" />All</SelectItem>
                    <SelectItem value="unnotified">Unnotified</SelectItem>
                    <SelectItem value="notified">Notified</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshWaitlist}
                  disabled={waitlistLoading}
                >
                  Refresh
                </Button>
              </div>
            </div>

            {waitlistLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : waitlist.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No one on the waitlist yet
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {waitlist.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="py-3">
                      <div className="flex items-start gap-3">
                        <Mail className="w-4 h-4 text-gray-400 mt-1" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium break-all">
                            {entry.user_email}
                          </p>
                          {entry.wallet_address && (
                            <p className="text-xs text-muted-foreground font-mono break-all mt-1">
                              {entry.wallet_address}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Joined {new Date(entry.created_at).toLocaleDateString()}
                          </p>
                          <div className="mt-1">
                            {entry.notified ? (
                              <Badge variant="secondary" className="gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Notified {entry.notified_at ? new Date(entry.notified_at).toLocaleDateString() : ''}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <AlertCircle className="w-3 h-3" /> Pending
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {hasMore && (
                  <div className="flex justify-center py-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMore}
                      disabled={waitlistLoading}
                    >
                      {waitlistLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {waitlistLoading ? 'Loading...' : 'Load more'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Info box */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="py-3 text-sm text-blue-900 space-y-1">
              <p className="font-medium">Notify waitlist</p>
              <p className="text-xs text-blue-900">
                Select the target event or paste a URL, then notify in batches. Pending entries stay pending on failure and can be retried.
              </p>
              <div className="text-xs text-blue-900">
                Unnotified: {counts.unnotified} · Notified: {counts.notified} · Total: {counts.total}
              </div>
              <Button
                className="mt-2"
                disabled={isSending || counts.unnotified === 0 || !targetUrl}
                onClick={notifyWaitlist}
              >
                {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isSending ? 'Notifying...' : 'Notify waitlist'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
