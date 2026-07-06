-- Attendee-to-host messages sent from the event page. Also the anti-spam
-- rate-limit source: the (sender_id, created_at) index backs the per-sender window.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS creator_address text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_creator_address_format'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_creator_address_format
      CHECK (creator_address IS NULL OR creator_address ~ '^0x[0-9a-fA-F]{40}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_creator_address
  ON public.events(lower(creator_address))
  WHERE creator_address IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.event_host_contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL, not CASCADE: retain the contact/audit trail if the event is deleted.
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  sender_id text NOT NULL,
  sender_wallet text,
  sender_email text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_host_contact_messages_event_id
  ON public.event_host_contact_messages(event_id);
CREATE INDEX IF NOT EXISTS idx_event_host_contact_messages_sender_created
  ON public.event_host_contact_messages(sender_id, created_at);

ALTER TABLE public.event_host_contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages event host contact messages"
  ON public.event_host_contact_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_host_contact_messages TO service_role;
