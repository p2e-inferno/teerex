import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'
import { Database } from '../_shared/database.types.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  console.log('Grant keys function started');
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight request');
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    console.log('Processing POST request');
    
    // Parse request body
    let body;
    try {
      body = await req.json();
      console.log('Request body parsed:', body);
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError);
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const { transactionReference } = body;
    
    if (!transactionReference) {
      console.log('Missing transaction reference');
      return new Response(JSON.stringify({ error: 'Transaction reference is required' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Processing transaction reference:', transactionReference);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey
    });
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
    console.log('Supabase client initialized');

    // Find the transaction
    console.log('Fetching transaction from database');
    const { data: transaction, error: fetchError } = await supabase
      .from('paystack_transactions')
      .select('*')
      .eq('reference', transactionReference)
      .single()

    if (fetchError) {
      console.error('Error fetching transaction:', fetchError);
      return new Response(JSON.stringify({ error: 'Database error', details: fetchError.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!transaction) {
      console.log('Transaction not found');
      return new Response(JSON.stringify({ error: 'Transaction not found' }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Transaction found:', transaction.id);

    // For now, just return success without actually granting keys
    // We can add the key granting logic once basic function works
    return new Response(JSON.stringify({
      success: true,
      message: 'Function working - key granting logic will be added next',
      transactionId: transaction.id
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Manual key grant error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      stack: error instanceof Error ? error.stack : undefined
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})