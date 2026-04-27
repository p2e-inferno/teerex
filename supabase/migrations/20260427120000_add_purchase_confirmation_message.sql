-- Custom purchase confirmation message for events.
-- Adds an optional rich-text message that creators can show after a successful
-- ticket purchase or claim. Draft text stays on drafts, the mutable current
-- message lives in a private table, and a per-ticket snapshot captures the
-- version delivered to each attendee.

-- Sane upper bound for the rich-text HTML payload. Keeps DB rows small and
-- bounds payload size on edge functions / emails. Matches the documented
-- 5,000–10,000 char range for the feature.
DO $$ BEGIN
  PERFORM 1;
END $$;

ALTER TABLE public.event_drafts
  ADD COLUMN IF NOT EXISTS purchase_confirmation_message TEXT;

CREATE TABLE IF NOT EXISTS public.event_purchase_messages (
  event_id UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  message_html TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT event_purchase_messages_message_length CHECK (length(message_html) <= 10000)
);

ALTER TABLE public.event_purchase_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'purchase_confirmation_message'
  ) THEN
    EXECUTE $copy$
      INSERT INTO public.event_purchase_messages (event_id, message_html, updated_by, created_at, updated_at)
      SELECT id, purchase_confirmation_message, creator_id, now(), now()
      FROM public.events
      WHERE purchase_confirmation_message IS NOT NULL
      ON CONFLICT (event_id) DO UPDATE
        SET message_html = EXCLUDED.message_html,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
    $copy$;

    ALTER TABLE public.events
      DROP CONSTRAINT IF EXISTS events_purchase_confirmation_message_length;
    ALTER TABLE public.events
      DROP COLUMN IF EXISTS purchase_confirmation_message;
  END IF;
END $$;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS purchase_confirmation_message_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS purchase_confirmation_message_snapshot_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.event_drafts.purchase_confirmation_message
  IS 'Draft value for the event purchase confirmation message.';
COMMENT ON TABLE public.event_purchase_messages
  IS 'Private current purchase confirmation message for each event. Read and written through service-role edge functions only.';
COMMENT ON COLUMN public.event_purchase_messages.message_html
  IS 'Optional rich-text (sanitized HTML) message shown after a successful ticket purchase. Editable by the event creator.';
COMMENT ON COLUMN public.tickets.purchase_confirmation_message_snapshot
  IS 'Snapshot of the event purchase_confirmation_message captured at ticket issuance time.';
COMMENT ON COLUMN public.tickets.purchase_confirmation_message_snapshot_at
  IS 'Timestamp when purchase_confirmation_message_snapshot was captured for this ticket.';

-- Enforce a reasonable maximum length (10k HTML characters) at the DB layer.
ALTER TABLE public.event_drafts
  DROP CONSTRAINT IF EXISTS event_drafts_purchase_confirmation_message_length,
  ADD CONSTRAINT event_drafts_purchase_confirmation_message_length CHECK (
    purchase_confirmation_message IS NULL
    OR length(purchase_confirmation_message) <= 10000
  );

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_purchase_confirmation_message_snapshot_length,
  ADD CONSTRAINT tickets_purchase_confirmation_message_snapshot_length CHECK (
    purchase_confirmation_message_snapshot IS NULL
    OR length(purchase_confirmation_message_snapshot) <= 10000
  );

-- Refresh tickets_public view and keep purchase-message snapshots private.
DROP VIEW IF EXISTS public.tickets_public;

CREATE VIEW public.tickets_public
WITH (security_invoker = on) AS
SELECT
  id,
  event_id,
  owner_wallet,
  payment_transaction_id,
  token_id,
  grant_tx_hash,
  status,
  granted_at,
  expires_at,
  created_at,
  updated_at
  -- Deliberately exclude user_email for privacy
  -- Deliberately exclude purchase_confirmation_message_snapshot so post-purchase
  -- instructions are only returned through purchase/status service functions.
FROM public.tickets;

GRANT SELECT ON public.tickets_public TO anon, authenticated;

COMMENT ON VIEW public.tickets_public IS 'Public view of tickets table excluding sensitive user_email and purchase confirmation snapshot fields. Uses security_invoker mode to enforce RLS policies based on the querying user.';
