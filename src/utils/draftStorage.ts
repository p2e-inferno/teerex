import { EventDraft } from '@/types/event';
import { EventFormData } from '@/pages/CreateEvent';

const DRAFTS_KEY = 'event_drafts';

export const saveDraftLocally = (formData: EventFormData): string => {
  const drafts = getDraftsLocally();
  const id = Date.now().toString();
  const draft: EventDraft = {
    id,
    user_id: '', // This would need to be set properly for local storage
    title: formData.title,
    description: formData.description,
    date: formData.date,
    time: formData.time,
    location: formData.location,
    capacity: formData.capacity,
    price: formData.price,
    currency: formData.currency,
    ngn_price: formData.ngnPrice,
    payment_methods: formData.paymentMethods,
    paystack_public_key: formData.paystackPublicKey,
    category: formData.category,
    image_url: formData.imageUrl || null,
    created_at: new Date(),
    updated_at: new Date()
  };
  
  drafts.push(draft);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  return id;
};

export const updateDraftLocally = (id: string, formData: EventFormData): void => {
  const drafts = getDraftsLocally();
  const index = drafts.findIndex(draft => draft.id === id);
  
  if (index !== -1) {
    drafts[index] = {
      ...drafts[index],
      title: formData.title,
      description: formData.description,
      date: formData.date,
      time: formData.time,
      location: formData.location,
      capacity: formData.capacity,
      price: formData.price,
      currency: formData.currency,
      ngn_price: formData.ngnPrice,
      payment_methods: formData.paymentMethods,
      paystack_public_key: formData.paystackPublicKey,
      category: formData.category,
      image_url: formData.imageUrl || null,
      updated_at: new Date()
    };
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  }
};

export const getDraftsLocally = (): EventDraft[] => {
  const stored = localStorage.getItem(DRAFTS_KEY);
  if (!stored) return [];
  
  try {
    const drafts = JSON.parse(stored);
    return drafts.map((draft: any) => ({
      ...draft,
      date: draft.date ? new Date(draft.date) : null,
      createdAt: new Date(draft.createdAt),
      updatedAt: new Date(draft.updatedAt)
    }));
  } catch {
    return [];
  }
};

export const getDraftLocally = (id: string): EventDraft | null => {
  const drafts = getDraftsLocally();
  return drafts.find(d => d.id === id) || null;
};

export const deleteDraftLocally = (id: string): void => {
  const drafts = getDraftsLocally();
  const filtered = drafts.filter(d => d.id !== id);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
};
