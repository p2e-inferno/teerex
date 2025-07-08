import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'
import { ethers } from 'https://esm.sh/ethers@6.14.4'
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

// Simplified PublicLock ABI for grantKeys function
const PublicLockABI = [
  {
    "inputs": [
      { "internalType": "uint256[]", "name": "_expirationTimestamps", "type": "uint256[]" },
      { "internalType": "address[]", "name": "_recipients", "type": "address[]" },
      { "internalType": "address[]", "name": "_keyManagers", "type": "address[]" }
    ],
    "name": "grantKeys",
    "outputs": [{ "internalType": "uint256[]", "name": "tokenIds", "type": "uint256[]" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "expirationDuration",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "isLockManager",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view", 
    "type": "function"
  }
];

async function grantKeyToUser(
  lockAddress: string,
  recipientAddress: string,
  expirationDuration: number,
  chainId: number,
  rpcUrl: string
): Promise<{ success: boolean; error?: string; txHash?: string }> {
  try {
    console.log('Attempting to grant key:', {
      lockAddress,
      recipientAddress,
      expirationDuration,
      chainId,
      rpcUrl
    });

    // Get the private key for the service account
    const privateKey = Deno.env.get('UNLOCK_SERVICE_PRIVATE_KEY');
    if (!privateKey) {
      throw new Error('UNLOCK_SERVICE_PRIVATE_KEY not configured in environment');
    }

    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log('Service wallet address:', wallet.address);

    // Create contract instance
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, wallet);

    // Check if wallet is a lock manager
    const isManager = await lockContract.isLockManager(wallet.address);
    if (!isManager) {
      throw new Error(`Service wallet ${wallet.address} is not a lock manager for contract ${lockAddress}`);
    }

    // Calculate expiration timestamp
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTimestamp = currentTime + expirationDuration;

    console.log('Granting key with params:', {
      expirationTimestamp,
      recipient: recipientAddress,
      keyManager: recipientAddress
    });

    // Grant the key
    const tx = await lockContract.grantKeys(
      [expirationTimestamp], // _expirationTimestamps
      [recipientAddress],     // _recipients
      [recipientAddress]      // _keyManagers (recipient manages their own key)
    );

    console.log('Grant key transaction sent:', tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log('Grant key transaction confirmed:', receipt.hash);

    if (receipt.status !== 1) {
      throw new Error('Grant key transaction failed');
    }

    return {
      success: true,
      txHash: tx.hash
    };

  } catch (error) {
    console.error('Error granting key:', error);
    
    let errorMessage = 'Failed to grant key to user';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage
    };
  }
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

    // Grant key to user via Unlock Protocol
    try {
      // Get event details
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', transaction.event_id)
        .single()

      if (eventError || !event) {
        console.error('Error fetching event:', eventError)
        throw new Error('Event not found')
      }

      // Get network configuration
      const { data: networkConfig, error: networkError } = await supabase
        .from('network_configs')
        .select('*')
        .eq('chain_id', event.chain_id)
        .single()

      if (networkError || !networkConfig) {
        console.error('Error fetching network config:', networkError)
        throw new Error(`Network configuration not found for chain ID ${event.chain_id}`)
      }

      if (!networkConfig.rpc_url) {
        throw new Error(`RPC URL not configured for chain ${networkConfig.chain_name}`)
      }

      // Extract user address from transaction metadata
      const userAddress = transaction.gateway_response?.metadata?.user_address;
      if (!userAddress) {
        throw new Error('User address not found in transaction metadata')
      }

      console.log('Granting key for successful payment:', {
        eventId: event.id,
        lockAddress: event.lock_address,
        userAddress,
        chainId: event.chain_id,
        chainName: networkConfig.chain_name
      })

      // Grant the key using the event's expiration duration
      const grantResult = await grantKeyToUser(
        event.lock_address,
        userAddress,
        event.max_keys_per_address || 86400, // Default to 24 hours if not set
        event.chain_id,
        networkConfig.rpc_url
      )

      if (grantResult.success) {
        console.log('Key granted successfully:', grantResult.txHash)
        
        // Update transaction with grant details
        await supabase
          .from('paystack_transactions')
          .update({
            gateway_response: {
              ...webhookData.data,
              key_grant_tx_hash: grantResult.txHash,
              key_granted: true,
              key_granted_at: new Date().toISOString()
            }
          })
          .eq('reference', reference)
      } else {
        console.error('Failed to grant key:', grantResult.error)
        // Still continue - payment was successful, key granting is secondary
      }

    } catch (grantError) {
      console.error('Error in key granting process:', grantError)
      // Don't fail the webhook - payment verification was successful
      // Key granting can be retried later if needed
    }

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