import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts';
import { validateChain } from '../_shared/network-helpers.ts';
import { formatEventDate } from '../_shared/date-utils.ts';
import { stripHtml } from '../_shared/html-utils.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ethers } from 'https://esm.sh/ethers@6.14.4';
import PublicLockABI from '../_shared/abi/PublicLockV15.json' assert { type: 'json' };
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/constants.ts';

const APP_BASE_URL = Deno.env.get('APP_PUBLIC_URL') || SUPABASE_URL;

async function resolveTransferability(supabase: any, lockAddress: string, chainId: number) {
  try {
    const networkConfig = await validateChain(supabase, chainId);
    if (!networkConfig?.rpc_url) return true;
    const provider = new ethers.JsonRpcProvider(networkConfig.rpc_url);
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI as any, provider);
    const fee = await lockContract.transferFeeBasisPoints();
    return Number(fee) < 10000;
  } catch (error) {
    console.error('Error resolving transferability from contract for metadata:', error);
    return true;
  }
}

/**
 * Serves OpenSea-compatible metadata for TeeRex event-ticket and creator-collectible keys.
 * URL: /nft-metadata/{lockAddress}/{tokenId}
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const lockAddress = pathParts[pathParts.length - 2];
    const tokenId = pathParts[pathParts.length - 1];

    if (!lockAddress || !tokenId) {
      return new Response(
        JSON.stringify({ error: 'Invalid path. Expected /nft-metadata/{lockAddress}/{tokenId}' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(lockAddress)) {
      return new Response(JSON.stringify({ error: 'Invalid lock address format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!/^\d+$/.test(tokenId)) {
      return new Response(JSON.stringify({ error: 'Invalid token ID format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Preserve the existing event metadata contract first. Collectibles are only a fallback.
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('lock_address', lockAddress)
      .maybeSingle();

    if (eventError) {
      console.error('Error fetching event metadata row:', eventError);
    }

    if (event) {
      const rawStart = event.date as string | null;
      const rawEnd = (event as any).end_date as string | null;
      const formattedStartDate = formatEventDate(rawStart);
      const formattedEndDate = formatEventDate(rawEnd, formattedStartDate);
      const isTransferableOnChain = await resolveTransferability(supabase, lockAddress, event.chain_id as number);

      if (typeof event.transferable === 'boolean' && event.transferable !== isTransferableOnChain) {
        try {
          await supabase.from('events').update({ transferable: isTransferableOnChain }).eq('id', event.id);
        } catch (updateError) {
          console.warn('Failed to self-heal transferable flag for event', event.id, updateError);
        }
      }

      const metadata = {
        name: `${event.title} - Ticket #${tokenId}`,
        description: stripHtml(event.description) || `Ticket for ${event.title}`,
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
          { trait_type: 'Transferable', value: isTransferableOnChain ? 'Yes' : 'No' },
        ],
      };

      return new Response(JSON.stringify(metadata), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    const { data: collectible, error: collectibleError } = await supabase
      .from('collectibles')
      .select('*')
      .ilike('lock_address', lockAddress)
      .eq('is_public', true)
      .maybeSingle();

    if (collectibleError) {
      console.error('Error fetching collectible metadata row:', collectibleError);
    }
    if (!collectible) {
      return new Response(JSON.stringify({ error: 'Event or collectible not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const transferable = await resolveTransferability(supabase, lockAddress, Number(collectible.chain_id));
    const metadata = {
      name: `${collectible.name} #${tokenId}`,
      description: stripHtml(collectible.description) || `Creator collectible: ${collectible.name}`,
      image: collectible.image_url || '',
      external_url: `${APP_BASE_URL}/collectible/${lockAddress}`,
      attributes: [
        { trait_type: 'Price', value: `${collectible.price} ${collectible.currency}` },
        { trait_type: 'Chain ID', value: collectible.chain_id },
        { trait_type: 'Physical item available', value: collectible.is_claimable ? 'Yes' : 'No' },
        { trait_type: 'Max supply', value: collectible.max_supply },
        { trait_type: 'Transferable', value: transferable ? 'Yes' : 'No' },
      ],
    };

    return new Response(JSON.stringify(metadata), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (error) {
    console.error('Error generating metadata:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
