
import { supabase } from '@/integrations/supabase/client';
import { EventFormData } from '@/pages/CreateEvent';
import { checkKeyOwnership } from './lockUtils';
import { baseSepolia } from 'wagmi/chains';

export interface PublishedEvent {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  date: Date | null;
  time: string;
  location: string;
  event_type: 'physical' | 'virtual';
  capacity: number;
  price: number;
  currency: 'ETH' | 'USDC' | 'FREE';
  ngn_price: number;
  payment_methods: string[];
  paystack_public_key: string | null;
  category: string;
  image_url: string | null;
  lock_address: string;
  transaction_hash: string;
  chain_id: number;
  created_at: Date;
  updated_at: Date;
  attestation_enabled: boolean;
  attendance_schema_uid: string | null;
  review_schema_uid: string | null;
  max_keys_per_address: number;
  transferable: boolean;
  requires_approval: boolean;
  service_manager_added: boolean;
}

export const savePublishedEvent = async (
  formData: EventFormData, 
  lockAddress: string, 
  transactionHash: string, 
  creatorId: string,
  serviceManagerAdded: boolean = false
): Promise<void> => {
  try {
    // Map payment method to persisted fields
    const isCrypto = formData.paymentMethod === 'crypto';
    const isFiat = formData.paymentMethod === 'fiat';
    const isFree = formData.paymentMethod === 'free';

    // Require Paystack public key for fiat
    let paystackPublicKey: string | null = null;
    if (isFiat) {
      const pk = (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
      if (!pk) {
        throw new Error('PAYSTACK public key is not configured. Please set VITE_PAYSTACK_PUBLIC_KEY.');
      }
      paystackPublicKey = pk;
    }

    const eventData = {
      creator_id: creatorId,
      title: formData.title,
      description: formData.description,
      date: formData.date?.toISOString(),
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
      lock_address: lockAddress,
      transaction_hash: transactionHash,
      chain_id: (formData as any).chainId,
      service_manager_added: serviceManagerAdded
    };

    const { error } = await supabase
      .from('events')
      .insert(eventData);

    if (error) {
      console.error('Error saving published event:', error);
      throw error;
    }

    console.log('Event successfully saved to database');
  } catch (error) {
    console.error('Error saving published event:', error);
    throw error;
  }
};

export const getPublishedEvents = async (): Promise<PublishedEvent[]> => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching published events:', error);
      return [];
    }

    return (data || []).map((event: any) => ({
      ...event,
      date: event.date ? new Date(event.date) : null,
      created_at: new Date(event.created_at),
      updated_at: new Date(event.updated_at),
      currency: event.currency as 'ETH' | 'USDC' | 'FREE',
      ngn_price: event.ngn_price || 0,
      payment_methods: event.payment_methods || ['crypto'],
      paystack_public_key: event.paystack_public_key
    }));
  } catch (error) {
    console.error('Error fetching published events:', error);
    return [];
  }
};

export const getPublishedEventById = async (id: string): Promise<PublishedEvent | null> => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('Error fetching event by id:', error);
      return null;
    }

    const event = data as any;
    return {
      ...event,
      date: event.date ? new Date(event.date) : null,
      created_at: new Date(event.created_at),
      updated_at: new Date(event.updated_at),
      currency: event.currency as 'ETH' | 'USDC' | 'FREE',
      ngn_price: event.ngn_price || 0,
      payment_methods: event.payment_methods || ['crypto'],
      paystack_public_key: event.paystack_public_key
    } as PublishedEvent;
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
