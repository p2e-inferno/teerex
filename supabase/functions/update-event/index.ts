
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { createRemoteJWKSet, jwtVerify } from 'https://deno.land/x/jose@v4.14.4/index.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PRIVY_APP_ID = 'cm5x5kyq500eo5zk1lykex6s5' // This is public and can be stored here

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
    const userId = payload.sub
    if (!userId) {
      throw new Error('User ID not found in token')
    }

    // 2. Get event data from request body
    const { eventId, formData } = await req.json()
    if (!eventId || !formData) {
      return new Response(JSON.stringify({ error: 'Missing eventId or formData' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 3. Create a service role client to bypass RLS for the update
    const serviceRoleClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 4. Fetch the existing event to verify ownership before updating
    const { data: existingEvent, error: fetchError } = await serviceRoleClient
      .from('events')
      .select('creator_id')
      .eq('id', eventId)
      .single()

    if (fetchError) {
      console.error('Fetch error:', fetchError.message)
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    // 5. Enforce ownership check
    if (existingEvent.creator_id !== userId) {
      return new Response(JSON.stringify({ error: 'You can only update your own events' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    // 6. Prepare and perform the update
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
