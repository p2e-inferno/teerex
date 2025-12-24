# Divvi Debug Test Edge Function

## Purpose

This edge function isolates and diagnoses Divvi SDK issues in the Deno runtime without affecting production code.

## What It Tests

1. ✅ Environment configuration (`DIVVI_CONSUMER_ADDRESS`)
2. ✅ SDK loading via `npm:` protocol
3. ✅ SDK loading via `esm.sh` CDN
4. ✅ SDK function availability (`getReferralTag`, `submitReferral`)
5. ✅ Tag generation with real parameters
6. ✅ Tag structure validation (hex format, length encoding)
7. ✅ Tag consistency (multiple calls with same params)
8. ✅ Multi-user tag generation
9. ✅ Calldata appending simulation

## Running the Test

### Local Testing (Recommended)

```bash
# Start Supabase locally
supabase start

# Serve the function
supabase functions serve divvi-debug-test --env-file .env.local --no-verify-jwt

# In another terminal, test it
curl -X POST http://localhost:54321/functions/v1/divvi-debug-test \
  -H "Content-Type: application/json" \
  -d '{"testUser": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"}'
```

### Remote Testing (Supabase Cloud)

```bash
# Deploy the function
supabase functions deploy divvi-debug-test

# Test it
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/divvi-debug-test \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"testUser": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"}'
```

## Interpreting Results

### Success Scenario

```json
{
  "success": true,
  "summary": {
    "total_steps": 11,
    "errors": 0,
    "warnings": 0,
    "sdk_source": "esm.sh",
    "tag_valid": true
  },
  "diagnosis": {
    "sdk_loading": "esm.sh",
    "tag_generation": "available",
    "tag_validation": "valid",
    "recommendation": "SDK appears to be working correctly..."
  }
}
```

### Failure Scenario (Current Issue)

```json
{
  "success": false,
  "summary": {
    "errors": 1,
    "warnings": 0,
    "sdk_source": "npm",
    "tag_valid": false
  },
  "diagnosis": {
    "tag_validation": "INVALID - length mismatch",
    "recommendation": "SDK is generating malformed tags. This is the root cause..."
  }
}
```

## Key Indicators to Look For

### 1. SDK Loading
Check the `sdk_load_npm` and `sdk_load_esm` steps:

```json
{
  "step": "sdk_load_npm",
  "status": "success|error",
  "data": {
    "has_getReferralTag": true,
    "has_submitReferral": true,
    "keys": ["getReferralTag", "submitReferral", ...]
  }
}
```

**What to check:**
- ✅ `status: "success"` - Import worked
- ✅ `has_getReferralTag: true` - Function exists
- ❌ `has_getReferralTag: false` - **SDK is broken**

### 2. Tag Structure
Check the `tag_analysis` step:

```json
{
  "step": "tag_analysis",
  "data": {
    "tag_byte_length": 68,
    "last_4_bytes_hex": "00000044",
    "encoded_length_value": 68,
    "length_mismatch": false
  }
}
```

**What to check:**
- ✅ `length_mismatch: false` - Tag is valid
- ❌ `length_mismatch: true` - **This is the bug!**
- ✅ `encoded_length_value <= tag_byte_length` - Correct encoding
- ❌ `encoded_length_value > tag_byte_length` - **Malformed tag**

### 3. Tag Consistency
Check the `tag_consistency` step:

```json
{
  "step": "tag_consistency",
  "data": {
    "all_identical": true,
    "tags": ["0x...", "0x...", "0x..."]
  }
}
```

**What to check:**
- ✅ `all_identical: true` - Deterministic (good)
- ⚠️ `all_identical: false` - Non-deterministic (SDK issue)

## Common Issues and Solutions

### Issue 1: npm: Import Fails

**Symptom:**
```json
{
  "step": "sdk_load_npm",
  "status": "error",
  "data": {
    "error_message": "Module not found..."
  }
}
```

**Solution:** This is expected. Deno's npm: protocol may not work for all packages. Check if `esm.sh` import succeeds.

### Issue 2: Both Imports Fail

**Symptom:**
```json
{
  "step": "sdk_selection",
  "status": "error",
  "message": "Both SDK imports failed"
}
```

**Solution:**
1. Check network connectivity from Edge Functions
2. Verify @divvi/referral-sdk@2.3.0 exists on npm
3. Try different SDK version

### Issue 3: Tag Length Mismatch (THE BUG)

**Symptom:**
```json
{
  "step": "tag_analysis",
  "data": {
    "length_mismatch": true,
    "encoded_length_value": 255,
    "tag_byte_length": 68
  }
}
```

**Solution:**
This confirms the SDK is generating malformed tags. Options:
1. Use different import method (esm.sh vs npm)
2. Try different SDK version
3. Report bug to Divvi
4. Implement static import (see FIX_PROPOSAL_DIVVI.md)

### Issue 4: SDK Missing Functions

**Symptom:**
```json
{
  "step": "sdk_validation",
  "status": "error",
  "data": {
    "has_getReferralTag": false
  }
}
```

**Solution:**
SDK loaded but incomplete. Check:
- Are you using the right SDK version?
- Is the import path correct?
- Does the SDK have Deno-specific build?

## Next Steps Based on Results

### If npm: Works
- Update `supabase/functions/_shared/divvi.ts` to use npm: import only
- Remove esm.sh fallback

### If esm.sh Works
- Update `supabase/functions/_shared/divvi.ts` to use esm.sh import only
- Remove npm: attempt

### If Both Fail
- Check Supabase function logs for network/firewall issues
- Verify SDK version exists
- Contact Divvi support

### If Tag Length Mismatch Detected
- **This is the bug causing your error**
- Test with different SDK version (2.2.x, 2.1.x)
- Report to Divvi with test results
- Implement workaround (disable server-side Divvi temporarily)

## Viewing Detailed Logs

The function outputs detailed logs to console. View them:

**Local:**
```bash
# Logs appear in terminal where you ran `supabase functions serve`
```

**Remote:**
```bash
# View in Supabase Dashboard
Dashboard → Edge Functions → divvi-debug-test → Logs

# Or via CLI
supabase functions logs divvi-debug-test --follow
```

## Cleanup

After debugging, you can:

1. **Keep the function** (for future testing)
2. **Delete the function:**
   ```bash
   rm -rf supabase/functions/divvi-debug-test
   ```

## Example Full Output

See example successful and failing outputs in `./example-outputs/` (if we create them).

## Questions?

If you're seeing unexpected results, capture:
1. Full JSON response
2. Console logs
3. SDK version being tested
4. Deno version (`deno --version`)

Then compare against expected behavior in this README.
