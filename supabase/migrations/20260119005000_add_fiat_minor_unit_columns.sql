-- Add canonical fiat minor-unit columns to avoid floating point mismatch with Paystack amounts.

-- Events: NGN amount used for Paystack should be stored as integer kobo.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ngn_price_kobo bigint NOT NULL DEFAULT 0;

ALTER TABLE public.event_drafts
  ADD COLUMN IF NOT EXISTS ngn_price_kobo bigint NOT NULL DEFAULT 0;

-- Gaming bundles: NGN price used for Paystack should be stored as integer kobo.
ALTER TABLE public.gaming_bundles
  ADD COLUMN IF NOT EXISTS price_fiat_kobo bigint NOT NULL DEFAULT 0;

-- Backfill existing rows (NUMERIC -> integer kobo).
UPDATE public.events
SET ngn_price_kobo = COALESCE(ROUND(COALESCE(ngn_price, 0) * 100), 0)::bigint;

UPDATE public.event_drafts
SET ngn_price_kobo = COALESCE(ROUND(COALESCE(ngn_price, 0) * 100), 0)::bigint;

-- Avoid rewriting updated_at for all existing bundles during the backfill.
ALTER TABLE public.gaming_bundles DISABLE TRIGGER update_gaming_bundles_updated_at;

UPDATE public.gaming_bundles
SET price_fiat_kobo = COALESCE(ROUND(COALESCE(price_fiat, 0) * 100), 0)::bigint;

ALTER TABLE public.gaming_bundles ENABLE TRIGGER update_gaming_bundles_updated_at;

-- Keep the kobo columns in sync on writes using triggers.
CREATE OR REPLACE FUNCTION public.sync_events_ngn_price_kobo()
RETURNS trigger AS $$
BEGIN
  NEW.ngn_price_kobo := COALESCE(ROUND(COALESCE(NEW.ngn_price, 0) * 100), 0)::bigint;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_events_ngn_price_kobo ON public.events;
CREATE TRIGGER trg_sync_events_ngn_price_kobo
BEFORE INSERT OR UPDATE OF ngn_price ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.sync_events_ngn_price_kobo();

CREATE OR REPLACE FUNCTION public.sync_event_drafts_ngn_price_kobo()
RETURNS trigger AS $$
BEGIN
  NEW.ngn_price_kobo := COALESCE(ROUND(COALESCE(NEW.ngn_price, 0) * 100), 0)::bigint;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_event_drafts_ngn_price_kobo ON public.event_drafts;
CREATE TRIGGER trg_sync_event_drafts_ngn_price_kobo
BEFORE INSERT OR UPDATE OF ngn_price ON public.event_drafts
FOR EACH ROW
EXECUTE FUNCTION public.sync_event_drafts_ngn_price_kobo();

CREATE OR REPLACE FUNCTION public.sync_gaming_bundles_price_fiat_kobo()
RETURNS trigger AS $$
BEGIN
  NEW.price_fiat_kobo := COALESCE(ROUND(COALESCE(NEW.price_fiat, 0) * 100), 0)::bigint;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_gaming_bundles_price_fiat_kobo ON public.gaming_bundles;
CREATE TRIGGER trg_sync_gaming_bundles_price_fiat_kobo
BEFORE INSERT OR UPDATE OF price_fiat ON public.gaming_bundles
FOR EACH ROW
EXECUTE FUNCTION public.sync_gaming_bundles_price_fiat_kobo();

COMMENT ON COLUMN public.events.ngn_price_kobo IS 'Canonical NGN price in kobo for Paystack (minor units).';
COMMENT ON COLUMN public.event_drafts.ngn_price_kobo IS 'Canonical NGN draft price in kobo for Paystack (minor units).';
COMMENT ON COLUMN public.gaming_bundles.price_fiat_kobo IS 'Canonical NGN price in kobo for Paystack (minor units).';
