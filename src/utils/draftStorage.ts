
import { EventDraft } from '@/types/event';
import { EventFormData } from '@/pages/CreateEvent';

const DRAFTS_KEY = 'event_drafts';

export const saveDraft = (formData: EventFormData): string => {
  const drafts = getDrafts();
  const id = Date.now().toString();
  const draft: EventDraft = {
    id,
    ...formData,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  drafts.push(draft);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  return id;
};

export const updateDraft = (id: string, formData: EventFormData): void => {
  const drafts = getDrafts();
  const index = drafts.findIndex(d => d.id === id);
  
  if (index !== -1) {
    drafts[index] = {
      ...drafts[index],
      ...formData,
      updatedAt: new Date()
    };
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  }
};

export const getDrafts = (): EventDraft[] => {
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

export const getDraft = (id: string): EventDraft | null => {
  const drafts = getDrafts();
  return drafts.find(d => d.id === id) || null;
};

export const deleteDraft = (id: string): void => {
  const drafts = getDrafts();
  const filtered = drafts.filter(d => d.id !== id);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
};
