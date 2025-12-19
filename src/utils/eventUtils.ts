
import { supabase } from '@/integrations/supabase/client';
import { EventFormData } from '@/pages/CreateEvent';
import { checkKeyOwnership } from './lockUtils';
import { createEventHash } from './eventIdempotency';
import { mapEventRow, MappedEvent } from '@/lib/events/eventMapping';
import type { PublishedEvent } from '@/types/event';

export const savePublishedEvent = async (
  formData: EventFormData,
  lockAddress: string,
  transactionHash: string,
  creatorId: string,
  serviceManagerAdded: boolean = false
): Promise<PublishedEvent> => {
  try {
    // Map payment method to persisted fields
    const isCrypto = formData.paymentMethod === 'crypto';
    const isFiat = formData.paymentMethod === 'fiat';

    // Require Paystack public key for fiat
    let paystackPublicKey: string | null = null;
    if (isFiat) {
      const pk = (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
      if (!pk) {
        throw new Error('PAYSTACK public key is not configured. Please set VITE_PAYSTACK_PUBLIC_KEY.');
      }
      paystackPublicKey = pk;
    }

    // Generate idempotency hash from event properties
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

    // Check if event with this hash already exists
    const { data: existingEvent, error: checkError } = await supabase
      .from('events')
      .select('*')
      .eq('creator_id', creatorId)
      .eq('idempotency_hash', idempotencyHash)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error checking for existing event:', checkError);
      throw checkError;
    }

    if (existingEvent) {
      console.log('Duplicate event detected:', idempotencyHash, 'Event ID:', existingEvent.id);

      // Throw custom error that frontend can catch and handle gracefully
      const error = new Error('DUPLICATE_EVENT') as any;
      error.eventId = existingEvent.id;
      error.eventTitle = existingEvent.title;
      error.lockAddress = existingEvent.lock_address;
      throw error;
    }

    // Prepare event data with hash
    const eventData = {
      creator_id: creatorId,
      title: formData.title,
      description: formData.description,
      date: formData.date?.toISOString(),
      end_date: formData.endDate?.toISOString() || null,
      time: formData.time,
      location: formData.location,
      event_type: formData.eventType,
      capacity: formData.capacity,
      // For crypto use the crypto price; otherwise 0
      price: isCrypto ? formData.price : 0,
      // Currency is crypto currency for crypto, or FREE for fiat/free
      currency: isCrypto ? formData.currency : 'FREE',
      // NGN price only for fiat
      ngn_price: isFiat ? formData.ngnPrice : 0,
      // Persist single selected method in array for compatibility
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
      idempotency_hash: idempotencyHash, // Add the hash
      // Ticket duration settings
      ticket_duration: formData.ticketDuration || 'event',
      custom_duration_days: formData.customDurationDays,
      // Visibility and access control
      is_public: formData.isPublic,
      allow_waitlist: formData.allowWaitlist,
      has_allow_list: formData.hasAllowList,
      // Transferability setting
      transferable: formData.transferable ?? false,
      // NFT metadata tracking
      nft_metadata_set: true, // Metadata is set during deployment
      nft_base_uri: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nft-metadata/${lockAddress}/`,
    };

    const { data, error } = await supabase
      .from('events')
      .insert(eventData)
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation gracefully (race condition)
      if (error.code === '23505' && error.message.includes('events_creator_idempotency_unique')) {
        console.log('Race condition detected during event creation, fetching existing event');
        // Another request created the same event between our check and insert
        // Fetch and return that event
        const { data: raceEvent } = await supabase
          .from('events')
          .select('*')
          .eq('creator_id', creatorId)
          .eq('idempotency_hash', idempotencyHash)
          .single();

        if (raceEvent) {
          console.log('Duplicate detected in race condition:', raceEvent.id);

          // Throw custom error for duplicate event
          const error = new Error('DUPLICATE_EVENT') as any;
          error.eventId = raceEvent.id;
          error.eventTitle = raceEvent.title;
          error.lockAddress = raceEvent.lock_address;
          throw error;
        }
      }
      console.error('Error saving published event:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Failed to retrieve created event data');
    }

    console.log('Event successfully saved to database:', data.id);

    // Map the database response to PublishedEvent type
    return {
      ...data,
      date: data.date ? new Date(data.date) : null,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
      currency: data.currency as 'ETH' | 'USDC' | 'FREE',
      ngn_price: data.ngn_price || 0,
      payment_methods: data.payment_methods || [formData.paymentMethod],
      paystack_public_key: data.paystack_public_key
    } as PublishedEvent;
  } catch (error) {
    console.error('Error saving published event:', error);
    throw error;
  }
};

export const getPublishedEvents = async (): Promise<MappedEvent[]> => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching published events:', error);
      return [];
    }

    return (data || []).map(mapEventRow);
  } catch (error) {
    console.error('Error fetching published events:', error);
    return [];
  }
};

export const getPublicEvents = async (): Promise<MappedEvent[]> => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching public events:', error);
      return [];
    }

    return (data || []).map(mapEventRow);
  } catch (error) {
    console.error('Error fetching public events:', error);
    return [];
  }
};

/**
 * Fetches an event by its lock address (case-insensitive)
 * This enables Web3-native URLs like /event/0x1234...abcd
 */
export const getPublishedEventByLockAddress = async (
  lockAddress: string
): Promise<MappedEvent | null> => {
  try {
    const normalizedAddress = lockAddress.toLowerCase();

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .ilike('lock_address', normalizedAddress)
      .maybeSingle();

    if (error || !data) {
      console.error('Error fetching event by lock address:', error);
      return null;
    }

    return mapEventRow(data);
  } catch (error) {
    console.error('Error fetching event by lock address:', error);
    return null;
  }
};

/**
 * Fetches an event by ID (supports both UUID and lock address formats)
 * - If id matches Ethereum address format (0x + 40 hex chars), lookup by lock_address
 * - Otherwise, lookup by UUID
 * This provides backwards compatibility while enabling Web3-native URLs
 */
export const getPublishedEventById = async (id: string): Promise<MappedEvent | null> => {
  try {
    // Check if id is an Ethereum address (0x + 40 hex chars)
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(id);

    if (isAddress) {
      // Use lock_address lookup
      return await getPublishedEventByLockAddress(id);
    }

    // Otherwise, treat as UUID
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('Error fetching event by id:', error);
      return null;
    }

    return mapEventRow(data);
  } catch (error) {
    console.error('Error fetching event by id:', error);
    return null;
  }
};

export const getUserEvents = async (userId: string): Promise<PublishedEvent[]> => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user events:', error);
      return [];
    }

    return (data || []).map((event: any) => ({
      ...event,
      date: event.date ? new Date(event.date) : null,
      end_date: event.end_date ? new Date(event.end_date) : null,
      created_at: new Date(event.created_at),
      updated_at: new Date(event.updated_at),
      currency: event.currency as 'ETH' | 'USDC' | 'FREE',
      ngn_price: event.ngn_price || 0,
      payment_methods: event.payment_methods || ['crypto'],
      paystack_public_key: event.paystack_public_key
    }));
  } catch (error) {
    console.error('Error fetching user events:', error);
    return [];
  }
};

/**
 * Fetches all published events and filters them to return only those
 * for which the user owns a valid ticket (key).
 */
export const getEventsWithUserTickets = async (userAddress: string): Promise<PublishedEvent[]> => {
  try {
    const allEvents = await getPublishedEvents();
    if (!userAddress || allEvents.length === 0) {
      return [];
    }
    
    // This is not the most performant way for a large number of events,
    // as it makes one RPC call per event. A better solution for production
    // would be to use the Unlock Subgraph to query all keys for a user in one go.
    const ownershipChecks = await Promise.all(
      allEvents.map(event => checkKeyOwnership(event.lock_address, userAddress, event.chain_id))
    );

    const userEvents = allEvents.filter((_, index) => ownershipChecks[index]);
    return userEvents;

  } catch (error) {
    console.error('Error fetching user ticketed events:', error);
    return [];
  }
};
