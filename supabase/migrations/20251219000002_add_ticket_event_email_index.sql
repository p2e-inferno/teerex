-- Index to speed post-notification recipient lookup
CREATE INDEX IF NOT EXISTS idx_tickets_event_email_active
  ON public.tickets(event_id, user_email)
  WHERE status = 'active' AND user_email IS NOT NULL;

-- Index to speed ticket lookups by wallet/address per event
CREATE INDEX IF NOT EXISTS idx_tickets_event_owner_active
  ON public.tickets(event_id, owner_wallet)
  WHERE status = 'active' AND owner_wallet IS NOT NULL;
