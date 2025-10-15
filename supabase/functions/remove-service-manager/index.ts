import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'
import { ethers } from "https://esm.sh/ethers@6.14.4"
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const UNLOCK_SERVICE_PRIVATE_KEY = Deno.env.get('UNLOCK_SERVICE_PRIVATE_KEY')!

// PublicLock ABI for renounceLockManager
const PublicLockABI = [
  {
    "inputs": [],
    "name": "renounceLockManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_account", "type": "address" }],
    "name": "isLockManager",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  }
]

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    // Create Supabase client with service role for auth verification
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Get request body
    const { eventId } = await req.json()
    
    if (!eventId) {
      throw new Error('Event ID is required')
    }

    // Fetch event details
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      throw new Error('Event not found')
    }

    // Verify user is the event creator
    if (event.creator_id !== user.id) {
      throw new Error('Only the event creator can remove the service manager')
    }

    // Get the service wallet
    const serviceWallet = new ethers.Wallet(UNLOCK_SERVICE_PRIVATE_KEY)
    console.log('Service wallet address:', serviceWallet.address)

    // Connect to Base Sepolia
    const rpcUrl = 'https://sepolia.base.org'
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const connectedWallet = serviceWallet.connect(provider)

    // Create lock contract instance
    const lockContract = new ethers.Contract(
      event.lock_address,
      PublicLockABI,
      connectedWallet
    )

    // Verify service wallet is currently a lock manager
    const isManager = await lockContract.isLockManager(serviceWallet.address)
    if (!isManager) {
      throw new Error('Service wallet is not a lock manager for this event')
    }

    // Verify the user's wallet is also a lock manager (security check)
    // We need to get user's wallet address - for now we'll trust the creator_id check
    // In production, you might want additional verification

    console.log('Renouncing lock manager role for lock:', event.lock_address)

    // Call renounceLockManager
    const tx = await lockContract.renounceLockManager()
    console.log('Transaction sent:', tx.hash)

    const receipt = await tx.wait()
    console.log('Transaction confirmed:', receipt.transactionHash)

    if (receipt.status !== 1) {
      throw new Error('Transaction failed')
    }

    // Update the database
    const { error: updateError } = await supabaseAdmin
      .from('events')
      .update({ service_manager_added: false })
      .eq('id', eventId)

    if (updateError) {
      console.error('Failed to update database:', updateError)
      // Transaction succeeded but DB update failed - log for manual reconciliation
    }

    return new Response(
      JSON.stringify({
        success: true,
        transactionHash: receipt.transactionHash,
        message: 'Service manager removed successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error removing service manager:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
