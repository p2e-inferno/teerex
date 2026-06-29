-- Payout destination for fiat-sold listings + contact email for payout-account notifications.
--
-- payout_destination decides where a fiat (Paystack) sale settles:
--   'seller'   -> the seller's verified payout subaccount (split). If the seller has no verified
--                 account at purchase time, the sale is BLOCKED (no silent fallback to platform).
--   'platform' -> proceeds settle to the platform account directly (no subaccount split). Used for
--                 platform-run / admin / community listings where the platform legitimately collects.
--
-- This single concept both (a) removes the silent platform fallback that could strand a seller's
-- funds, and (b) lets creators/vendors/organizers deliberately route proceeds to the platform.

-- ---------------------------------------------------------------------------
-- 1. events
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS payout_destination TEXT NOT NULL DEFAULT 'seller'
    CHECK (payout_destination IN ('seller', 'platform'));

COMMENT ON COLUMN public.events.payout_destination IS
  'Where fiat ticket sales settle: seller (verified subaccount, blocks if absent) or platform.';

-- Backfill existing events to preserve their CURRENT effective routing exactly:
--   - creator has a verified payout account today -> sales split to them -> 'seller' (the default).
--   - creator has no verified account today        -> sales fell back to platform -> 'platform'.
-- This prevents the new purchase-time gate from blocking live events on deploy.
UPDATE public.events e
SET payout_destination = 'platform'
WHERE e.payout_destination = 'seller'
  AND NOT EXISTS (
    SELECT 1 FROM public.vendor_payout_accounts vpa
    WHERE vpa.vendor_id = e.creator_id
      AND vpa.provider = 'paystack'
      AND vpa.status = 'verified'
  );

-- ---------------------------------------------------------------------------
-- 2. ticket_passes
-- ---------------------------------------------------------------------------
ALTER TABLE public.ticket_passes
  ADD COLUMN IF NOT EXISTS payout_destination TEXT NOT NULL DEFAULT 'seller'
    CHECK (payout_destination IN ('seller', 'platform'));

COMMENT ON COLUMN public.ticket_passes.payout_destination IS
  'Where fiat pass sales settle: seller (verified subaccount, blocks if absent) or platform.';

-- ---------------------------------------------------------------------------
-- 3. gaming_bundles
-- ---------------------------------------------------------------------------
ALTER TABLE public.gaming_bundles
  ADD COLUMN IF NOT EXISTS payout_destination TEXT NOT NULL DEFAULT 'seller'
    CHECK (payout_destination IN ('seller', 'platform'));

COMMENT ON COLUMN public.gaming_bundles.payout_destination IS
  'Where fiat bundle sales settle: seller (verified subaccount, blocks if absent) or platform.';

-- ---------------------------------------------------------------------------
-- 4. vendor_payout_accounts.contact_email
-- ---------------------------------------------------------------------------
-- Used to notify the seller when their payout account is suspended / unsuspended so they are not
-- blind to a status change that stops their fiat sales.
ALTER TABLE public.vendor_payout_accounts
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

COMMENT ON COLUMN public.vendor_payout_accounts.contact_email IS
  'Optional contact email captured at submission; used for suspend/unsuspend notifications.';
