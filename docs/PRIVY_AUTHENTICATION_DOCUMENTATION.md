# Privy Authentication Implementation Documentation

## Overview

This document provides comprehensive documentation of the Privy authentication implementation across Supabase Edge Functions in the Teerex project. It covers the authentication patterns, differences between functions, and technical details for future reference.

## Table of Contents

1. [Authentication Architecture](#authentication-architecture)
2. [Function Comparison](#function-comparison)
3. [Technical Implementation Details](#technical-implementation-details)
4. [Environment Variables](#environment-variables)
5. [Error Handling](#error-handling)
6. [Troubleshooting History](#troubleshooting-history)
7. [Best Practices](#best-practices)

## Authentication Architecture

### Primary Authentication Method: JWKS Endpoint

Both functions use Privy's app-specific JWKS endpoint for JWT verification:

```typescript
const JWKS = createRemoteJWKSet(
  new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`)
);
const { payload } = await jwtVerify(token, JWKS, {
  issuer: "privy.io",
  audience: PRIVY_APP_ID,
});
```

### Fallback Authentication Method: Local Verification Key

If JWKS verification fails, both functions fall back to local JWT verification:

```typescript
const publicKey = await importSPKI(PRIVY_VERIFICATION_KEY, "ES256");
const { payload } = await jwtVerify(token, publicKey, {
  issuer: "privy.io",
  audience: PRIVY_APP_ID,
});
```

### Timeout Handling

Both functions implement a 3-second timeout for JWKS verification to prevent hanging requests:

```typescript
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(
    () => reject(new Error("JWKS verification timeout after 3 seconds")),
    3000
  );
});

const payload = await Promise.race([jwksPromise, timeoutPromise]);
```

## Function Comparison

### `remove-service-manager` Function

**Purpose**: Remove a service wallet as a lock manager from an event

**Authentication Flow**:

1. ✅ JWT verification (JWKS + fallback)
2. ✅ Database authorization (event creator check)
3. ❌ No Privy API call needed
4. ❌ No App Secret required

**Authorization Method**:

```typescript
// Verify user is the event creator
if (event.creator_id !== privyUserId) {
  throw new Error("Only the event creator can remove the service manager");
}
```

**Key Characteristics**:

- Uses `PRIVY_APP_ID` and `PRIVY_VERIFICATION_KEY`
- Does NOT use `PRIVY_APP_SECRET`
- Database-level authorization only
- No blockchain verification for user's wallet

### `update-event` Function

**Purpose**: Update event details (title, description, date, etc.)

**Authentication Flow**:

1. ✅ JWT verification (JWKS + fallback)
2. ✅ Privy API call to fetch user details
3. ✅ Blockchain authorization (lock manager check)
4. ✅ App Secret required

**Authorization Method**:

```typescript
// Fetch user's wallet address from Privy API
const privyApiResponse = await fetch(
  `https://auth.privy.io/api/v1/users/${privyUserId}`,
  {
    headers: {
      "privy-app-id": PRIVY_APP_ID,
      Authorization: "Basic " + btoa(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`),
    },
  }
);

// Check if user is a lock manager on-chain
const isManager = await lockContract.isLockManager(userWalletAddress);
```

**Key Characteristics**:

- Uses `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, and `PRIVY_VERIFICATION_KEY`
- Makes server-to-server API calls to Privy
- Blockchain-level authorization
- Requires user's wallet address

## Technical Implementation Details

### JWT Token Structure

Privy access tokens are ES256 JWTs with the following claims:

- **`sub`**: User's Privy DID (e.g., `did:privy:cmgs7upe9001cl10ckx2cd6sj`)
- **`iss`**: Token issuer (`privy.io`)
- **`aud`**: Your Privy app ID
- **`iat`**: Issued at timestamp
- **`exp`**: Expiration timestamp (typically 1 hour)
- **`sid`**: Session ID

### JWKS Endpoint Analysis

The app-specific JWKS endpoint provides:

- **Two ES256 keys** with different `kid` values
- **P-256 curve** (standard for ES256)
- **Proper key usage** (`"use":"sig"`)
- **Algorithm specification** (`"alg":"ES256"`)

### Verification Methods

#### Method 1: Privy SDK (Not Used)

```typescript
const privy = new PrivyClient({
  appId: "your-privy-app-id",
  apiKey: "your-privy-api-key", // App Secret
});

const verifiedClaims = await privy.utils().auth().verifyAuthToken(authToken);
```

#### Method 2: Direct JWT Verification (Current Implementation)

```typescript
const verificationKey = await jose.importSPKI(
  "insert-your-privy-verification-key",
  "ES256"
);

const payload = await jose.jwtVerify(accessToken, verificationKey, {
  issuer: "privy.io",
  audience: "insert-your-privy-app-id",
});
```

## Environment Variables

### Required Variables

| Variable                     | Purpose                               | Used By                       | Required For            |
| ---------------------------- | ------------------------------------- | ----------------------------- | ----------------------- |
| `VITE_PRIVY_APP_ID`          | Privy application ID                  | Both functions                | JWT verification        |
| `PRIVY_VERIFICATION_KEY`     | ES256 public key for JWT verification | Both functions                | Fallback verification   |
| `PRIVY_APP_SECRET`           | API secret for server-to-server calls | `update-event` only           | Privy API calls         |
| `SUPABASE_URL`               | Supabase project URL                  | Both functions                | Database operations     |
| `SUPABASE_SERVICE_ROLE_KEY`  | Service role key                      | Both functions                | Database operations     |
| `UNLOCK_SERVICE_PRIVATE_KEY` | Service wallet private key            | `remove-service-manager` only | Blockchain transactions |

### Variable Sources

- **`VITE_PRIVY_APP_ID`**: From Privy Dashboard → App Settings
- **`PRIVY_VERIFICATION_KEY`**: From Privy Dashboard → Configuration → App settings
- **`PRIVY_APP_SECRET`**: From Privy Dashboard → App Settings
- **`UNLOCK_SERVICE_PRIVATE_KEY`**: Generated Ethereum private key

## Error Handling

### JWT Verification Errors

```typescript
try {
  // JWT verification logic
} catch (jwksError) {
  console.warn("JWKS verification failed, trying local JWT fallback:", jwksError.message);
  // Fallback logic
} catch (localVerifyError) {
  console.error("Both JWKS and local JWT verification failed:", localVerifyError.message);
  throw new Error("Token verification failed. Please log in again.");
}
```

### Specific Error Codes

- **`ERR_JWT_EXPIRED`**: Token has expired
- **`ERR_JWT_*`**: Various JWT validation errors
- **JWKS timeout**: Network issues or slow response

### Error Response Format

```typescript
return new Response(JSON.stringify({ error: error.message }), {
  headers: { ...corsHeaders, "Content-Type": "application/json" },
  status: 401, // or appropriate status code
});
```

## Troubleshooting History

### Issue 1: Initial 401 Errors

**Problem**: Functions were using `supabaseAdmin.auth.getUser()` with Privy JWT tokens
**Solution**: Implemented proper Privy JWT verification using `jose` library

### Issue 2: Module Not Found Error

**Problem**: Attempted to use `@privy-io/node` package not available on ESM.sh
**Solution**: Reverted to `@privy-io/server-auth` package

### Issue 3: 500 Error on OPTIONS Request

**Problem**: `PrivyClient` import was causing function startup failures
**Solution**: Removed `PrivyClient` and implemented direct JWT verification

### Issue 4: JWKS Endpoint Reliability

**Problem**: Generic JWKS endpoint was unreliable
**Solution**: Implemented app-specific JWKS endpoint with timeout and fallback

### Current Status

✅ **Resolved**: All authentication issues have been resolved
✅ **Production Ready**: Implementation follows Privy's official documentation
✅ **Robust**: Includes timeout handling and fallback mechanisms

## Best Practices

### 1. Authentication Flow

- Always use JWKS endpoint as primary method
- Implement local verification key as fallback
- Include timeout handling for network requests
- Use app-specific JWKS endpoint for better reliability

### 2. Error Handling

- Log detailed error information for debugging
- Provide clear error messages to clients
- Handle both JWT and network errors gracefully
- Implement proper HTTP status codes

### 3. Security Considerations

- Never expose private keys in client-side code
- Use environment variables for sensitive data
- Validate JWT claims (issuer, audience, expiration)
- Implement proper CORS headers

### 4. Performance Optimization

- Use timeout for external API calls
- Cache verification keys when possible
- Implement proper error logging
- Monitor authentication success rates

## Dual-Token Mode (Supabase verify_jwt enabled)

In some deployments you may want Supabase's platform JWT verification left enabled (`verify_jwt = true`) while still authenticating your users with Privy. This is fully supported with a dual‑token pattern:

### Headers to Send (from the Browser)

- `Authorization: Bearer <VITE_SUPABASE_ANON_KEY>`
  - Purpose: Satisfies Supabase's platform‐level JWT verification.
  - Note: The anon key is a public, long‑lived Supabase JWT. Never send the service role key from the client.
- `X-Privy-Authorization: Bearer <PRIVY_ACCESS_TOKEN>`
  - Purpose: Carries the short‑lived Privy access token for your function to verify via JWKS/local key.

Example (supabase-js edge function invoke):

```ts
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const accessToken = await getAccessToken();

const { data, error } = await supabase.functions.invoke('remove-service-manager', {
  body: { eventId },
  headers: {
    Authorization: `Bearer ${anonKey}`,
    'X-Privy-Authorization': `Bearer ${accessToken}`,
  },
});
```

### Edge Function Changes

- Read the Privy token from `X-Privy-Authorization` instead of `Authorization`:

```ts
const authHeader = req.headers.get('X-Privy-Authorization');
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return new Response(JSON.stringify({ error: 'Missing or invalid X-Privy-Authorization header' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 401,
  });
}
const token = authHeader.split(' ')[1];
// Proceed with Privy JWT verification (JWKS + fallback)
```

### CORS Requirements

- Allow the custom header in CORS responses:
  - `Access-Control-Allow-Headers` must include `x-privy-authorization`.
- For stricter browsers, echo the requested headers on preflight:

```ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-privy-authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const buildPreflightHeaders = (req: Request) => {
  const requested = req.headers.get('Access-Control-Request-Headers');
  const allowHeaders = requested?.length ? requested : corsHeaders['Access-Control-Allow-Headers'];
  return { ...corsHeaders, 'Access-Control-Allow-Headers': allowHeaders } as Record<string, string>;
};

// In each function
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: buildPreflightHeaders(req) });
}
```

### Supabase Configuration

- Keep `verify_jwt = true` for Privy‑protected functions when using this dual‑token pattern.
  - Platform verification uses the `Authorization` header (anon key).
  - Your function verifies the user via the Privy token in `X-Privy-Authorization`.

### Troubleshooting

- Browser shows: “Request header field x-privy-authorization is not allowed by Access-Control-Allow-Headers”
  - Ensure your preflight (OPTIONS) response includes `x-privy-authorization` in `Access-Control-Allow-Headers`, or echoes `Access-Control-Request-Headers`.
  - Redeploy functions after CORS updates.
- 401 from platform before your code runs
  - Confirm `Authorization` carries the Supabase anon key (not the Privy token).
- JWT verification errors in your function
  - Check JWKS availability, fallback key, `VITE_PRIVY_APP_ID`, and `PRIVY_VERIFICATION_KEY` values.

## References

- [Privy Access Token Documentation](https://docs.privy.io/authentication/user-authentication/access-tokens#verifying-the-access-token)
- [Privy JWKS Endpoint](https://auth.privy.io/api/v1/apps/cmej8io60004ll50bdu7eug1n/jwks.json)
- [JOSE Library Documentation](https://github.com/panva/jose)
- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)

## Maintenance Notes

- Monitor JWKS endpoint availability
- Update verification keys if rotated by Privy
- Test authentication flow after any Privy updates
- Keep `jose` library updated for security patches
- Review error logs regularly for authentication issues

---

**Last Updated**: January 2025
**Version**: 1.0
**Status**: Production Ready
