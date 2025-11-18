import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { validateChain } from '../_shared/network-helpers.ts';
import { formatEventDate } from '../_shared/date-utils.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ethers } from 'https://esm.sh/ethers@6.14.4';
import PublicLockABI from '../_shared/abi/PublicLockV15.json' assert { type: 'json' };
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/constants.ts';

const APP_BASE_URL = Deno.env.get('APP_PUBLIC_URL') || SUPABASE_URL;


/**
 * NFT Metadata Edge Function
 * Serves OpenSea-compatible metadata for event ticket NFTs
 * 
 * URL Pattern: /nft-metadata/{lockAddress}/{tokenId}
 * 
 * Example: https://project.supabase.co/functions/v1/nft-metadata/0x123.../42
 * Returns: JSON metadata for ticket #42 of the event at lock address 0x123...
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Expected: /nft-metadata/{lockAddress}/{tokenId}
    // pathParts will be ['nft-metadata', lockAddress, tokenId]
    const lockAddress = pathParts[pathParts.length - 2];
    const tokenId = pathParts[pathParts.length - 1];

    if (!lockAddress || !tokenId) {
      return new Response(
        JSON.stringify({ error: 'Invalid path. Expected /nft-metadata/{lockAddress}/{tokenId}' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate lock address format (Ethereum address)
    if (!/^0x[a-fA-F0-9]{40}$/.test(lockAddress)) {
      return new Response(
        JSON.stringify({ error: 'Invalid lock address format' }),
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

    // Fetch event by lock_address
    const { data: event, error } = await supabase
      .from('events')
      .select('*')
      .eq('lock_address', lockAddress)
      .single();

    if (error || !event) {
      console.error('Event not found for lock address:', lockAddress, error);
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format start/end dates consistently as YYYY-MM-DD or 'TBA'
    const rawStart = event.date as string | null;
    const rawEnd = (event as any).end_date as string | null;

    const formattedStartDate = formatEventDate(rawStart);
    const formattedEndDate = formatEventDate(rawEnd, formattedStartDate);

    // Resolve transferability from the lock contract (source of truth)
    let isTransferableOnChain = true;
    try {
      const networkConfig = await validateChain(supabase, event.chain_id as number);
      if (!networkConfig || !networkConfig.rpc_url) {
        console.warn('Network not configured for chain ID:', event.chain_id);
        // Skip on-chain validation if network not configured
      } else {
        const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
        const lockContract = new ethers.Contract(lockAddress, PublicLockABI as any, provider);
        const fee = await lockContract.transferFeeBasisPoints();
        const feeBps = Number(fee);
        // 10000 bps (100%) => soul-bound (non-transferable) by convention
        isTransferableOnChain = feeBps < 10000;
      }

      // Opportunistic self-heal of DB flag if it diverges from on-chain state
      if (typeof event.transferable === 'boolean' && event.transferable !== isTransferableOnChain) {
        try {
          await supabase
            .from('events')
            .update({ transferable: isTransferableOnChain })
            .eq('id', event.id);
        } catch (updateError) {
          console.warn('Failed to self-heal transferable flag for event', event.id, updateError);
        }
      }
    } catch (onChainError) {
      console.error('Error resolving transferability from contract for metadata:', onChainError);
      // Fail-open: keep isTransferableOnChain = true to avoid incorrectly labelling as non-transferable
    }

    // Generate OpenSea-compatible metadata
    const metadata = {
      name: `${event.title} - Ticket #${tokenId}`,
      description: event.description || `Ticket for ${event.title}`,
      image: event.image_url || '',
      external_url: `${APP_BASE_URL}/event/${lockAddress}`,
      attributes: [
        { trait_type: 'Event', value: event.title },
        { trait_type: 'Category', value: event.category },
        { trait_type: 'Event Type', value: event.event_type },
        { trait_type: 'Location', value: event.location },
        { trait_type: 'Start Date', value: formattedStartDate },
        { trait_type: 'End Date', value: formattedEndDate },
        { trait_type: 'Capacity', value: event.capacity },
        { trait_type: 'Price', value: event.currency === 'FREE' ? 'Free' : `${event.price} ${event.currency}` },
        { trait_type: 'Chain ID', value: event.chain_id },
        { trait_type: 'Transferable', value: isTransferableOnChain ? 'Yes' : 'No' }
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
    console.error('Error generating metadata:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
