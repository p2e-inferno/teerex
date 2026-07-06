-- Event abuse reports filed by users, triaged by admins.

CREATE TABLE IF NOT EXISTS public.event_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL, not CASCADE: moderation history must survive event deletion for audit.
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  reporter_id text NOT NULL,
  reporter_wallet text,
  reason text NOT NULL CHECK (reason IN ('spam', 'scam', 'inappropriate', 'misleading', 'impersonation', 'other')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_reports_event_id ON public.event_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reports_status ON public.event_reports(status);

-- Enforces one open report per reporter per event at the DB; the submit handler
-- relies on the resulting unique violation instead of a check-then-insert race.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_reports_open_per_reporter
  ON public.event_reports(event_id, reporter_id)
  WHERE status = 'open';

ALTER TABLE public.event_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages event reports"
  ON public.event_reports FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_reports TO service_role;
