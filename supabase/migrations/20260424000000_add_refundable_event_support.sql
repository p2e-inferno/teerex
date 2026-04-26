-- Add protected refundable event configuration and status fields.

ALTER TABLE public.network_configs
  ADD COLUMN IF NOT EXISTS refundable_event_manager_address TEXT;

COMMENT ON COLUMN public.network_configs.refundable_event_manager_address
  IS 'RefundableEventLockController address for protected paid crypto events on this network.';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refund_protection_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_min_attendees INTEGER,
  ADD COLUMN IF NOT EXISTS refund_trigger_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refund_event_end_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refund_controller_address TEXT,
  ADD COLUMN IF NOT EXISTS refund_reserve_bond TEXT,
  ADD COLUMN IF NOT EXISTS refund_status TEXT,
  ADD COLUMN IF NOT EXISTS refund_last_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS refund_last_synced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.event_drafts
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refund_protection_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_min_attendees INTEGER,
  ADD COLUMN IF NOT EXISTS refund_trigger_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refund_event_end_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS refund_controller_address TEXT,
  ADD COLUMN IF NOT EXISTS refund_reserve_bond TEXT,
  ADD COLUMN IF NOT EXISTS refund_status TEXT,
  ADD COLUMN IF NOT EXISTS refund_last_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS refund_last_synced_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.events.ends_at
  IS 'Canonical event end timestamp, derived from creator-specified end date and end time.';
COMMENT ON COLUMN public.events.refund_protection_enabled
  IS 'Whether the event was created through RefundableEventLockController protection.';
COMMENT ON COLUMN public.events.refund_status
  IS 'Cached refundable event status: protected, threshold_met, released, refund_available, refund_in_progress, refunded, creator_only_refund_window.';

CREATE INDEX IF NOT EXISTS idx_events_refund_status
  ON public.events(refund_status)
  WHERE refund_protection_enabled = true;

CREATE INDEX IF NOT EXISTS idx_events_refund_trigger_at
  ON public.events(refund_trigger_at)
  WHERE refund_protection_enabled = true;

CREATE INDEX IF NOT EXISTS idx_events_refund_controller_address
  ON public.events(refund_controller_address)
  WHERE refund_controller_address IS NOT NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_refund_protection_valid,
  ADD CONSTRAINT events_refund_protection_valid CHECK (
    refund_protection_enabled = false
    OR (
      payment_methods IS NOT NULL
      AND 'crypto' = ANY(payment_methods)
      AND price > 0
      AND refund_min_attendees IS NOT NULL
      AND refund_min_attendees > 0
      AND refund_min_attendees <= capacity
      AND refund_trigger_at IS NOT NULL
      AND refund_event_end_at IS NOT NULL
      AND ends_at IS NOT NULL
      AND starts_at IS NOT NULL
      AND refund_trigger_at <= starts_at
      AND refund_trigger_at < refund_event_end_at
      AND refund_controller_address IS NOT NULL
      AND length(refund_controller_address) = 42
    )
  );

ALTER TABLE public.event_drafts
  DROP CONSTRAINT IF EXISTS event_drafts_refund_protection_valid,
  ADD CONSTRAINT event_drafts_refund_protection_valid CHECK (
    refund_protection_enabled = false
    OR (
      payment_methods IS NOT NULL
      AND 'crypto' = ANY(payment_methods)
      AND price > 0
      AND refund_min_attendees IS NOT NULL
      AND refund_min_attendees > 0
      AND refund_min_attendees <= capacity
      AND refund_trigger_at IS NOT NULL
      AND refund_event_end_at IS NOT NULL
      AND ends_at IS NOT NULL
      AND starts_at IS NOT NULL
      AND refund_trigger_at <= starts_at
      AND refund_trigger_at < refund_event_end_at
    )
  );
