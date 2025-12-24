-- Add email support to event_allow_list and introduce event_allow_list_requests

-- 1. Extend event_allow_list with optional user_email for notifications
ALTER TABLE public.event_allow_list
  ADD COLUMN IF NOT EXISTS user_email TEXT;

-- 2. Create event_allow_list_requests table for approval workflow
CREATE TABLE IF NOT EXISTS public.event_allow_list_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by TEXT -- Privy DID of approver (event creator/manager)
);

-- Index foreign key and common query patterns
CREATE INDEX IF NOT EXISTS idx_event_allow_list_requests_event_id
  ON public.event_allow_list_requests(event_id);

CREATE INDEX IF NOT EXISTS idx_event_allow_list_requests_event_status
  ON public.event_allow_list_requests(event_id, status);

-- Optional: prevent duplicate pending requests per wallet per event
CREATE UNIQUE INDEX IF NOT EXISTS uq_allow_list_requests_event_wallet
  ON public.event_allow_list_requests(event_id, wallet_address);

-- Enable RLS
ALTER TABLE public.event_allow_list_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (public) can submit a request to join the allow list
CREATE POLICY "Anyone can request allow list"
  ON public.event_allow_list_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Service role has full management access for edge functions
CREATE POLICY "Service role manages allow list requests"
  ON public.event_allow_list_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

