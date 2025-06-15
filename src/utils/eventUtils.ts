
import { supabase } from '@/integrations/supabase/client';
import { EventFormData } from '@/pages/CreateEvent';

export interface PublishedEvent {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  date: Date | null;
  time: string;
  location: string;
  capacity: number;
  price: number;
  currency: 'ETH' | 'USDC' | 'FREE';
  category: string;
  image_url: string | null;
  lock_address: string;
  transaction_hash: string;
  created_at: Date;
  updated_at: Date;
}

export const savePublishedEvent = async (
  formData: EventFormData, 
  lockAddress: string, 
  transactionHash: string, 
  creatorId: string
): Promise<void> => {
  try {
    const eventData = {
      creator_id: creatorId,
      title: formData.title,
      description: formData.description,
      date: formData.date?.toISOString(),
      time: formData.time,
      location: formData.location,
      capacity: formData.capacity,
      price: formData.price,
      currency: formData.currency,
      category: formData.category,
      image_url: formData.imageUrl || null,
      lock_address: lockAddress,
      transaction_hash: transactionHash
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
      currency: event.currency as 'ETH' | 'USDC' | 'FREE'
    }));
  } catch (error) {
    console.error('Error fetching published events:', error);
    return [];
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
      currency: event.currency as 'ETH' | 'USDC' | 'FREE'
    }));
  } catch (error) {
    console.error('Error fetching user events:', error);
    return [];
  }
};
