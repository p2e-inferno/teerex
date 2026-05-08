import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquareText, Pencil, Trash2 } from 'lucide-react';
import { RichTextDisplay } from '@/components/ui/rich-text/RichTextDisplay';
import { RichTextEditor } from '@/components/ui/rich-text/RichTextEditor';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { isEmptyHtml } from '@/utils/textUtils';
import { normalizePurchaseMessage, PURCHASE_MESSAGE_MAX_LENGTH } from '@/utils/purchaseMessage';
import type { PublishedEvent } from '@/types/event';

interface EventPurchaseMessageSectionProps {
  event: PublishedEvent;
  isCreator: boolean;
  onEventUpdated: () => void;
}

export const EventPurchaseMessageSection: React.FC<EventPurchaseMessageSectionProps> = ({
  event,
  isCreator,
  onEventUpdated,
}) => {
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [draftValue, setDraftValue] = useState<string>('');
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isCreator || !event.id) return;

    let cancelled = false;
    const loadMessage = async () => {
      setIsLoading(true);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const { data, error } = await supabase.functions.invoke('manage-event-purchase-message', {
          body: {
            action: 'get',
            event_id: event.id,
          },
          headers: {
            Authorization: `Bearer ${anonKey}`,
            'X-Privy-Authorization': `Bearer ${accessToken}`,
          },
        });
        if (error) throw new Error(error.message || 'Failed to load purchase message');
        if (data?.error) throw new Error(data.error);
        if (!cancelled) {
          const message = data?.purchase_confirmation_message ?? null;
          setLocalMessage(message);
          setDraftValue(message ?? '');
        }
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'Could not load purchase message',
            description: err instanceof Error ? err.message : 'Please try again.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadMessage();
    return () => {
      cancelled = true;
    };
  }, [event.id, getAccessToken, isCreator, toast]);

  const beginEditing = () => {
    setDraftValue(localMessage ?? '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setDraftValue(localMessage ?? '');
  };

  const persist = async (nextMessage: string | null) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Authentication session expired. Please refresh and try again.');
    }
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const { data, error } = await supabase.functions.invoke('manage-event-purchase-message', {
      body: {
        action: nextMessage ? 'upsert' : 'delete',
        event_id: event.id,
        purchase_confirmation_message: nextMessage,
      },
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'X-Privy-Authorization': `Bearer ${accessToken}`,
      },
    });
    if (error) throw new Error(error.message || 'Failed to update purchase message');
    if (data?.error) throw new Error(data.error);
    return data?.purchase_confirmation_message ?? null;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let nextMessage: string | null = null;
      try {
        nextMessage = normalizePurchaseMessage(draftValue);
      } catch (err) {
        toast({
          title: 'Message too long',
          description: err instanceof Error ? err.message : 'Please shorten your message.',
          variant: 'destructive',
        });
        return;
      }

      // Optimistic local update
      const previous = localMessage;
      setLocalMessage(nextMessage);

      try {
        const savedMessage = await persist(nextMessage);
        setLocalMessage(savedMessage);
        setIsEditing(false);
        toast({
          title: nextMessage ? 'Purchase message saved' : 'Purchase message removed',
          description: nextMessage
            ? 'New attendees will receive the updated message.'
            : 'The custom message has been removed for new attendees.',
        });
        onEventUpdated();
      } catch (err) {
        setLocalMessage(previous);
        toast({
          title: 'Save failed',
          description: err instanceof Error ? err.message : 'Could not update the purchase message.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Remove the purchase confirmation message for new attendees? Existing ticket holders keep the message they received.'
      );
      if (!confirmed) return;
    }
    setIsRemoving(true);
    const previous = localMessage;
    setLocalMessage(null);
    try {
      await persist(null);
      setDraftValue('');
      setIsEditing(false);
      toast({
        title: 'Purchase message removed',
        description: 'New attendees will no longer see a custom message.',
      });
      onEventUpdated();
    } catch (err) {
      setLocalMessage(previous);
      toast({
        title: 'Remove failed',
        description: err instanceof Error ? err.message : 'Could not remove the purchase message.',
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const hasMessage = Boolean(localMessage && !isEmptyHtml(localMessage));

  return (
    <div className="rounded-xl border p-5 bg-white space-y-4">
      <div className="flex items-start gap-3">
        <div className="bg-purple-100 p-2.5 rounded-xl flex-shrink-0">
          <MessageSquareText className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1 space-y-1">
          <h3 className="font-semibold text-base text-gray-900">Purchase Message</h3>
          <p className="text-sm text-muted-foreground">
            {isCreator
              ? 'Updates apply only to future ticket purchases. Existing ticket holders keep the message they received when they purchased.'
              : 'Only the event creator can edit this message.'}
          </p>
        </div>
      </div>

        {!isEditing && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading message...
              </div>
            ) : hasMessage ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                <RichTextDisplay
                  content={localMessage as string}
                  className="prose prose-sm max-w-none leading-relaxed"
                />
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
                No purchase message set. Add one to greet attendees right after they get a ticket.
              </div>
            )}

            {isCreator && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={beginEditing} size="sm" variant="outline">
                  <Pencil className="w-4 h-4 mr-2" />
                  {hasMessage ? 'Edit message' : 'Add message'}
                </Button>
                {hasMessage && (
                  <Button
                    onClick={handleRemove}
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={isRemoving}
                  >
                    {isRemoving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Remove
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {isEditing && isCreator && (
          <div className="space-y-3">
            <RichTextEditor
              value={draftValue}
              onChange={setDraftValue}
              placeholder="e.g. Doors open at 6pm. Bring your ID. Join our community at..."
            />
            <p className="text-xs text-gray-500">
              Up to {PURCHASE_MESSAGE_MAX_LENGTH.toLocaleString()} characters of HTML. Avoid posting personal access codes — every attendee receives the same message.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} size="sm" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save message
              </Button>
              <Button onClick={cancelEditing} size="sm" variant="outline" disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
    </div>
  );
};
