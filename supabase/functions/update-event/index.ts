
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// These are automatically populated by Supabase
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Authenticate user using the provided JWT
    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
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
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    // 5. Enforce ownership check
    if (existingEvent.creator_id !== user.id) {
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
    return new Response(JSON.stringify({ error: e.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
