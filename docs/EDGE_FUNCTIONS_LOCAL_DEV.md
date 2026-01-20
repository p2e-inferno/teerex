# Running Edge Functions Locally

## Quick Start

1. **Start Supabase** (if not already running):
   ```bash
   supabase start
   ```

2. **Set up environment variables** in `.env.local`:
   - Most values are pre-filled from `supabase start` output
   - Fill in the missing sensitive values (see below)

3. **Serve a specific function**:
   ```bash
   supabase functions serve <function-name> --env-file .env.local
   ```

4. **Serve all functions**:
   ```bash
   supabase functions serve --env-file .env.local
   ```

## Environment Variables Reference

### Required Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `SUPABASE_URL` | Local Supabase API URL | Output from `supabase start` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypass RLS) | Output from `supabase start` |
| `VITE_PRIVY_APP_ID` | Privy application ID | Already in `.env` |
| `UNLOCK_SERVICE_PRIVATE_KEY` | Private key for gasless txs | Create test wallet or use existing |
| `DIVVI_CONSUMER_ADDRESS` | Divvi referral tracking | Already in `.env` |

### Optional Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `PRIVY_VERIFICATION_KEY` | JWT verification fallback | All authenticated endpoints |
| `PAYSTACK_SECRET_KEY` | Paystack API secret | Fiat payment functions |

## Getting Missing Values

### 1. PRIVY_VERIFICATION_KEY
- Go to [Privy Dashboard](https://dashboard.privy.io)
- Navigate to **Settings** > **API Keys**
- Copy the **Verification Key** (starts with `-----BEGIN PUBLIC KEY-----`)

### 2. UNLOCK_SERVICE_PRIVATE_KEY
For local development, you can:
- **Option A**: Create a new test wallet
  ```bash
  # Generate using Node.js
  node -e "const ethers = require('ethers'); const wallet = ethers.Wallet.createRandom(); console.log('Address:', wallet.address); console.log('Private Key:', wallet.privateKey);"
  ```
- **Option B**: Use an existing test wallet private key
- **Important**: Fund this wallet with Base Sepolia testnet ETH for gasless transactions

### 3. PAYSTACK_SECRET_KEY (Optional)
- Go to [Paystack Dashboard](https://dashboard.paystack.com)
- Navigate to **Settings** > **API Keys & Webhooks**
- Copy the **Test Secret Key** (starts with `sk_test_`)
- Only needed for testing fiat payment functions

## Running Specific Functions

### Test a function locally:
```bash
# Example: Test the is-admin function
supabase functions serve is-admin --env-file .env.local

# In another terminal, call it:
curl -i http://127.0.0.1:54321/functions/v1/is-admin \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "X-Privy-Authorization: Bearer YOUR_PRIVY_TOKEN"
```

### Common Functions to Test

**Admin Functions:**
```bash
supabase functions serve is-admin --env-file .env.local
```

**Gasless Functions:**
```bash
supabase functions serve gasless-purchase --env-file .env.local
supabase functions serve gasless-deploy-lock --env-file .env.local
```

**Payment Functions:**
```bash
supabase functions serve init-paystack-transaction --env-file .env.local
supabase functions serve paystack-grant-keys --env-file .env.local
```

**Attestation Functions:**
```bash
supabase functions serve eas-gasless-attestation --env-file .env.local
```

## Debugging

### Enable Debug Logging
Add `--debug` flag:
```bash
supabase functions serve my-function --env-file .env.local --debug
```

### Inspect Function Logs
```bash
supabase functions logs <function-name>
```

### Common Issues

**1. "Missing X-Privy-Authorization header"**
- Functions require authenticated requests
- Get a Privy token by logging into the frontend
- Pass it in the `X-Privy-Authorization` header

**2. "UNLOCK_SERVICE_PRIVATE_KEY not set"**
- Add your service wallet private key to `.env.local`
- Ensure the wallet has testnet ETH on Base Sepolia

**3. "Function not found"**
- Check function name matches directory name in `supabase/functions/`
- Use `supabase functions list` to see all available functions

**4. Port already in use**
- Default port is 54321 (but we're using 54331 for main API)
- Specify custom port: `--port 54335`

## Testing with Frontend

1. **Start edge functions**:
   ```bash
   supabase functions serve --env-file .env.local
   ```

2. **Start dev server** (in another terminal):
   ```bash
   npm run dev
   ```

3. **Access frontend**:
   - Open http://localhost:8080
   - Functions will be called automatically at http://127.0.0.1:54331/functions/v1/

## Production Deployment

When deploying to production, set secrets using:
```bash
# Set individual secrets
supabase secrets set UNLOCK_SERVICE_PRIVATE_KEY=your_key_here
supabase secrets set PRIVY_VERIFICATION_KEY="-----BEGIN PUBLIC KEY-----..."
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...

# List all secrets
supabase secrets list

# Deploy specific function
supabase functions deploy function-name
```

## Best Practices

1. **Never commit `.env.local`** - It's already in `.gitignore`
2. **Use test credentials** for local development
3. **Fund service wallet** with testnet ETH only
4. **Rotate keys regularly** in production
5. **Use different Paystack keys** for test vs production

## Quick Reference

| Command | Description |
|---------|-------------|
| `supabase functions list` | List all functions |
| `supabase functions serve` | Serve all functions |
| `supabase functions serve <name>` | Serve specific function |
| `supabase functions deploy <name>` | Deploy to production |
| `supabase secrets list` | List production secrets |
| `supabase secrets set KEY=value` | Set production secret |
