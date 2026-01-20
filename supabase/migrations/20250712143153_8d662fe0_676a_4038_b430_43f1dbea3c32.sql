-- Add ticket tracking table for granted keys
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  owner_wallet TEXT NOT NULL,
  payment_transaction_id UUID REFERENCES public.paystack_transactions(id) ON DELETE CASCADE,
  token_id TEXT,
  grant_tx_hash TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add gas tracking table for service account
CREATE TABLE IF NOT EXISTS public.gas_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_hash TEXT UNIQUE NOT NULL,
  event_id UUID REFERENCES public.events(id),
  payment_transaction_id UUID REFERENCES public.paystack_transactions(id),
  gas_used BIGINT,
  gas_price BIGINT,
  gas_cost_wei BIGINT,
  gas_cost_eth DECIMAL(18, 18),
  service_wallet_address TEXT NOT NULL,
  chain_id BIGINT NOT NULL,
  block_number BIGINT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add key granting attempts table for retry logic
CREATE TABLE IF NOT EXISTS public.key_grant_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_transaction_id UUID REFERENCES public.paystack_transactions(id) NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  error_message TEXT,
  grant_tx_hash TEXT,
  gas_cost_wei BIGINT,
  service_wallet_balance_before TEXT,
  service_wallet_balance_after TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(payment_transaction_id, attempt_number)
);

-- Enable RLS on new tables
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gas_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_grant_attempts ENABLE ROW LEVEL SECURITY;

-- Create policies for tickets
CREATE POLICY "Anyone can view tickets" ON public.tickets FOR SELECT USING (true);
CREATE POLICY "System can insert tickets" ON public.tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update tickets" ON public.tickets FOR UPDATE USING (true);

-- Create policies for gas transactions (admin only)
CREATE POLICY "System can manage gas transactions" ON public.gas_transactions FOR ALL USING (true);

-- Create policies for key grant attempts (admin only)
CREATE POLICY "System can manage key grant attempts" ON public.key_grant_attempts FOR ALL USING (true);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON public.tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_owner_wallet ON public.tickets(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_tickets_payment_transaction_id ON public.tickets(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_gas_transactions_service_wallet ON public.gas_transactions(service_wallet_address);
CREATE INDEX IF NOT EXISTS idx_key_grant_attempts_payment_tx ON public.key_grant_attempts(payment_transaction_id);

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers for new tables
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gas_transactions_updated_at
  BEFORE UPDATE ON public.gas_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_key_grant_attempts_updated_at
  BEFORE UPDATE ON public.key_grant_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();