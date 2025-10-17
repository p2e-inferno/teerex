import { z } from 'zod';

// Minimal create/update schema for Event core fields
// Keep intentionally small and easy to extend later.
export const EventCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  date: z.date({ required_error: 'Date is required' }),
  // Basic 24h HH:MM format to avoid over‑engineering
  time: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/i, 'Time is required (HH:MM)'),
});

export type EventCreateInput = z.infer<typeof EventCreateSchema>;
