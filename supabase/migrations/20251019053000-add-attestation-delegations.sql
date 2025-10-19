-- Create attestation_delegations table to persist signed, delegated attestations
CREATE TABLE IF NOT EXISTS public.attestation_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  schema_uid TEXT NOT NULL,
  recipient TEXT NOT NULL,
  data TEXT NOT NULL, -- EAS-encoded bytes (0x...)
  deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  signer_address TEXT NOT NULL,
  signature TEXT NOT NULL,
  message_hash TEXT NOT NULL UNIQUE,
  lock_address TEXT,
  event_title TEXT,
  executed BOOLEAN NOT NULL DEFAULT FALSE,
  executed_tx_hash TEXT,
  executed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_recipient CHECK (length(recipient) = 42),
  CONSTRAINT valid_signer CHECK (length(signer_address) = 42),
  CONSTRAINT valid_lock_addr CHECK (lock_address IS NULL OR length(lock_address) = 42)
);

CREATE INDEX IF NOT EXISTS idx_attdel_event_executed ON public.attestation_delegations(event_id, executed);
CREATE INDEX IF NOT EXISTS idx_attdel_created_at ON public.attestation_delegations(created_at DESC);

-- Enable RLS and add strict policies: allow inserts and reads; block updates/deletes (service role bypasses)
ALTER TABLE public.attestation_delegations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can insert attestation delegations"
  ON public.attestation_delegations FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can read attestation delegations"
  ON public.attestation_delegations FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Do not create UPDATE/DELETE policies; clients cannot change or delete rows. Service role bypasses RLS.

