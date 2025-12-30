import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { stripHtml } from '../_shared/html-utils.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/constants.ts';

const APP_BASE_URL = Deno.env.get('APP_PUBLIC_URL') || SUPABASE_URL;

/**
 * Gaming Bundle NFT Metadata Edge Function
 * Serves OpenSea-compatible metadata for gaming bundle NFTs
 *
 * URL Pattern: /gaming-bundle-metadata/{bundleAddress}/{tokenId}
 *
 * Example: https://project.supabase.co/functions/v1/gaming-bundle-metadata/0x123.../42
 * Returns: JSON metadata for bundle token #42 at lock address 0x123...
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Expected: /gaming-bundle-metadata/{bundleAddress}/{tokenId}
    // pathParts will be ['gaming-bundle-metadata', bundleAddress, tokenId]
    const bundleAddress = pathParts[pathParts.length - 2];
    const tokenId = pathParts[pathParts.length - 1];

    if (!bundleAddress || !tokenId) {
      return new Response(
        JSON.stringify({ error: 'Invalid path. Expected /gaming-bundle-metadata/{bundleAddress}/{tokenId}' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate bundle address format (Ethereum address)
    if (!/^0x[a-fA-F0-9]{40}$/.test(bundleAddress)) {
      return new Response(
        JSON.stringify({ error: 'Invalid bundle address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate tokenId is a number
    if (!/^\d+$/.test(tokenId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid token ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch bundle by bundle_address
    const { data: bundle, error } = await supabase
      .from('gaming_bundles')
      .select('*')
      .eq('bundle_address', bundleAddress)
      .single();

    if (error || !bundle) {
      console.error('Gaming bundle not found for address:', bundleAddress, error);
      return new Response(
        JSON.stringify({ error: 'Gaming bundle not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format price display
    const priceDisplay = bundle.price_fiat > 0
      ? `${bundle.fiat_symbol} ${bundle.price_fiat}`
      : bundle.price_dg > 0
        ? `${bundle.price_dg} DG`
        : 'Free';

    // Generate OpenSea-compatible metadata
    const metadata = {
      name: `${bundle.title} - Bundle #${tokenId}`,
      description: stripHtml(bundle.description) || `Gaming bundle for ${bundle.title}`,
      image: bundle.image_url || '',
      external_url: `${APP_BASE_URL}/gaming-bundles/${bundle.id}`,
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
        { trait_type: 'Transferable', value: 'Yes' } // Gaming bundles are transferable by default
      ]
    };

    return new Response(
      JSON.stringify(metadata),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        }
      }
    );
  } catch (error) {
    console.error('Error generating gaming bundle metadata:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
