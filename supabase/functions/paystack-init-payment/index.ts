import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'
import { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaymentInitRequest {
  eventId: string;
  email: string;
  walletAddress?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  try {
    // Initialize Supabase client with anon key for user authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Authorization required', { 
        status: 401, 
        headers: corsHeaders 
      })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response('Invalid authorization', { 
        status: 401, 
        headers: corsHeaders 
      })
    }

    const { eventId, email, walletAddress }: PaymentInitRequest = await req.json()

    if (!eventId || !email) {
      return new Response('Missing required fields', { 
        status: 400, 
        headers: corsHeaders 
      })
    }

    // Get event details using service role key for reliable access
    const supabaseService = createClient<Database>(
      supabaseUrl, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: event, error: eventError } = await supabaseService
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return new Response('Event not found', { 
        status: 404, 
        headers: corsHeaders 
      })
    }

    if (!event.paystack_public_key) {
      return new Response('Payment not configured for this event', { 
        status: 400, 
        headers: corsHeaders 
      })
    }

    // Generate unique reference
    const reference = `TeeRex-${eventId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Create payment transaction record
    const { error: txError } = await supabaseService
      .from('paystack_transactions')
      .insert({
        event_id: eventId,
        user_email: email,
        reference,
        amount: event.ngn_price || 0,
        currency: 'NGN',
        status: 'pending'
      })

    if (txError) {
      console.error('Error creating transaction record:', txError)
      return new Response('Failed to create transaction record', { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    // Initialize Paystack payment
    const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!paystackSecret) {
      return new Response('Payment service not configured', { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round((event.ngn_price || 0) * 100), // Convert to kobo
        currency: 'NGN',
        reference,
        metadata: {
          eventId,
          walletAddress,
          custom_fields: [
            {
              display_name: "Event ID",
              variable_name: "event_id",
              value: eventId
            },
            {
              display_name: "Wallet Address",
              variable_name: "user_wallet_address",
              value: walletAddress || ''
            },
            {
              display_name: "User Email",
              variable_name: "user_email",
              value: email
            }
          ]
        },
        callback_url: `${req.headers.get('origin')}/payment/callback`,
      }),
    })

    const paystackData = await paystackResponse.json()

    if (!paystackData.status) {
      console.error('Paystack initialization failed:', paystackData)
      return new Response('Failed to initialize payment', { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        reference,
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Payment initialization error:', error)
    return new Response('Internal server error', { 
      status: 500, 
      headers: corsHeaders 
    })
  }
})