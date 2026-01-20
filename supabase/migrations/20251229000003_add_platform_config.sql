-- Platform-wide configuration table (extensible key-value store)

CREATE TABLE public.platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default commission rate (5% as confirmed)
INSERT INTO public.platform_config (key, value, description) VALUES
  ('default_payout_commission', '{"percentage": 5}'::jsonb, 'Default platform commission for vendor payouts (percentage of transaction)');

-- RLS: Service role only (admin access via edge functions)
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only on platform_config"
  ON public.platform_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_platform_config_updated_at
  BEFORE UPDATE ON public.platform_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.platform_config IS 'Platform-wide configuration settings. Only accessible via service role.';
