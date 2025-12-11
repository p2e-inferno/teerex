import type { PublishedEvent } from '@/types/event';

/**
 * Standard NFT metadata structure following OpenSea standards
 * @see https://docs.opensea.io/docs/metadata-standards
 */
export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

/**
 * Generate NFT metadata for an event ticket
 * Creates OpenSea-compatible JSON metadata with rich attributes
 * 
 * @param event - Published event data
 * @param tokenId - NFT token ID
 * @returns OpenSea-compatible metadata object
 */
export function generateEventNFTMetadata(
  event: PublishedEvent,
  tokenId: number
): NFTMetadata {
  const startDateStr = event.date
    ? event.date.toISOString().split('T')[0]
    : 'TBA';

  const endDateStr = event.end_date
    ? event.end_date.toISOString().split('T')[0]
    : startDateStr;

  return {
    name: `${event.title} - Ticket #${tokenId}`,
    description: event.description || `Ticket for ${event.title}`,
    image: event.image_url || '',
    external_url: `${window.location.origin}/event/${event.lock_address}`,
    attributes: [
      { trait_type: 'Event', value: event.title },
      { trait_type: 'Category', value: event.category },
      { trait_type: 'Event Type', value: event.event_type },
      { trait_type: 'Location', value: event.location },
      { trait_type: 'Start Date', value: startDateStr },
      { trait_type: 'End Date', value: endDateStr },
      { trait_type: 'Capacity', value: event.capacity },
      { trait_type: 'Price', value: event.currency === 'FREE' ? 'Free' : `${event.price} ${event.currency}` },
      { trait_type: 'Chain ID', value: event.chain_id },
      { trait_type: 'Transferable', value: event.transferable ? 'Yes' : 'No' }
    ]
  };
}

/**
 * Get the base token URI for NFT metadata
 * Points to Edge Function that serves dynamic metadata
 * 
 * @param projectUrl - Supabase project URL
 * @returns Base URI with trailing slash
 */
export function getMetadataBaseURI(projectUrl: string): string {
  return `${projectUrl}/functions/v1/nft-metadata/`;
}
