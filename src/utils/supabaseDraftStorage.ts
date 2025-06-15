
import { supabase } from '@/integrations/supabase/client';
import { EventDraft } from '@/types/event';
import { EventFormData } from '@/pages/CreateEvent';

export const uploadEventImage = async (file: File, userId: string): Promise<string | null> => {
  try {
    // Check if we have any session (anonymous or authenticated)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session error:', sessionError);
      return null;
    }

    // If no session, try to create an anonymous one
    if (!session) {
      const { error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) {
        console.error('Error creating anonymous session:', anonError);
        return null;
      }
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    console.log('Uploading file to path:', fileName);
    console.log('File size:', file.size, 'bytes');
    console.log('File type:', file.type);

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

export const saveDraft = async (formData: EventFormData): Promise<string | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const draftData = {
      user_id: user.id,
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

export const updateDraft = async (id: string, formData: EventFormData): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
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
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating draft:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error updating draft:', error);
    throw error;
  }
};

export const getDrafts = async (): Promise<EventDraft[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from('event_drafts')
      .select('*')
      .eq('user_id', user.id)
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

export const getDraft = async (id: string): Promise<EventDraft | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('event_drafts')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
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

export const deleteDraft = async (id: string): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // First get the draft to check if it has an image
    const { data: draft } = await supabase
      .from('event_drafts')
      .select('image_url')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    // Delete the image from storage if it exists
    if (draft?.image_url) {
      const imagePath = draft.image_url.split('/').pop();
      if (imagePath) {
        await supabase.storage
          .from('event-images')
          .remove([`${user.id}/${imagePath}`]);
      }
    }

    // Delete the draft
    const { error } = await supabase
      .from('event_drafts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting draft:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting draft:', error);
    throw error;
  }
};
