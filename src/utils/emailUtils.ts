const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize and validate an email.
 * Returns lowercased, trimmed email or null if invalid/empty.
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  return EMAIL_REGEX.test(lowered) ? lowered : null;
}
