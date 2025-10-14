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
  },
  {
    "inputs": [{ "internalType": "address", "name": "_keyOwner", "type": "address" }],
    "name": "getHasValidKey",
    "outputs": [{ "internalType": "bool", "name": "isValid", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "Transfer",
    "type": "event"
  }
];

async function grantKeyToUser(
  lockAddress: string,
  recipientAddress: string,
  expirationDuration: number,
  chainId: number,
  rpcUrl: string,
  paymentTransactionId: string,
  supabase: any
): Promise<{ success: boolean; error?: string; txHash?: string; gasUsed?: string; gasPrice?: string; tokenId?: string }> {
  let balanceBefore = '0';
  let balanceAfter = '0';
  let attemptId;

  try {
    console.log('Attempting to grant key:', {
      lockAddress,
      recipientAddress,
      expirationDuration,
      chainId,
      rpcUrl,
      paymentTransactionId
    });

    // Record the attempt
    const { data: attempt, error: attemptError } = await supabase
      .from('key_grant_attempts')
      .insert({
        payment_transaction_id: paymentTransactionId,
        status: 'pending'
      })
      .select()
      .single();

    if (attemptError) {
      console.error('Failed to record attempt:', attemptError);
    } else {
      attemptId = attempt.id;
    }

    // Get the private key for the service account
    const privateKey = Deno.env.get('UNLOCK_SERVICE_PRIVATE_KEY');
    if (!privateKey) {
      throw new Error('UNLOCK_SERVICE_PRIVATE_KEY not configured in environment');
    }

    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log('Service wallet address:', wallet.address);

    // Check service wallet balance before transaction
    balanceBefore = ethers.formatEther(await provider.getBalance(wallet.address));
    console.log('Service wallet balance before:', balanceBefore, 'ETH');

    // Alert if balance is low (less than 0.001 ETH)
    if (parseFloat(balanceBefore) < 0.001) {
      console.warn('⚠️ Service wallet balance is low:', balanceBefore, 'ETH');
    }

    // Create contract instance
    const lockContract = new ethers.Contract(lockAddress, PublicLockABI, wallet);

    // Check if wallet is a lock manager
    const isManager = await lockContract.isLockManager(wallet.address);
    if (!isManager) {
      throw new Error(`Service wallet ${wallet.address} is not a lock manager for contract ${lockAddress}`);
    }

    // Check if user already has a valid key
    const hasValidKey = await lockContract.getHasValidKey(recipientAddress);
    if (hasValidKey) {
      console.log('User already has a valid key, skipping grant');
      
      // Update attempt status
      if (attemptId) {
        await supabase
          .from('key_grant_attempts')
          .update({
            status: 'success',
            error_message: 'User already has valid key',
            service_wallet_balance_before: balanceBefore
          })
          .eq('id', attemptId);
      }

      return {
        success: true,
        error: 'User already has valid key'
      };
    }

    // Calculate expiration timestamp
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTimestamp = currentTime + expirationDuration;

    console.log('Granting key with params:', {
      expirationTimestamp,
      recipient: recipientAddress,
      keyManager: recipientAddress
    });

    // Estimate gas before transaction
    const gasEstimate = await lockContract.grantKeys.estimateGas(
      [expirationTimestamp],
      [recipientAddress],
      [recipientAddress]
    );
    console.log('Estimated gas:', gasEstimate.toString());

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

    // Check balance after transaction
    balanceAfter = ethers.formatEther(await provider.getBalance(wallet.address));
    console.log('Service wallet balance after:', balanceAfter, 'ETH');

    if (receipt.status !== 1) {
      throw new Error('Grant key transaction failed');
    }

    // Calculate gas costs
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.gasPrice || tx.gasPrice;
    const gasCostWei = gasUsed * gasPrice;
    const gasCostEth = ethers.formatEther(gasCostWei);

    console.log('Gas metrics:', {
      gasUsed: gasUsed.toString(),
      gasPrice: gasPrice.toString(),
      gasCostWei: gasCostWei.toString(),
      gasCostEth
    });

    // Extract token ID from logs if available
    let tokenId;
    if (receipt.logs) {
      for (const log of receipt.logs) {
        try {
          const lockInterface = new ethers.Interface(PublicLockABI);
          const parsedLog = lockInterface.parseLog({
            topics: log.topics,
            data: log.data
          });
          
          if (parsedLog && parsedLog.name === 'Transfer' && parsedLog.args.to === recipientAddress) {
            tokenId = parsedLog.args.tokenId?.toString();
            break;
          }
        } catch (e) {
          // Not a relevant log
        }
      }
    }

    // Update attempt status
    if (attemptId) {
      await supabase
        .from('key_grant_attempts')
        .update({
          status: 'success',
          grant_tx_hash: tx.hash,
          gas_cost_wei: gasCostWei.toString(),
          service_wallet_balance_before: balanceBefore,
          service_wallet_balance_after: balanceAfter
        })
        .eq('id', attemptId);
    }

    // Record gas transaction
    await supabase
      .from('gas_transactions')
      .insert({
        transaction_hash: tx.hash,
        payment_transaction_id: paymentTransactionId,
        gas_used: gasUsed.toString(),
        gas_price: gasPrice.toString(),
        gas_cost_wei: gasCostWei.toString(),
        gas_cost_eth: gasCostEth,
        service_wallet_address: wallet.address,
        chain_id: chainId,
        block_number: receipt.blockNumber,
        status: 'confirmed'
      });

    return {
      success: true,
      txHash: tx.hash,
      gasUsed: gasUsed.toString(),
      gasPrice: gasPrice.toString(),
      tokenId
    };

  } catch (error) {
    console.error('Error granting key:', error);
    
    let errorMessage = 'Failed to grant key to user';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Update attempt status if we have an attempt ID
    if (attemptId) {
      await supabase
        .from('key_grant_attempts')
        .update({
          status: 'failed',
          error_message: errorMessage,
          service_wallet_balance_before: balanceBefore,
          service_wallet_balance_after: balanceAfter || balanceBefore
        })
        .eq('id', attemptId);
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
    console.log('🔔 [WEBHOOK] ========================================');
    console.log('🔔 [WEBHOOK] New webhook request received');
    console.log('🔔 [WEBHOOK] Method:', req.method);
    console.log('🔔 [WEBHOOK] Headers:', Object.fromEntries(req.headers.entries()));
    
    // Get the Paystack secret key from environment variables
    const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!paystackSecret) {
      console.error('❌ [WEBHOOK] PAYSTACK_SECRET_KEY not found in environment variables')
      return new Response('Configuration error', { 
        status: 500, 
        headers: corsHeaders 
      })
    }
    console.log('✅ [WEBHOOK] Paystack secret key found');

    // Get the signature from headers
    const signature = req.headers.get('x-paystack-signature')
    if (!signature) {
      console.error('❌ [WEBHOOK] Missing x-paystack-signature header')
      return new Response('Missing signature', { 
        status: 400, 
        headers: corsHeaders 
      })
    }
    console.log('✅ [WEBHOOK] Signature header found:', signature.substring(0, 20) + '...');

    // Get the raw body
    const body = await req.text()
    console.log('📦 [WEBHOOK] Raw body received (length:', body.length, 'bytes)');
    console.log('📦 [WEBHOOK] Body preview:', body.substring(0, 200) + '...');

    // Verify the signature
    console.log('🔐 [WEBHOOK] Verifying signature...');
    const isValidSignature = await verifyPaystackSignature(body, signature, paystackSecret)
    if (!isValidSignature) {
      console.error('❌ [WEBHOOK] Invalid webhook signature')
      return new Response('Invalid signature', { 
        status: 401, 
        headers: corsHeaders 
      })
    }
    console.log('✅ [WEBHOOK] Signature verified successfully');

    // Parse the webhook data
    const webhookData: PaystackWebhookData = JSON.parse(body)
    console.log('📋 [WEBHOOK] Event type:', webhookData.event);
    console.log('📋 [WEBHOOK] Transaction reference:', webhookData.data?.reference);
    console.log('📋 [WEBHOOK] Amount:', webhookData.data?.amount);
    console.log('📋 [WEBHOOK] Status:', webhookData.data?.status);
    console.log('📋 [WEBHOOK] Full data:', JSON.stringify(webhookData.data, null, 2));

    // Only process successful charge events
    if (webhookData.event !== 'charge.success') {
      console.log('⏭️ [WEBHOOK] Ignoring non-success event:', webhookData.event);
      return new Response('Event ignored', { 
        status: 200, 
        headers: corsHeaders 
      })
    }
    console.log('✅ [WEBHOOK] Event is charge.success, proceeding...');

    // Initialize Supabase client
    console.log('🔧 [WEBHOOK] Initializing Supabase client...');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)
    console.log('✅ [WEBHOOK] Supabase client initialized');

    const { data, status, reference, amount, customer, paid_at } = webhookData.data

    // Find the transaction in our database by reference
    console.log('🔍 [DB QUERY] Searching for transaction with reference:', reference);
    const { data: transaction, error: fetchError } = await supabase
      .from('paystack_transactions')
      .select('*')
      .eq('reference', reference)
      .single()

    if (fetchError) {
      console.error('❌ [DB QUERY] Error fetching transaction:', fetchError);
      return new Response('Transaction not found', { 
        status: 404, 
        headers: corsHeaders 
      })
    }

    if (!transaction) {
      console.error('❌ [DB QUERY] Transaction not found in database:', reference);
      return new Response('Transaction not found', { 
        status: 404, 
        headers: corsHeaders 
      })
    }
    
    console.log('✅ [DB QUERY] Transaction found:', {
      id: transaction.id,
      event_id: transaction.event_id,
      status: transaction.status,
      amount: transaction.amount
    });

    // Update the transaction status
    console.log('💾 [DB UPDATE] Updating transaction status to:', status.toLowerCase());
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
      console.error('❌ [DB UPDATE] Error updating transaction:', updateError);
      return new Response('Update failed', { 
        status: 500, 
        headers: corsHeaders 
      })
    }
    console.log('✅ [DB UPDATE] Transaction updated successfully');

    // Log successful verification
    console.log('🎉 [VERIFICATION] Payment verified successfully:', {
      reference,
      amount: amount / 100, // Convert from kobo to naira
      email: customer.email,
      status,
      paid_at
    });

    // Grant key to user via Unlock Protocol
    console.log('🔑 [KEY GRANT] ========================================');
    console.log('🔑 [KEY GRANT] Starting key grant process...');
    try {
      // Get event details
      console.log('🔍 [KEY GRANT] Fetching event details for ID:', transaction.event_id);
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', transaction.event_id)
        .single()

      if (eventError || !event) {
        console.error('❌ [KEY GRANT] Error fetching event:', eventError);
        throw new Error('Event not found')
      }
      console.log('✅ [KEY GRANT] Event found:', {
        id: event.id,
        title: event.title,
        lock_address: event.lock_address,
        chain_id: event.chain_id
      });

      // Get network configuration
      console.log('🔍 [KEY GRANT] Fetching network config for chain ID:', event.chain_id);
      const { data: networkConfig, error: networkError } = await supabase
        .from('network_configs')
        .select('*')
        .eq('chain_id', event.chain_id)
        .single()

      if (networkError || !networkConfig) {
        console.error('❌ [KEY GRANT] Error fetching network config:', networkError);
        throw new Error(`Network configuration not found for chain ID ${event.chain_id}`)
      }
      console.log('✅ [KEY GRANT] Network config found:', {
        chain_name: networkConfig.chain_name,
        rpc_url: networkConfig.rpc_url ? 'SET' : 'NOT SET'
      });

      if (!networkConfig.rpc_url) {
        console.error('❌ [KEY GRANT] RPC URL not configured for chain:', networkConfig.chain_name);
        throw new Error(`RPC URL not configured for chain ${networkConfig.chain_name}`)
      }

      // Extract user address from transaction metadata custom fields
      console.log('🔍 [KEY GRANT] Extracting user wallet address from metadata...');
      console.log('📋 [KEY GRANT] Gateway response metadata:', JSON.stringify(transaction.gateway_response?.metadata, null, 2));
      
      const customFields = transaction.gateway_response?.metadata?.custom_fields || [];
      console.log('📋 [KEY GRANT] Custom fields found:', customFields.length);
      console.log('📋 [KEY GRANT] Custom fields:', JSON.stringify(customFields, null, 2));
      
      const userAddressField = customFields.find((field: any) => field.variable_name === 'user_wallet_address');
      const userAddress = userAddressField?.value;
      
      if (!userAddress) {
        console.error('❌ [KEY GRANT] User wallet address not found in transaction metadata');
        console.error('❌ [KEY GRANT] Available fields:', customFields.map((f: any) => f.variable_name).join(', '));
        throw new Error('User wallet address not found in transaction metadata')
      }
      console.log('✅ [KEY GRANT] User wallet address found:', userAddress);

      console.log('🚀 [KEY GRANT] Initiating key grant with parameters:', {
        eventId: event.id,
        lockAddress: event.lock_address,
        userAddress,
        chainId: event.chain_id,
        chainName: networkConfig.chain_name,
        rpcUrl: networkConfig.rpc_url.substring(0, 30) + '...'
      });

      // Grant the key using a reasonable expiration duration
      // Default to 30 days (30 * 24 * 60 * 60 = 2592000 seconds) if no specific duration
      const expirationDuration = 2592000; // 30 days in seconds
      
      const grantResult = await grantKeyToUser(
        event.lock_address,
        userAddress,
        expirationDuration,
        event.chain_id,
        networkConfig.rpc_url,
        transaction.id,
        supabase
      )

      if (grantResult.success) {
        console.log('🎉 [KEY GRANT] Key granted successfully!');
        console.log('📝 [KEY GRANT] Transaction hash:', grantResult.txHash);
        console.log('🎫 [KEY GRANT] Token ID:', grantResult.tokenId);
        
        // Calculate expiration date
        const expiresAt = new Date(Date.now() + (expirationDuration * 1000));
        
        // Create ticket record
        console.log('💾 [TICKET] Creating ticket record in database...');
        await supabase
          .from('tickets')
          .insert({
            event_id: transaction.event_id,
            owner_wallet: userAddress,
            payment_transaction_id: transaction.id,
            token_id: grantResult.tokenId,
            grant_tx_hash: grantResult.txHash,
            status: 'active',
            expires_at: expiresAt.toISOString()
          });
        console.log('✅ [TICKET] Ticket record created successfully');
        
        // Update transaction with grant details
        console.log('💾 [DB UPDATE] Updating transaction with grant details...');
        await supabase
          .from('paystack_transactions')
          .update({
            gateway_response: {
              ...webhookData.data,
              key_grant_tx_hash: grantResult.txHash,
              key_granted: true,
              key_granted_at: new Date().toISOString(),
              gas_used: grantResult.gasUsed,
              gas_price: grantResult.gasPrice,
              token_id: grantResult.tokenId
            }
          })
          .eq('reference', reference);
        console.log('✅ [DB UPDATE] Transaction updated with grant details');
      } else {
        console.error('❌ [KEY GRANT] Failed to grant key:', grantResult.error);
        console.error('❌ [KEY GRANT] Payment was successful but key granting failed');
        // Still continue - payment was successful, key granting is secondary
      }

    } catch (grantError) {
      console.error('❌ [KEY GRANT] Critical error in key granting process:', grantError);
      console.error('❌ [KEY GRANT] Error details:', grantError instanceof Error ? grantError.message : String(grantError));
      console.error('❌ [KEY GRANT] Stack trace:', grantError instanceof Error ? grantError.stack : 'No stack trace');
      // Don't fail the webhook - payment verification was successful
      // Key granting can be retried later if needed
    }

    console.log('✅ [WEBHOOK] Webhook processed successfully');
    console.log('🔔 [WEBHOOK] ========================================');
    return new Response('Webhook processed successfully', { 
      status: 200, 
      headers: corsHeaders 
    })

  } catch (error) {
    console.error('💥 [WEBHOOK] Critical webhook processing error:', error);
    console.error('💥 [WEBHOOK] Error details:', error instanceof Error ? error.message : String(error));
    console.error('💥 [WEBHOOK] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    return new Response('Internal server error', { 
      status: 500, 
      headers: corsHeaders 
    })
  }
})