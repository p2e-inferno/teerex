/* deno-lint-ignore-file no-explicit-any */
export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const SERVICE_PK = Deno.env.get('UNLOCK_SERVICE_PRIVATE_KEY')!;

export const RATE_LIMITS = {
  DEPLOY: 15,
  PURCHASE: 20,
} as const;

// Simple email validation regex
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
