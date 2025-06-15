
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
    const JWKS = createRemoteJWKSet(new URL('https://auth.privy.io/.well-known/jwks.json'))
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://auth.privy.io',
      audience: PRIVY_APP_ID,
    })
    const privyUserId = payload.sub
    if (!privyUserId) {
      throw new Error('User ID not found in token')
    }

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

    // 3. Get event data from request body
    const { eventId, formData } = await req.json()
    if (!eventId || !formData) {
      return new Response(JSON.stringify({ error: 'Missing eventId or formData' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 4. Create Supabase service client and fetch event to get lock address
    const serviceRoleClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: event, error: fetchError } = await serviceRoleClient
      .from('events')
      .select('lock_address')
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

    // 5. On-chain authorization: Check if the user is a lock manager
    const provider = new ethers.JsonRpcProvider('https://sepolia.base.org')
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, provider)
    const isManager = await lockContract.isLockManager(userWalletAddress)

    if (!isManager) {
      return new Response(JSON.stringify({ error: 'Unauthorized: You are not a manager for this event.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
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
