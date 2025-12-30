import type { GamingBundle } from '@/types/gaming';

/**
 * Standard NFT metadata structure following OpenSea standards
 * @see https://docs.opensea.io/docs/metadata-standards
 */
export interface GamingBundleNFTMetadata {
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
 * Generate NFT metadata for a gaming bundle
 * Creates OpenSea-compatible JSON metadata with rich attributes
 *
 * @param bundle - Gaming bundle data
 * @param tokenId - NFT token ID
 * @returns OpenSea-compatible metadata object
 */
export function generateGamingBundleNFTMetadata(
  bundle: GamingBundle,
  tokenId: number
): GamingBundleNFTMetadata {
  // Format price display
  const priceDisplay =
    bundle.price_fiat && Number(bundle.price_fiat) > 0
      ? `${bundle.fiat_symbol} ${bundle.price_fiat}`
      : bundle.price_dg && Number(bundle.price_dg) > 0
        ? `${bundle.price_dg} DG`
        : 'Free';

  return {
    name: `${bundle.title} - Bundle #${tokenId}`,
    description: bundle.description || `Gaming bundle for ${bundle.title}`,
    image: bundle.image_url || '',
    external_url: `${window.location.origin}/gaming-bundles/${bundle.id}`,
    attributes: [
      { trait_type: 'Bundle', value: bundle.title },
      { trait_type: 'Game', value: bundle.game_title || 'Any Game' },
      { trait_type: 'Console', value: bundle.console || 'Any Console' },
      { trait_type: 'Location', value: bundle.location || 'Not specified' },
      { trait_type: 'Bundle Type', value: bundle.bundle_type },
      { trait_type: 'Units', value: bundle.quantity_units },
      { trait_type: 'Unit Label', value: bundle.unit_label },
      { trait_type: 'Price', value: priceDisplay },
      { trait_type: 'Chain ID', value: bundle.chain_id },
    ],
  };
}

/**
 * Get the base token URI for gaming bundle NFT metadata
 * Points to Edge Function that serves dynamic metadata
 *
 * @param bundleAddress - The Unlock lock address for the bundle
 * @returns Base URI with trailing slash
 */
export function getGamingBundleMetadataBaseURI(bundleAddress: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/gaming-bundle-metadata/${bundleAddress}/`;
}
