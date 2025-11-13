/**
 * Event Idempotency Utilities
 *
 * Provides hash-based idempotency for event creation to prevent duplicate events.
 * The hash is generated from essential event properties that define uniqueness.
 */

/**
 * Creates a deterministic SHA-256 hash from event data for idempotency.
 *
 * The hash includes:
 * - creator_id: Ensures events are scoped per user
 * - title: Event name
 * - date: Event date (ISO string)
 * - time: Event time
 * - location: Event venue/link
 * - capacity: Maximum attendees
 * - price: Ticket price
 * - currency: Payment currency
 * - paymentMethod: Payment method (free/crypto/fiat)
 *
 * @param data Event properties to hash
 * @returns SHA-256 hash as hex string (64 characters)
 */
export async function createEventHash(data: {
  creator_id: string;
  title: string;
  date: string | null; // ISO string
  time: string;
  location: string;
  capacity: number;
  price: number;
  currency: string;
  paymentMethod: string;
}): Promise<string> {
  // Normalize data to ensure consistency
  const normalized = {
    creator_id: data.creator_id.trim().toLowerCase(),
    title: data.title.trim().toLowerCase(),
    date: data.date || '',
    time: data.time.trim(),
    location: data.location.trim().toLowerCase(),
    capacity: data.capacity,
    price: data.price,
    currency: data.currency.toUpperCase(),
    paymentMethod: data.paymentMethod.toLowerCase(),
  };

  // Create canonical string representation (sorted keys for consistency)
  const canonical = JSON.stringify(normalized, Object.keys(normalized).sort());

  // Generate SHA-256 hash using Web Crypto API
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}
