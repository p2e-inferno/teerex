import { EventDraft } from '@/types/event';
import { EventFormData } from '@/pages/CreateEvent';

const DRAFTS_KEY = 'event_drafts';

export const saveDraftLocally = (formData: EventFormData): string => {
  const drafts = getDraftsLocally();
  const id = Date.now().toString();
  const isCrypto = formData.paymentMethod === 'crypto';
  const isFiat = formData.paymentMethod === 'fiat';
  const draft: EventDraft = {
    id,
    user_id: '', // This would need to be set properly for local storage
    title: formData.title,
    description: formData.description,
    date: formData.date,
    time: formData.time,
    location: formData.location,
    capacity: formData.capacity,
    price: isCrypto ? formData.price : 0,
    currency: isCrypto ? formData.currency : 'FREE',
    ngn_price: isFiat ? formData.ngnPrice : 0,
    payment_methods: [formData.paymentMethod],
    paystack_public_key: null,
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
    const isCryptoU = formData.paymentMethod === 'crypto';
    const isFiatU = formData.paymentMethod === 'fiat';
    drafts[index] = {
      ...drafts[index],
      title: formData.title,
      description: formData.description,
      date: formData.date,
      time: formData.time,
      location: formData.location,
      capacity: formData.capacity,
      price: isCryptoU ? formData.price : 0,
      currency: isCryptoU ? formData.currency : 'FREE',
      ngn_price: isFiatU ? formData.ngnPrice : 0,
      payment_methods: [formData.paymentMethod],
      paystack_public_key: null,
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
