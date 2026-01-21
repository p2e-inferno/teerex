/**
 * Edge Function-based storage utilities for drafts and events.
 * Replaces direct database writes with secure edge function calls.
 * Uses service role on the server side to bypass RLS issues.
 */

import { supabase } from '@/integrations/supabase/client';
import { EventDraft, PublishedEvent } from '@/types/event';
import { EventFormData } from '@/pages/CreateEvent';

/**
 * Save a new draft using the manage-drafts edge function
 */
export const saveDraftViaEdge = async (
  formData: EventFormData,
  userId: string,
  privyToken: string
): Promise<string | null> => {
  try {
    if (!userId) {
      throw new Error('User ID is required to save draft');
    }

    const isCrypto = formData.paymentMethod === 'crypto';
    const isFiat = formData.paymentMethod === 'fiat';

    const payload = {
      action: 'CREATE',
      title: formData.title,
      description: formData.description,
      date: formData.date?.toISOString(),
      end_date: formData.endDate?.toISOString() || null,
      time: formData.time,
      location: formData.location,
      event_type: formData.eventType,
      capacity: formData.capacity,
      price: isCrypto ? formData.price : 0,
      currency: isCrypto ? formData.currency : 'FREE',
      ngn_price: isFiat ? formData.ngnPrice : 0,
      payment_methods: [formData.paymentMethod],
      category: formData.category,
      image_url: formData.imageUrl || null,
      image_crop_x: formData.imageCropX || null,
      image_crop_y: formData.imageCropY || null,
      ticket_duration: formData.ticketDuration || 'event',
      custom_duration_days: formData.customDurationDays,
      is_public: formData.isPublic,
      allow_waitlist: formData.allowWaitlist,
      has_allow_list: formData.hasAllowList,
      transferable: formData.transferable ?? false,
      chain_id: (formData as any).chainId
    };

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const { data, error } = await supabase.functions.invoke('manage-drafts', {
      body: payload,
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'X-Privy-Authorization': `Bearer ${privyToken}`,
      },
    });

    if (error) {
      console.error('Error saving draft via edge function:', error);
      return null;
    }

    if (!data || !data.id) {
      console.error('No draft ID returned from edge function');
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Error saving draft via edge function:', error);
    return null;
  }
};

/**
 * Update an existing draft using the manage-drafts edge function
 */
export const updateDraftViaEdge = async (
  id: string,
  formData: EventFormData,
  userId: string,
  privyToken: string
): Promise<void> => {
  try {
    if (!userId) {
      throw new Error('User ID is required to update draft');
    }

    const isCrypto = formData.paymentMethod === 'crypto';
    const isFiat = formData.paymentMethod === 'fiat';

    const payload = {
      action: 'UPDATE',
      draftId: id,
      title: formData.title,
      description: formData.description,
      date: formData.date?.toISOString(),
      end_date: formData.endDate?.toISOString() || null,
      time: formData.time,
      location: formData.location,
      event_type: formData.eventType,
      capacity: formData.capacity,
      price: isCrypto ? formData.price : 0,
      currency: isCrypto ? formData.currency : 'FREE',
      ngn_price: isFiat ? formData.ngnPrice : 0,
      payment_methods: [formData.paymentMethod],
      category: formData.category,
      image_url: formData.imageUrl || null,
      image_crop_x: formData.imageCropX || null,
      image_crop_y: formData.imageCropY || null,
      ticket_duration: formData.ticketDuration || 'event',
      custom_duration_days: formData.customDurationDays,
      is_public: formData.isPublic,
      allow_waitlist: formData.allowWaitlist,
      has_allow_list: formData.hasAllowList,
      transferable: formData.transferable ?? false,
      chain_id: (formData as any).chainId
    };

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const { error } = await supabase.functions.invoke('manage-drafts', {
      body: payload,
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'X-Privy-Authorization': `Bearer ${privyToken}`,
      },
    });

    if (error) {
      console.error('Error updating draft via edge function:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error updating draft via edge function:', error);
    throw error;
  }
};

/**
 * Get all drafts for a user using the manage-drafts edge function
 */
export const getDraftsViaEdge = async (
  userId: string,
  privyToken: string
): Promise<EventDraft[]> => {
  try {
    if (!userId) {
      return [];
    }

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const { data, error } = await supabase.functions.invoke('manage-drafts', {
      body: { action: 'LIST' },
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'X-Privy-Authorization': `Bearer ${privyToken}`,
      },
    });

    if (error) {
      console.error('Error fetching drafts via edge function:', error);
      return [];
    }

    if (!data || !data.drafts) {
      return [];
    }

    return data.drafts.map((draft: any) => ({
      ...draft,
      date: draft.date ? new Date(draft.date) : null,
      end_date: draft.end_date ? new Date(draft.end_date) : null,
      created_at: new Date(draft.created_at),
      updated_at: new Date(draft.updated_at),
      currency: draft.currency,
      ngn_price: draft.ngn_price || 0,
      ngn_price_kobo: draft.ngn_price_kobo ?? 0,
      payment_methods: draft.payment_methods || [],
      paystack_public_key: draft.paystack_public_key,
      image_url: draft.image_url,
      ticket_duration: draft.ticket_duration,
      custom_duration_days: draft.custom_duration_days,
      chain_id: draft.chain_id
    }));
  } catch (error) {
    console.error('Error fetching drafts via edge function:', error);
    return [];
  }
};

/**
 * Get a single draft using the manage-drafts edge function
 */
export const getDraftViaEdge = async (
  id: string,
  userId: string,
  privyToken: string
): Promise<EventDraft | null> => {
  try {
    if (!userId) {
      return null;
    }

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const { data, error } = await supabase.functions.invoke('manage-drafts', {
      body: { action: 'GET', draftId: id },
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'X-Privy-Authorization': `Bearer ${privyToken}`,
      },
    });

    if (error) {
      console.error('Error fetching draft via edge function:', error);
      return null;
    }

    if (!data || !data.draft) {
      return null;
    }

    const draft = data.draft;
    return {
      ...draft,
      date: draft.date ? new Date(draft.date) : null,
      end_date: draft.end_date ? new Date(draft.end_date) : null,
      created_at: new Date(draft.created_at),
      updated_at: new Date(draft.updated_at),
      currency: draft.currency,
      ngn_price: draft.ngn_price || 0,
      ngn_price_kobo: draft.ngn_price_kobo ?? 0,
      payment_methods: draft.payment_methods || [],
      paystack_public_key: draft.paystack_public_key,
      image_url: draft.image_url,
      image_crop_x: draft.image_crop_x || undefined,
      image_crop_y: draft.image_crop_y || undefined,
      ticket_duration: draft.ticket_duration || undefined,
      custom_duration_days: draft.custom_duration_days || undefined,
      chain_id: draft.chain_id
    };
  } catch (error) {
    console.error('Error fetching draft via edge function:', error);
    return null;
  }
};

/**
 * Delete a draft using the manage-drafts edge function
 */
export const deleteDraftViaEdge = async (
  id: string,
  userId: string,
  privyToken: string
): Promise<void> => {
  try {
    if (!userId) {
      throw new Error('User ID is required to delete draft');
    }

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const { error } = await supabase.functions.invoke('manage-drafts', {
      body: { action: 'DELETE', draftId: id },
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'X-Privy-Authorization': `Bearer ${privyToken}`,
      },
    });

    if (error) {
      console.error('Error deleting draft via edge function:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting draft via edge function:', error);
    throw error;
  }
};

/**
 * Save a published event using the create-event edge function
 */
export const savePublishedEventViaEdge = async (
  formData: EventFormData,
  lockAddress: string,
  transactionHash: string,
  creatorId: string,
  privyToken: string,
  serviceManagerAdded: boolean = false
): Promise<PublishedEvent> => {
  try {
    const isCrypto = formData.paymentMethod === 'crypto';
    const isFiat = formData.paymentMethod === 'fiat';

    // Pass Paystack public key if available (server can provide if client doesn't have it)
    let paystackPublicKey: string | null = null;
    if (isFiat) {
      const pk = (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
      paystackPublicKey = pk || null; // Server will use PAYSTACK_PUBLIC_KEY env if this is null
    }

    // Generate idempotency hash (client-side for consistency with edge function)
    const { createEventHash } = await import('./eventIdempotency');
    const idempotencyHash = await createEventHash({
      creator_id: creatorId,
      title: formData.title,
      date: formData.date?.toISOString() || null,
      time: formData.time,
      location: formData.location,
      capacity: formData.capacity,
      price: isCrypto ? formData.price : (isFiat ? formData.ngnPrice : 0),
      currency: isCrypto ? formData.currency : (isFiat ? 'NGN' : 'FREE'),
      paymentMethod: formData.paymentMethod,
    });

    const payload = {
      title: formData.title,
      description: formData.description,
      date: formData.date?.toISOString(),
      end_date: formData.endDate?.toISOString() || null,
      time: formData.time,
      location: formData.location,
      event_type: formData.eventType,
      capacity: formData.capacity,
      price: isCrypto ? formData.price : 0,
      currency: isCrypto ? formData.currency : 'FREE',
      ngn_price: isFiat ? formData.ngnPrice : 0,
      payment_methods: [formData.paymentMethod],
      paystack_public_key: paystackPublicKey,
      category: formData.category,
      image_url: formData.imageUrl || null,
      image_crop_x: formData.imageCropX || null,
      image_crop_y: formData.imageCropY || null,
      lock_address: lockAddress,
      transaction_hash: transactionHash,
      chain_id: (formData as any).chainId,
      service_manager_added: serviceManagerAdded,
      idempotency_hash: idempotencyHash,
      ticket_duration: formData.ticketDuration || 'event',
      custom_duration_days: formData.customDurationDays,
      is_public: formData.isPublic,
      allow_waitlist: formData.allowWaitlist,
      has_allow_list: formData.hasAllowList,
      transferable: formData.transferable ?? false,
      nft_metadata_set: true,
      nft_base_uri: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nft-metadata/${lockAddress}/`,
    };

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const { data, error } = await supabase.functions.invoke('create-event', {
      body: payload,
      headers: {
        Authorization: `Bearer ${anonKey}`,
        'X-Privy-Authorization': `Bearer ${privyToken}`,
      },
    });

    if (error) {
      console.error('Error saving published event via edge function:', error);
      throw error;
    }

    // Handle duplicate event response (409 status from edge function)
    if (data && data.error === 'DUPLICATE_EVENT') {
      console.log('Duplicate event detected:', data.event?.id);
      const duplicateError = new Error('DUPLICATE_EVENT') as any;
      duplicateError.eventId = data.event?.id;
      duplicateError.eventTitle = data.event?.title;
      duplicateError.lockAddress = data.event?.lock_address;
      throw duplicateError;
    }

    if (!data) {
      throw new Error('Failed to retrieve created event data from edge function');
    }

    console.log('Event successfully saved via edge function:', data.id);

    // Map the response to PublishedEvent type
    return {
      ...data,
      date: data.date ? new Date(data.date) : null,
      end_date: data.end_date ? new Date(data.end_date) : null,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
      currency: data.currency,
      ngn_price: data.ngn_price || 0,
      ngn_price_kobo: data.ngn_price_kobo || 0,
      payment_methods: data.payment_methods || [formData.paymentMethod],
      paystack_public_key: data.paystack_public_key
    } as PublishedEvent;
  } catch (error) {
    console.error('Error saving published event via edge function:', error);
    throw error;
  }
};
