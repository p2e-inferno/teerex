# Event Registration UX Enhancement Plan (Unified Strategy) - REVISED

This document outlines a robust approach to allow same-day events, manual registration control, and default registration closure, addressing critical security and logical holes.

## 1. Data Model Refinement
To avoid "ghost fields" and logical complexity with date/time strings, we establish a canonical `starts_at` timestamp.

### Database Schema (Migration)
**Directory:** `supabase/migrations/`  
```sql
-- Add starts_at (canonical start time) and registration_cutoff
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS registration_cutoff TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.event_drafts 
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS registration_cutoff TIMESTAMP WITH TIME ZONE;

-- Populate starts_at for legacy events (fallback to ISO date at midnight)
UPDATE public.events 
SET starts_at = (date::date + time::time)::timestamp AT TIME ZONE 'UTC'
WHERE starts_at IS NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_events_registration_cutoff ON public.events (registration_cutoff);
```

## 2. Backend Enforcement (Blocking Holes)

### `init-paystack-transaction` Logic
**File:** `supabase/functions/init-paystack-transaction/index.ts`  
Select `registration_cutoff` and enforce closure during payment initiation.
```typescript
const { data: ev, error: evErr } = await supabase
  .from('events')
  .select('id, ..., registration_cutoff, starts_at') // Added timing fields
  .eq('id', eventId)
  .maybeSingle();

const cutoff = ev.registration_cutoff ? new Date(ev.registration_cutoff) : new Date(ev.starts_at);
if (new Date() > cutoff) {
  return new Response(JSON.stringify({ error: 'registration_closed' }), { status: 400 });
}
```

## 3. Frontend Implementation

### `lockUtils.ts` Helpers
Implement `updateLockConfig` to control on-chain purchases effectively.
```typescript
export async function updateLockPurchasability(
  lockAddress: string, 
  isClosed: boolean, 
  originalCapacity: number,
  wallet: any,
  chainId: number
) {
  const provider = await wallet.getEthersProvider();
  const signer = await provider.getSigner();
  const lock = new ethers.Contract(lockAddress, PublicLockABI, signer);

  // Fetch current config to avoid overwriting other fields
  const expiration = await lock.expirationDuration();
  const keysPerAcc = await lock.maxKeysPerAddress();
  const currentSupply = await lock.totalSupply();

  const newMaxKeys = isClosed ? currentSupply : originalCapacity;
  
  const tx = await lock.updateLockConfig(expiration, newMaxKeys, keysPerAcc);
  return await tx.wait();
}
```

### `EventManagementDialog.tsx` (Manual Toggle)
Correct auth headers and refined re-open logic.
```typescript
const handleToggleRegistration = async (isClosing: boolean) => {
  setIsUpdating(true);
  try {
    // 1. Transaction to stop/start on-chain purchases
    await updateLockPurchasability(event.lock_address, isClosing, event.capacity, wallets[0], event.chain_id);

    // 2. Update Database via Edge Function
    const accessToken = await getAccessToken?.();
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    // Re-open logic: if within 1h of start, set cutoff to starts_at
    const defaultCutoff = new Date(new Date(event.starts_at).getTime() - 3600000);
    const reOpenCutoff = new Date() > defaultCutoff ? event.starts_at : defaultCutoff.toISOString();

    const newCutoff = isClosing ? new Date().toISOString() : reOpenCutoff;

    await supabase.functions.invoke('update-event', {
      body: { eventId: event.id, formData: { registration_cutoff: newCutoff } },
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'X-Privy-Authorization': `Bearer ${accessToken}`
      }
    });
  } finally {
    setIsUpdating(false);
  }
};
```

## 4. Default Behavior (Edge Functions)
**File:** `supabase/functions/create-event/index.ts`  
Ensure `starts_at` and `registration_cutoff` are generated on publication.
```typescript
const startsAt = new Date(`${date}T${time}`).toISOString();
const defaultCutoff = new Date(new Date(startsAt).getTime() - 3600000).toISOString();

const eventData = {
    // ...
    starts_at: startsAt,
    registration_cutoff: defaultCutoff,
};
```

## 5. Implementation Checklist
- [ ] SQL Migration: Add `starts_at` and `registration_cutoff` + index.
- [ ] `src/types/event.ts`: Update `PublishedEvent` to include non-optional `starts_at`.
- [ ] `lockUtils.ts`: Implement `updateLockPurchasability` using `updateLockConfig`.
- [ ] `EventBasicInfo.tsx`: Allow "today" in date picker.
- [ ] `create-event`: Store `starts_at` and calculated `registration_cutoff`.
- [ ] `init-paystack-transaction`: Block initiation if `now > registration_cutoff`.
- [ ] `EventManagementDialog.tsx`: Implement toggle with fixed auth and re-open logic.
- [ ] `EventDetails.tsx`: Update button state using `registration_cutoff`.
