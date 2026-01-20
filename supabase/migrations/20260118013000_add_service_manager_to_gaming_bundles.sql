-- Track whether the Unlock service wallet is a lock manager for bundle locks
ALTER TABLE public.gaming_bundles
  ADD COLUMN service_manager_added boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.gaming_bundles.service_manager_added
  IS 'Tracks whether the unlock service wallet has been added as a lock manager for fiat bundle issuance';
