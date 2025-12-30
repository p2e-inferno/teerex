-- Gaming bundles (NFT-backed) + orders + redemptions

CREATE TABLE public.gaming_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id TEXT NOT NULL,
  vendor_address TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  game_title TEXT,
  bundle_type TEXT NOT NULL CHECK (bundle_type IN ('TIME', 'MATCHES', 'PASS', 'OTHER')),
  quantity_units INTEGER NOT NULL CHECK (quantity_units > 0),
  unit_label TEXT NOT NULL,
  price_fiat NUMERIC NOT NULL DEFAULT 0,
  fiat_symbol TEXT NOT NULL DEFAULT 'NGN',
  price_dg NUMERIC,
  chain_id BIGINT NOT NULL,
  bundle_address TEXT NOT NULL,
  key_expiration_duration_seconds INTEGER NOT NULL DEFAULT 2592000,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_bundle_address CHECK (length(bundle_address) = 42),
  CONSTRAINT valid_vendor_address CHECK (length(vendor_address) = 42)
);

CREATE UNIQUE INDEX idx_gaming_bundles_bundle_address_unique
  ON public.gaming_bundles(bundle_address);
CREATE INDEX idx_gaming_bundles_vendor_id ON public.gaming_bundles(vendor_id);
CREATE INDEX idx_gaming_bundles_vendor_address ON public.gaming_bundles(vendor_address);
CREATE INDEX idx_gaming_bundles_chain_id ON public.gaming_bundles(chain_id);
CREATE INDEX idx_gaming_bundles_is_active ON public.gaming_bundles(is_active);

CREATE TABLE public.gaming_bundle_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.gaming_bundles(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL,
  vendor_address TEXT NOT NULL,
  buyer_address TEXT,
  buyer_email TEXT,
  buyer_display_name TEXT,
  buyer_phone TEXT,
  payment_provider TEXT NOT NULL DEFAULT 'cash' CHECK (payment_provider IN ('paystack', 'crypto', 'cash')),
  payment_reference TEXT,
  amount_fiat NUMERIC,
  fiat_symbol TEXT DEFAULT 'NGN',
  amount_dg NUMERIC,
  chain_id BIGINT NOT NULL,
  bundle_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  fulfillment_method TEXT NOT NULL DEFAULT 'EAS' CHECK (fulfillment_method IN ('NFT', 'EAS', 'EAS_TO_NFT')),
  nft_recipient_address TEXT,
  eas_uid TEXT,
  token_id TEXT,
  txn_hash TEXT,
  claim_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_bundle_address_order CHECK (length(bundle_address) = 42),
  CONSTRAINT valid_vendor_address_order CHECK (length(vendor_address) = 42)
);

CREATE INDEX idx_gaming_bundle_orders_bundle_id ON public.gaming_bundle_orders(bundle_id);
CREATE INDEX idx_gaming_bundle_orders_vendor_id ON public.gaming_bundle_orders(vendor_id);
CREATE INDEX idx_gaming_bundle_orders_vendor_address ON public.gaming_bundle_orders(vendor_address);
CREATE INDEX idx_gaming_bundle_orders_status ON public.gaming_bundle_orders(status);
CREATE UNIQUE INDEX idx_gaming_bundle_orders_payment_reference
  ON public.gaming_bundle_orders(payment_reference)
  WHERE payment_reference IS NOT NULL;
CREATE INDEX idx_gaming_bundle_orders_claim_code
  ON public.gaming_bundle_orders(claim_code)
  WHERE claim_code IS NOT NULL;

CREATE TABLE public.gaming_bundle_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.gaming_bundle_orders(id) ON DELETE CASCADE,
  bundle_id UUID NOT NULL REFERENCES public.gaming_bundles(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL,
  vendor_address TEXT NOT NULL,
  redeemer_address TEXT,
  redeemed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  redemption_location TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_vendor_address_redemption CHECK (length(vendor_address) = 42)
);

CREATE UNIQUE INDEX idx_gaming_bundle_redemptions_order_id_unique
  ON public.gaming_bundle_redemptions(order_id);
CREATE INDEX idx_gaming_bundle_redemptions_bundle_id ON public.gaming_bundle_redemptions(bundle_id);
CREATE INDEX idx_gaming_bundle_redemptions_vendor_id ON public.gaming_bundle_redemptions(vendor_id);

ALTER TABLE public.gaming_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gaming_bundle_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gaming_bundle_redemptions ENABLE ROW LEVEL SECURITY;

-- Public read for active bundles only
CREATE POLICY "Anyone can view active gaming bundles"
  ON public.gaming_bundles
  FOR SELECT
  USING (is_active = true);

-- Service role full access (edge functions)
CREATE POLICY "Service role full access on gaming_bundles"
  ON public.gaming_bundles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on gaming_bundle_orders"
  ON public.gaming_bundle_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on gaming_bundle_redemptions"
  ON public.gaming_bundle_redemptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_gaming_bundles_updated_at
  BEFORE UPDATE ON public.gaming_bundles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gaming_bundle_orders_updated_at
  BEFORE UPDATE ON public.gaming_bundle_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gaming_bundle_redemptions_updated_at
  BEFORE UPDATE ON public.gaming_bundle_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.gaming_bundles IS 'Vendor-created gaming bundles backed by unique Unlock lock addresses.';
COMMENT ON TABLE public.gaming_bundle_orders IS 'Orders for gaming bundles (online or offline), with EAS/NFT fulfillment tracking.';
COMMENT ON TABLE public.gaming_bundle_redemptions IS 'Bundle redemptions at vendor locations. One redemption per order.';
