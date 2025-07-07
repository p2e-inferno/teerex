-- Add NGN payment support to existing tables

-- Add NGN pricing fields to events table
ALTER TABLE public.events 
ADD COLUMN ngn_price numeric DEFAULT 0,
ADD COLUMN payment_methods text[] DEFAULT ARRAY['crypto']::text[],
ADD COLUMN paystack_public_key text;

-- Add NGN pricing fields to event_drafts table  
ALTER TABLE public.event_drafts
ADD COLUMN ngn_price numeric DEFAULT 0,
ADD COLUMN payment_methods text[] DEFAULT ARRAY['crypto']::text[],
ADD COLUMN paystack_public_key text;

-- Create table for tracking Paystack transactions
CREATE TABLE public.paystack_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL,
  user_email text NOT NULL,
  reference text NOT NULL UNIQUE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending',
  gateway_response jsonb,
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on paystack_transactions
ALTER TABLE public.paystack_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies for paystack_transactions
CREATE POLICY "Users can view their own transactions" 
ON public.paystack_transactions 
FOR SELECT 
USING (user_email = ((current_setting('request.jwt.claims'::text, true))::json ->> 'email'::text));

CREATE POLICY "System can insert transactions" 
ON public.paystack_transactions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "System can update transactions" 
ON public.paystack_transactions 
FOR UPDATE 
USING (true);

-- Add foreign key relationship
ALTER TABLE public.paystack_transactions 
ADD CONSTRAINT paystack_transactions_event_id_fkey 
FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX idx_paystack_transactions_reference ON public.paystack_transactions(reference);
CREATE INDEX idx_paystack_transactions_event_id ON public.paystack_transactions(event_id);
CREATE INDEX idx_paystack_transactions_status ON public.paystack_transactions(status);

-- Add trigger for updating timestamps
CREATE TRIGGER update_paystack_transactions_updated_at
BEFORE UPDATE ON public.paystack_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();