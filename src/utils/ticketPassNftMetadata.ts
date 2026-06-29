/**
 * Get the base token URI for Ticket Pass NFT metadata.
 * Points to the ticket-pass-metadata edge function that serves dynamic, per-token metadata.
 *
 * @param lockAddress - The Unlock lock address backing the pass
 * @returns Base URI with trailing slash (Unlock appends the token id)
 */
export function getTicketPassMetadataBaseURI(lockAddress: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/ticket-pass-metadata/${lockAddress}/`;
}
