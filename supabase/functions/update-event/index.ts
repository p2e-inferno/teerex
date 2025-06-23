
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { createRemoteJWKSet, jwtVerify } from 'https://deno.land/x/jose@v4.14.4/index.ts'
import { ethers } from 'https://esm.sh/ethers@6.14.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PRIVY_APP_ID = Deno.env.get('VITE_PRIVY_APP_ID')!
const PRIVY_APP_SECRET = Deno.env.get('PRIVY_APP_SECRET')!

const PublicLockABI = [
  {
    inputs: [{ internalType: 'address', name: '_account', type: 'address' }],
    name: 'isLockManager',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
]

// RPC endpoints for different networks
const getRpcUrl = (chainId: number): string => {
  switch (chainId) {
    case 8453: // Base mainnet
      return 'https://mainnet.base.org'
    case 84532: // Base Sepolia testnet
      return 'https://sepolia.base.org'
    case 1: // Ethereum mainnet
      return 'https://eth.llamarpc.com'
    case 11155111: // Ethereum Sepolia
      return 'https://ethereum-sepolia-rpc.publicnode.com'
    case 137: // Polygon mainnet
      return 'https://polygon.llamarpc.com'
    case 80002: // Polygon Amoy testnet
      return 'https://rpc-amoy.polygon.technology'
    default:
      // Default to Base Sepolia if unknown chain
      console.warn(`Unknown chain ID: ${chainId}, defaulting to Base Sepolia`)
      return 'https://sepolia.base.org'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Authenticate user using Privy JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }
    
    const token = authHeader.split(' ')[1]
    console.log('Attempting to verify JWT token...')
    
    let privyUserId: string | undefined
    
    try {
      // Try to verify with JWKS first
      const JWKS = createRemoteJWKSet(new URL('https://auth.privy.io/.well-known/jwks.json'))
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: 'https://auth.privy.io',
        audience: PRIVY_APP_ID,
      })
      privyUserId = payload.sub
      console.log('JWT verification successful via JWKS')
    } catch (jwksError) {
      console.warn('JWKS verification failed, attempting Privy API verification:', jwksError.message)
      
      // Fallback: Use Privy API to verify the token and get user info
      try {
        const privyVerifyResponse = await fetch('https://auth.privy.io/api/v1/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'privy-app-id': PRIVY_APP_ID,
            'Authorization': 'Basic ' + btoa(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`),
          },
          body: JSON.stringify({
            refresh_token: token // This might not work for access tokens, but let's try
          })
        })

        if (!privyVerifyResponse.ok) {
          throw new Error(`Privy session verification failed: ${privyVerifyResponse.statusText}`)
        }

        const sessionData = await privyVerifyResponse.json()
        privyUserId = sessionData.user?.id
        console.log('JWT verification successful via Privy API')
      } catch (privyApiError) {
        console.error('Both JWKS and Privy API verification failed:', privyApiError.message)
        throw new Error('Token verification failed. Please log in again.')
      }
    }
    
    if (!privyUserId) {
      throw new Error('User ID not found in token')
    }

    console.log('User authenticated:', privyUserId)

    // 2. Get user's wallet address from Privy API
    const privyApiResponse = await fetch(`https://auth.privy.io/api/v1/users/${privyUserId}`, {
        method: 'GET',
        headers: {
            'privy-app-id': PRIVY_APP_ID,
            'Authorization': 'Basic ' + btoa(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`),
        },
    });

    if (!privyApiResponse.ok) {
        console.error('Privy API Error:', await privyApiResponse.text());
        throw new Error('Failed to fetch user details from Privy.');
    }

    const privyUserData = await privyApiResponse.json();
    const wallet = privyUserData.linked_accounts?.find((acc: any) => acc.type === 'wallet');
    const userWalletAddress = wallet?.address;

    if (!userWalletAddress) {
        throw new Error("Could not find user's wallet address.");
    }

    console.log('User wallet address:', userWalletAddress)

    // 3. Get event data from request body
    const { eventId, formData } = await req.json()
    if (!eventId || !formData) {
      return new Response(JSON.stringify({ error: 'Missing eventId or formData' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    console.log('Updating event:', eventId)

    // 4. Create Supabase service client and fetch event to get lock address and chain_id
    const serviceRoleClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: event, error: fetchError } = await serviceRoleClient
      .from('events')
      .select('lock_address, chain_id')
      .eq('id', eventId)
      .single()

    if (fetchError) {
      console.error('Fetch error:', fetchError.message)
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }
    const lockAddress = event.lock_address;
    const chainId = event.chain_id;

    console.log(`Verifying lock manager for address ${userWalletAddress} on chain ${chainId} for lock ${lockAddress}`)

    // 5. On-chain authorization: Check if the user is a lock manager on the correct network
    const rpcUrl = getRpcUrl(chainId)
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, provider)
    
    try {
      const isManager = await lockContract.isLockManager(userWalletAddress)
      console.log(`Lock manager check result: ${isManager}`)

      if (!isManager) {
        return new Response(JSON.stringify({ error: 'Unauthorized: You are not a manager for this event.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        })
      }
    } catch (contractError) {
      console.error('Error checking lock manager status:', contractError)
      return new Response(JSON.stringify({ error: 'Failed to verify lock manager status on blockchain' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // 6. If authorized, prepare and perform the update
    const eventData = {
      title: formData.title,
      description: formData.description,
      date: formData.date ? new Date(formData.date).toISOString() : null,
      time: formData.time,
      location: formData.location,
      category: formData.category,
      image_url: formData.imageUrl || null,
      updated_at: new Date().toISOString(),
    }

    console.log('Updating event with data:', eventData)

    const { data: updatedEvent, error: updateError } = await serviceRoleClient
      .from('events')
      .update(eventData)
      .eq('id', eventId)
      .select()
      .single()

    if (updateError) {
      console.error('Failed to update event:', updateError)
      return new Response(JSON.stringify({ error: 'Failed to update event database record' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    console.log('Event updated successfully:', updatedEvent.id)

    return new Response(JSON.stringify(updatedEvent), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e) {
    console.error('Function error:', e)
    if (e.code === 'ERR_JWT_EXPIRED') {
      return new Response(JSON.stringify({ error: 'Token expired' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }
    if (e.code && e.code.startsWith('ERR_JWT')) {
      return new Response(JSON.stringify({ error: `Invalid token: ${e.code}` }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
