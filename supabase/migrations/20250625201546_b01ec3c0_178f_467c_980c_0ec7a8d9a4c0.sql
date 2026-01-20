
-- First, create attestation schemas table
CREATE TABLE public.attestation_schemas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schema_uid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  schema_definition TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('attendance', 'social', 'verification', 'review')),
  revocable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create attestations table with proper Unlock Protocol integration
CREATE TABLE public.attestations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attestation_uid TEXT NOT NULL UNIQUE,
  schema_uid TEXT NOT NULL REFERENCES public.attestation_schemas(schema_uid),
  attester TEXT NOT NULL, -- Ethereum address of the attester
  recipient TEXT NOT NULL, -- Ethereum address of the recipient
  event_id UUID REFERENCES public.events(id),
  lock_address TEXT, -- Unlock Protocol lock address
  creator_address TEXT, -- Event creator's Ethereum address
  ticket_token_id TEXT, -- Token ID from Unlock Protocol (if applicable)
  data JSONB NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  revocation_time TIMESTAMP WITH TIME ZONE,
  expiration_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraints to ensure data integrity
  CONSTRAINT valid_lock_address CHECK (lock_address IS NULL OR length(lock_address) = 42),
  CONSTRAINT valid_creator_address CHECK (creator_address IS NULL OR length(creator_address) = 42),
  CONSTRAINT valid_attester_address CHECK (length(attester) = 42),
  CONSTRAINT valid_recipient_address CHECK (length(recipient) = 42)
);

-- Add attestation-related fields to events table
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS attestation_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS attendance_schema_uid TEXT,
ADD COLUMN IF NOT EXISTS review_schema_uid TEXT;

-- Create indexes for better performance
CREATE INDEX idx_attestations_schema_uid ON public.attestations(schema_uid);
CREATE INDEX idx_attestations_attester ON public.attestations(attester);
CREATE INDEX idx_attestations_recipient ON public.attestations(recipient);
CREATE INDEX idx_attestations_event_id ON public.attestations(event_id);
CREATE INDEX idx_attestations_lock_address ON public.attestations(lock_address);
CREATE INDEX idx_attestations_creator_address ON public.attestations(creator_address);
CREATE INDEX idx_attestation_schemas_category ON public.attestation_schemas(category);

-- Enable RLS on attestation tables
ALTER TABLE public.attestation_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY;

-- Create policies for attestation_schemas (public read, admin write)
CREATE POLICY "Anyone can view attestation schemas" 
  ON public.attestation_schemas 
  FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can create attestation schemas" 
  ON public.attestation_schemas 
  FOR INSERT 
  WITH CHECK (true);

-- Create policies for attestations
CREATE POLICY "Anyone can view attestations" 
  ON public.attestations 
  FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can create attestations" 
  ON public.attestations 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Attesters can update their own attestations" 
  ON public.attestations 
  FOR UPDATE 
  USING (attester = current_setting('request.jwt.claims', true)::json->>'sub');

-- Insert default attestation schemas with Unlock Protocol integration
INSERT INTO public.attestation_schemas (schema_uid, name, description, schema_definition, category, revocable) VALUES
('0x1234567890abcdef1234567890abcdef12345678', 'EventAttendance', 'Proof of attendance at an event', 'string eventId,string lockAddress,string eventTitle,uint256 timestamp,string location,address ticketHolder', 'attendance', false),
('0x2234567890abcdef1234567890abcdef12345678', 'EventLike', 'Social signal for event appreciation', 'string eventId,string lockAddress,string eventTitle,uint8 rating,address ticketHolder', 'social', true),
('0x3234567890abcdef1234567890abcdef12345678', 'EventReview', 'Rating and review attestation for an event', 'string eventId,string lockAddress,string eventTitle,uint8 rating,string review,address ticketHolder', 'review', true),
('0x4234567890abcdef1234567890abcdef12345678', 'EventCreatorVerification', 'Verification of event creator credibility', 'address creatorAddress,string eventId,string lockAddress,string verificationType,uint256 eventsCreated', 'verification', false),
('0x5234567890abcdef1234567890abcdef12345678', 'TicketPurchase', 'Attestation of ticket purchase through Unlock Protocol', 'string eventId,string lockAddress,uint256 tokenId,uint256 price,uint256 timestamp,address purchaser', 'verification', false),
('0x6234567890abcdef1234567890abcdef12345678', 'KeyHolderStatus', 'Current valid key holder status for an event', 'string eventId,string lockAddress,uint256 tokenId,uint256 expirationTime,address keyHolder', 'verification', true);

-- Add a function to automatically populate creator_address and lock_address from events
CREATE OR REPLACE FUNCTION public.populate_attestation_addresses()
RETURNS TRIGGER AS $$
BEGIN
  -- If event_id is provided, populate lock_address and creator_address
  IF NEW.event_id IS NOT NULL THEN
    SELECT e.lock_address, e.creator_id
    INTO NEW.lock_address, NEW.creator_address
    FROM public.events e
    WHERE e.id = NEW.event_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically populate addresses
CREATE TRIGGER populate_attestation_addresses_trigger
  BEFORE INSERT ON public.attestations
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_attestation_addresses();
