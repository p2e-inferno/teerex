import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Loader2, ListChecks, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { PublishedEvent } from '@/types/event';
import {
  isPurchaseFormSchemaEmpty,
  PurchaseFormSchema,
  PurchaseFormFieldType,
} from '@/types/purchaseForm';

const FRIENDLY_TYPE_LABELS: Record<PurchaseFormFieldType, string> = {
  short_text: 'Short answer',
  long_text: 'Paragraph',
  select: 'Multiple choice',
  checkbox: 'Single choice',
  phone: 'Phone',
  url: 'Website link',
  number: 'Number',
};
import { PurchaseFormBuilder } from '@/components/create-event/PurchaseFormBuilder';

interface EventPurchaseFormSectionProps {
  event: PublishedEvent;
  isCreator: boolean;
  onEventUpdated: () => void;
}

export const EventPurchaseFormSection: React.FC<EventPurchaseFormSectionProps> = ({
  event,
  isCreator,
  onEventUpdated,
}) => {
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasTickets, setHasTickets] = useState(false);
  const [savedSchema, setSavedSchema] = useState<PurchaseFormSchema | null>(null);
  const [draftSchema, setDraftSchema] = useState<PurchaseFormSchema | null>(null);

  // Load schema + ticket count once.
  useEffect(() => {
    if (!isCreator || !event.id) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

        const [schemaResult, ticketResult] = await Promise.all([
          supabase.functions.invoke('manage-event-purchase-form', {
            body: { action: 'get', event_id: event.id },
            headers: {
              Authorization: `Bearer ${anonKey}`,
              'X-Privy-Authorization': `Bearer ${accessToken}`,
            },
          }),
          supabase
            .from('tickets_public')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', event.id),
        ]);

        if (cancelled) return;

        if (schemaResult.error || schemaResult.data?.error) {
          throw new Error(
            schemaResult.error?.message || schemaResult.data?.error || 'Failed to load form',
          );
        }
        const incoming = (schemaResult.data?.purchase_form_schema as PurchaseFormSchema | null) ?? null;
        setSavedSchema(incoming);
        setDraftSchema(incoming);
        setHasTickets((ticketResult.count ?? 0) > 0);
      } catch (err) {
        if (cancelled) return;
        toast({
          title: 'Could not load purchase form',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event.id, isCreator, getAccessToken, toast]);

  const persist = async (next: PurchaseFormSchema | null) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Authentication session expired. Please refresh and try again.');
    }
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const { data, error } = await supabase.functions.invoke('manage-event-purchase-form', {
      body: {
        action: 'upsert',
        event_id: event.id,
        purchase_form_schema: next,
      },
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'X-Privy-Authorization': `Bearer ${accessToken}`,
      },
    });
    if (error) throw new Error(error.message || 'Failed to save form');
    if (data?.error || data?.ok === false) throw new Error(data.error || 'Failed to save form');
    return (data?.purchase_form_schema as PurchaseFormSchema | null) ?? null;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await persist(draftSchema);
      setSavedSchema(saved);
      setDraftSchema(saved);
      setIsEditing(false);
      toast({
        title: 'Saved',
        description: isPurchaseFormSchemaEmpty(saved)
          ? 'Custom questions removed for new ticket buyers.'
          : 'New ticket buyers will see your updated questions.',
      });
      onEventUpdated();
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Could not save the form.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveAll = async () => {
    if (hasTickets) {
      toast({
        title: 'Can\'t remove the form',
        description: 'Tickets have already been sold for this event. Mark questions as optional instead.',
        variant: 'destructive',
      });
      return;
    }
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Remove all custom questions for this event? This cannot be undone.');
      if (!ok) return;
    }
    setIsSaving(true);
    try {
      await persist(null);
      setSavedSchema(null);
      setDraftSchema(null);
      setIsEditing(false);
      toast({ title: 'Custom questions removed' });
      onEventUpdated();
    } catch (err) {
      toast({
        title: 'Could not remove',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isCreator) return null;

  const hasSchema = !isPurchaseFormSchemaEmpty(savedSchema);

  return (
    <div className="rounded-xl border p-5 bg-white space-y-4">
      <div className="flex items-start gap-3">
        <div className="bg-purple-100 p-2.5 rounded-xl flex-shrink-0">
          <ListChecks className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1 space-y-1">
          <h3 className="font-semibold text-base text-gray-900">Extra questions at purchase</h3>
          <p className="text-sm text-muted-foreground">
            Optional questions you ask each ticket buyer (besides their email).
            {hasTickets && (
              <>
                {' '}Tickets have already been sold, so existing questions can only be made optional or
                have their wording changed — they can&apos;t be deleted, retyped, or made required.
              </>
            )}
          </p>
        </div>
      </div>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : !isEditing ? (
          <div className="space-y-3">
            {hasSchema ? (
              <ul className="rounded-xl border border-gray-100 bg-white p-3 text-sm text-gray-700 space-y-2">
                {savedSchema!.fields.map((f, i) => (
                  <li key={f.id} className="flex justify-between gap-3">
                    <span>
                      {i + 1}. {f.label}
                      {f.required && <span className="text-red-500"> *</span>}
                    </span>
                    <span className="text-xs text-gray-500">
                      {FRIENDLY_TYPE_LABELS[f.type] ?? f.type}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-md border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
                You haven&apos;t added any extra questions. Add some to collect more info from ticket buyers.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setIsEditing(true)} size="sm" variant="outline">
                <Pencil className="w-4 h-4 mr-2" />
                {hasSchema ? 'Edit questions' : 'Add questions'}
              </Button>
              {hasSchema && !hasTickets && (
                <Button
                  onClick={handleRemoveAll}
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Remove all
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <PurchaseFormBuilder
              schema={draftSchema}
              onChange={setDraftSchema}
              isPublishedEvent={true}
              hasTickets={hasTickets}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} size="sm" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
              <Button
                onClick={() => {
                  setDraftSchema(savedSchema);
                  setIsEditing(false);
                }}
                size="sm"
                variant="outline"
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
    </div>
  );
};
