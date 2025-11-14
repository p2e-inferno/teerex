import React, { useState, useEffect } from 'react';
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
import { PublishedEvent } from '@/utils/eventUtils';
import { Loader2, Mail, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { useWaitlistCount } from '@/hooks/useWaitlistCount';

interface WaitlistManagerProps {
  event: PublishedEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

interface WaitlistEntry {
  id: string;
  user_email: string;
  wallet_address: string | null;
  created_at: string;
}

export const WaitlistManager: React.FC<WaitlistManagerProps> = ({ event, isOpen, onClose }) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const { count } = useWaitlistCount(event?.id || null);

  useEffect(() => {
    if (isOpen && event) {
      loadWaitlist();
    }
  }, [isOpen, event]);

  const loadWaitlist = async () => {
    if (!event) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('event_waitlist')
        .select('*')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWaitlist(data || []);
    } catch (error) {
      console.error('Error loading waitlist:', error);
      toast({
        title: 'Error',
        description: 'Failed to load waitlist',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
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
                <p className="font-semibold text-lg">{count} {count === 1 ? 'person' : 'people'} waiting</p>
                <p className="text-sm text-muted-foreground">
                  {count === 0 ? 'No one on the waitlist yet' : 'Ready to be notified when tickets are available'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Waitlist Entries */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Waitlist Entries</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadWaitlist}
                disabled={isLoading}
              >
                Refresh
              </Button>
            </div>

            {isLoading ? (
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
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Info box */}
          {count > 0 && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="py-3 text-sm text-blue-900">
                <p className="font-medium mb-1">💡 Next Steps</p>
                <p className="text-xs">
                  When tickets become available, you can manually notify these users via email.
                  Email notification feature coming soon!
                </p>
              </CardContent>
            </Card>
          )}
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
