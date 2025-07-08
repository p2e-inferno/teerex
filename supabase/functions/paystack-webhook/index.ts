import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'
import { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
}

interface PaystackWebhookData {
  event: string
  data: {
    id: number
    domain: string
    status: string
    reference: string
    amount: number
    message: string | null
    gateway_response: string
    paid_at: string
    created_at: string
    channel: string
    currency: string
    ip_address: string
    metadata: Record<string, any>
    log: {
      start_time: number
      time_spent: number
      attempts: number
      errors: number
      success: boolean
      mobile: boolean
      input: any[]
      history: any[]
    }
    fees: number
    fees_split: any
    authorization: {
      authorization_code: string
      bin: string
      last4: string
      exp_month: string
      exp_year: string
      channel: string
      card_type: string
      bank: string
      country_code: string
      brand: string
      reusable: boolean
      signature: string
      account_name: string | null
    }
    customer: {
      id: number
      first_name: string | null
      last_name: string | null
      email: string
      customer_code: string
      phone: string | null
      metadata: any
      risk_action: string
      international_format_phone: string | null
    }
    plan: any
    split: any
    order_id: any
    paidAt: string
    createdAt: string
    requested_amount: number
    pos_transaction_data: any
    source: any
    fees_breakdown: any
    transaction_date: string
    plan_object: any
    subaccount: any
  }
}

async function verifyPaystackSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const data = encoder.encode(body)
  const keyData = encoder.encode(secret)
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  
  const signatureArrayBuffer = await crypto.subtle.sign('HMAC', cryptoKey, data)
  const computedSignature = Array.from(new Uint8Array(signatureArrayBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  return signature === computedSignature
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
    // Get the Paystack secret key from environment variables
    const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!paystackSecret) {
      console.error('PAYSTACK_SECRET_KEY not found in environment variables')
      return new Response('Configuration error', { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    // Get the signature from headers
    const signature = req.headers.get('x-paystack-signature')
    if (!signature) {
      console.error('Missing x-paystack-signature header')
      return new Response('Missing signature', { 
        status: 400, 
        headers: corsHeaders 
      })
    }

    // Get the raw body
    const body = await req.text()
    console.log('Webhook received:', body)

    // Verify the signature
    const isValidSignature = await verifyPaystackSignature(body, signature, paystackSecret)
    if (!isValidSignature) {
      console.error('Invalid webhook signature')
      return new Response('Invalid signature', { 
        status: 401, 
        headers: corsHeaders 
      })
    }

    // Parse the webhook data
    const webhookData: PaystackWebhookData = JSON.parse(body)
    console.log('Webhook event:', webhookData.event)
    console.log('Transaction data:', webhookData.data)

    // Only process successful charge events
    if (webhookData.event !== 'charge.success') {
      console.log('Ignoring non-success event:', webhookData.event)
      return new Response('Event ignored', { 
        status: 200, 
        headers: corsHeaders 
      })
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)

    const { data, status, reference, amount, customer, paid_at } = webhookData.data

    // Find the transaction in our database by reference
    const { data: transaction, error: fetchError } = await supabase
      .from('paystack_transactions')
      .select('*')
      .eq('reference', reference)
      .single()

    if (fetchError) {
      console.error('Error fetching transaction:', fetchError)
      return new Response('Transaction not found', { 
        status: 404, 
        headers: corsHeaders 
      })
    }

    if (!transaction) {
      console.error('Transaction not found in database:', reference)
      return new Response('Transaction not found', { 
        status: 404, 
        headers: corsHeaders 
      })
    }

    // Update the transaction status
    const { error: updateError } = await supabase
      .from('paystack_transactions')
      .update({
        status: status.toLowerCase(),
        gateway_response: webhookData.data,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('reference', reference)

    if (updateError) {
      console.error('Error updating transaction:', updateError)
      return new Response('Update failed', { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    // Log successful verification
    console.log(`Payment verified successfully:`, {
      reference,
      amount: amount / 100, // Convert from kobo to naira
      email: customer.email,
      status,
      paid_at
    })

    // TODO: Here you could also:
    // 1. Send confirmation email to customer
    // 2. Create ticket/NFT on blockchain if needed
    // 3. Update event capacity/sold count
    // 4. Trigger other business logic

    return new Response('Webhook processed successfully', { 
      status: 200, 
      headers: corsHeaders 
    })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return new Response('Internal server error', { 
      status: 500, 
      headers: corsHeaders 
    })
  }
})