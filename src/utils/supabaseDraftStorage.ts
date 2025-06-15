import { supabase } from '@/integrations/supabase/client';
import { EventDraft, PublishedEvent } from '@/types/event';
import { EventFormData } from '@/pages/CreateEvent';

export const uploadEventImage = async (file: File, userId: string): Promise<string | null> => {
  try {
    console.log('Starting image upload for user:', userId);
    console.log('File details:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    console.log('Uploading file to path:', fileName);

    // Use the public storage upload since we have public policies
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('event-images')
      .upload(fileName, file, {
        upsert: false,
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('Error uploading image:', uploadError);
      return null;
    }

    console.log('Upload successful:', uploadData);

    const { data } = supabase.storage
      .from('event-images')
      .getPublicUrl(fileName);

    console.log('Public URL generated:', data.publicUrl);
    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
  }
};

export const saveDraft = async (formData: EventFormData, userId: string): Promise<string | null> => {
  try {
    if (!userId) {
      throw new Error('User ID is required to save draft');
    }

    const draftData = {
      user_id: userId, // This will now be a Privy DID string
      title: formData.title,
      description: formData.description,
      date: formData.date?.toISOString(),
      time: formData.time,
      location: formData.location,
      capacity: formData.capacity,
      price: formData.price,
      currency: formData.currency,
      category: formData.category,
      image_url: formData.imageUrl || null
    };

    const { data, error } = await supabase
      .from('event_drafts')
      .insert(draftData)
      .select()
      .single();

    if (error) {
      console.error('Error saving draft:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Error saving draft:', error);
    return null;
  }
};

export const updateDraft = async (id: string, formData: EventFormData, userId: string): Promise<void> => {
  try {
    if (!userId) {
      throw new Error('User ID is required to update draft');
    }

    const draftData = {
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
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('event_drafts')
      .update(draftData)
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating draft:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error updating draft:', error);
    throw error;
  }
};

export const getDrafts = async (userId: string): Promise<EventDraft[]> => {
  try {
    if (!userId) {
      return [];
    }

    const { data, error } = await supabase
      .from('event_drafts')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching drafts:', error);
      return [];
    }

    return data.map((draft: any) => ({
      ...draft,
      date: draft.date ? new Date(draft.date) : null,
      created_at: new Date(draft.created_at),
      updated_at: new Date(draft.updated_at),
      currency: draft.currency as 'ETH' | 'USDC' | 'FREE',
      image_url: draft.image_url
    }));
  } catch (error) {
    console.error('Error fetching drafts:', error);
    return [];
  }
};

export const getDraft = async (id: string, userId: string): Promise<EventDraft | null> => {
  try {
    if (!userId) {
      return null;
    }

    const { data, error } = await supabase
      .from('event_drafts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching draft:', error);
      return null;
    }

    return {
      ...data,
      date: data.date ? new Date(data.date) : null,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
      currency: data.currency as 'ETH' | 'USDC' | 'FREE',
      image_url: data.image_url
    };
  } catch (error) {
    console.error('Error fetching draft:', error);
    return null;
  }
};

export const getPublishedEvent = async (id: string, userId: string): Promise<PublishedEvent | null> => {
  try {
    if (!userId) {
      return null;
    }

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .eq('creator_id', userId)
      .single();

    if (error) {
      console.error('Error fetching published event:', error);
      return null;
    }

    return {
      ...data,
      user_id: data.creator_id,
      date: data.date ? new Date(data.date) : null,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at),
      currency: data.currency as 'ETH' | 'USDC' | 'FREE',
      image_url: data.image_url,
      isPublished: true,
      lockAddress: data.lock_address,
      transactionHash: data.transaction_hash,
    };
  } catch (error) {
    console.error('Error fetching published event:', error);
    return null;
  }
};

export const updatePublishedEvent = async (id: string, formData: EventFormData, userId:string): Promise<void> => {
  try {
    if (!userId) {
      throw new Error('User ID is required to update event');
    }

    // Defensive check to prevent saving temporary blob URLs
    if (formData.imageUrl && formData.imageUrl.startsWith('blob:')) {
      console.error('Attempted to save a blob URL to the database:', formData.imageUrl);
      throw new Error('Image is still uploading. Please wait a moment and try again.');
    }

    const eventData = {
      title: formData.title,
      description: formData.description,
      date: formData.date?.toISOString(),
      time: formData.time,
      location: formData.location,
      category: formData.category,
      image_url: formData.imageUrl || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('events')
      .update(eventData)
      .eq('id', id)
      .eq('creator_id', userId);

    if (error) {
      console.error('Error updating published event:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error updating published event:', error);
    throw error;
  }
}

export const deleteDraft = async (id: string, userId: string): Promise<void> => {
  try {
    if (!userId) {
      throw new Error('User ID is required to delete draft');
    }

    // NOTE: We are no longer deleting images from storage when a draft is deleted.
    // This is to prevent deleting images that are also being used by published events.
    // A more robust solution might involve checking for image references before deletion,
    // but for now, this prevents broken image links on published events.

    // Delete the draft from the database
    const { error } = await supabase
      .from('event_drafts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting draft:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting draft:', error);
    throw error;
  }
};
