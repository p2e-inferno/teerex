import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { ethers } from "https://esm.sh/ethers@6.14.4"
import { corsHeaders, buildPreflightHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildPreflightHeaders(req) })
  }

  try {
    // Get the unlock service private key from environment
    const unlockServicePrivateKey = Deno.env.get('UNLOCK_SERVICE_PRIVATE_KEY')
    
    if (!unlockServicePrivateKey) {
      throw new Error('UNLOCK_SERVICE_PRIVATE_KEY not configured')
    }

    // Create wallet from private key to get the public address
    const wallet = new ethers.Wallet(unlockServicePrivateKey)
    const serviceAddress = wallet.address

    console.log('Service address retrieved:', serviceAddress)

    return new Response(
      JSON.stringify({ 
        success: true,
        address: serviceAddress
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error getting service address:', error)
    
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
