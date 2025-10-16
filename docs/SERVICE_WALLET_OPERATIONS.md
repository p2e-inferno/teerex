Service Wallet Operations (Secure Pattern)

Overview
- All operations that require the service wallet (e.g., adding/removing managers, granting keys) must run on the server, inside Supabase Edge Functions.
- Clients authenticate with Privy; Supabase platform verification remains enabled.

Headers
- Authorization: Bearer <VITE_SUPABASE_ANON_KEY>
  - Satisfies Supabase verify_jwt at the platform layer.
- X-Privy-Authorization: Bearer <Privy access token>
  - Short‑lived token used by the function to authenticate the user against Privy.

Function Requirements
- Authentication:
  - Verify Privy token via JWKS with app‑specific endpoint and 3s timeout, then fallback to local key via importSPKI.
- Authorization:
  - Allow only event admins: event.creator_id equals Privy DID, or
  - Allow lock admins: user’s wallet (from Privy API) is an on‑chain lock manager for the relevant lock.
- Execution:
  - Use UNLOCK_SERVICE_PRIVATE_KEY only in the Edge Function.
  - Never expose private keys to clients; never return secrets.

CORS
- Include x-privy-authorization in Access-Control-Allow-Headers.
- Respond to OPTIONS by echoing Access-Control-Request-Headers to handle strict browsers.

Client Example (supabase-js)
```
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const accessToken = await getAccessToken();

await supabase.functions.invoke('paystack-grant-keys', {
  body: { transactionReference },
  headers: {
    Authorization: `Bearer ${anonKey}`,
    'X-Privy-Authorization': `Bearer ${accessToken}`,
  },
});
```

Do Nots
- Do not fetch or use UNLOCK_SERVICE_PRIVATE_KEY in the client.
- Do not rely on multiple Authorization headers; use X-Privy-Authorization for Privy.
- Do not trust client‑provided admin claims; verify against DB and/or chain.

Checklist
- [ ] verify_jwt enabled for browser‑invoked functions
- [ ] Privy verification (JWKS + fallback)
- [ ] Event/lock authorization checks
- [ ] Service wallet logic contained server‑side
- [ ] CORS preflight and header allowance
