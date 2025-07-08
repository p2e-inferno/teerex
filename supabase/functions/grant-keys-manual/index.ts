import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'
import { ethers } from 'https://esm.sh/ethers@6.14.4'
import { Database } from '../_shared/database.types.ts'
import { corsHeaders } from '../_shared/cors.ts'

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
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    })
  }

  try {
    console.log('Grant keys manual function called');
    console.log('Request method:', req.method);
    console.log('Request headers:', Object.fromEntries(req.headers.entries()));
    
    let body;
    try {
      body = await req.json();
      console.log('Request body:', body);
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

    console.log('Processing manual key grant for transaction:', transactionReference);

    // Initialize Supabase client
    console.log('Initializing Supabase client');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)

    // Find the transaction in our database by reference
    const { data: transaction, error: fetchError } = await supabase
      .from('paystack_transactions')
      .select('*')
      .eq('reference', transactionReference)
      .single()

    if (fetchError || !transaction) {
      console.error('Error fetching transaction:', fetchError)
      return new Response('Transaction not found', { 
        status: 404, 
        headers: corsHeaders 
      })
    }

    // Check if key was already granted
    if (transaction.gateway_response?.key_granted) {
      return new Response('Key already granted for this transaction', { 
        status: 200, 
        headers: corsHeaders 
      })
    }

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', transaction.event_id)
      .single()

    if (eventError || !event) {
      console.error('Error fetching event:', eventError)
      return new Response('Event not found', { 
        status: 404, 
        headers: corsHeaders 
      })
    }

    // Get network configuration
    const { data: networkConfig, error: networkError } = await supabase
      .from('network_configs')
      .select('*')
      .eq('chain_id', event.chain_id)
      .single()

    if (networkError || !networkConfig) {
      console.error('Error fetching network config:', networkError)
      return new Response(`Network configuration not found for chain ID ${event.chain_id}`, { 
        status: 404, 
        headers: corsHeaders 
      })
    }

    if (!networkConfig.rpc_url) {
      return new Response(`RPC URL not configured for chain ${networkConfig.chain_name}`, { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    // Extract user address from transaction metadata custom fields
    const customFields = transaction.gateway_response?.metadata?.custom_fields || [];
    const userAddressField = customFields.find((field: any) => field.variable_name === 'user_wallet_address');
    const userAddress = userAddressField?.value;
    
    if (!userAddress) {
      return new Response('User wallet address not found in transaction metadata', { 
        status: 400, 
        headers: corsHeaders 
      })
    }

    console.log('Granting key for transaction:', {
      eventId: event.id,
      lockAddress: event.lock_address,
      userAddress,
      chainId: event.chain_id,
      chainName: networkConfig.chain_name
    })

    // Grant the key using a reasonable expiration duration
    // Default to 30 days (30 * 24 * 60 * 60 = 2592000 seconds)
    const expirationDuration = 2592000; // 30 days in seconds
    
    const grantResult = await grantKeyToUser(
      event.lock_address,
      userAddress,
      expirationDuration,
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
            ...transaction.gateway_response,
            key_grant_tx_hash: grantResult.txHash,
            key_granted: true,
            key_granted_at: new Date().toISOString()
          }
        })
        .eq('reference', transactionReference)

      return new Response(JSON.stringify({
        success: true,
        message: 'Key granted successfully',
        txHash: grantResult.txHash
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      console.error('Failed to grant key:', grantResult.error)
      return new Response(JSON.stringify({
        success: false,
        error: grantResult.error
      }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

  } catch (error) {
    console.error('Manual key grant error:', error)
    
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})