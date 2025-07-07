-- Create new attestation schemas for "going" vs "attended" states
INSERT INTO public.attestation_schemas (schema_uid, name, description, schema_definition, category, revocable) VALUES
('0x7234567890abcdef1234567890abcdef12345678', 'EventGoing', 'Declaration of intent to attend an event', 'string eventId,address lockAddress,string eventTitle,uint256 timestamp,string location,address declarer', 'social', true),
('0x8234567890abcdef1234567890abcdef12345678', 'EventAttended', 'Proof of actual attendance at an event', 'string eventId,address lockAddress,string eventTitle,uint256 timestamp,string location,address attendee,uint8 verificationMethod', 'attendance', false);

-- Create user reputation system
CREATE TABLE public.user_reputation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_address TEXT NOT NULL UNIQUE,
  reputation_score INTEGER NOT NULL DEFAULT 100,
  total_attestations INTEGER NOT NULL DEFAULT 0,
  honest_attestations INTEGER NOT NULL DEFAULT 0,
  dishonest_attestations INTEGER NOT NULL DEFAULT 0,
  successful_challenges INTEGER NOT NULL DEFAULT 0,
  failed_challenges INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_user_address CHECK (length(user_address) = 42),
  CONSTRAINT positive_reputation CHECK (reputation_score >= 0)
);

-- Create attestation challenges system
CREATE TABLE public.attestation_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attestation_id UUID NOT NULL REFERENCES public.attestations(id),
  challenger_address TEXT NOT NULL,
  challenged_address TEXT NOT NULL,
  challenge_reason TEXT NOT NULL,
  evidence_description TEXT,
  evidence_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'resolved_valid', 'resolved_invalid', 'dismissed')) DEFAULT 'pending',
  resolution_reason TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  stake_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_challenger_address CHECK (length(challenger_address) = 42),
  CONSTRAINT valid_challenged_address CHECK (length(challenged_address) = 42),
  CONSTRAINT different_addresses CHECK (challenger_address != challenged_address)
);

-- Create attestation votes for community validation
CREATE TABLE public.attestation_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attestation_id UUID NOT NULL REFERENCES public.attestations(id),
  voter_address TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('support', 'challenge', 'verify')),
  weight INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_voter_address CHECK (length(voter_address) = 42),
  CONSTRAINT unique_vote UNIQUE (attestation_id, voter_address, vote_type)
);

-- Create indexes for performance
CREATE INDEX idx_user_reputation_address ON public.user_reputation(user_address);
CREATE INDEX idx_attestation_challenges_attestation ON public.attestation_challenges(attestation_id);
CREATE INDEX idx_attestation_challenges_status ON public.attestation_challenges(status);
CREATE INDEX idx_attestation_votes_attestation ON public.attestation_votes(attestation_id);
CREATE INDEX idx_attestation_votes_voter ON public.attestation_votes(voter_address);

-- Enable RLS
ALTER TABLE public.user_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attestation_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attestation_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_reputation
CREATE POLICY "Anyone can view reputation scores" 
  ON public.user_reputation 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can update their own reputation" 
  ON public.user_reputation 
  FOR UPDATE 
  USING (user_address = ((current_setting('request.jwt.claims', true))::json ->> 'sub'));

CREATE POLICY "System can insert reputation records" 
  ON public.user_reputation 
  FOR INSERT 
  WITH CHECK (true);

-- RLS Policies for attestation_challenges
CREATE POLICY "Anyone can view challenges" 
  ON public.attestation_challenges 
  FOR SELECT 
  USING (true);

CREATE POLICY "Authenticated users can create challenges" 
  ON public.attestation_challenges 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Challengers can update their challenges" 
  ON public.attestation_challenges 
  FOR UPDATE 
  USING (challenger_address = ((current_setting('request.jwt.claims', true))::json ->> 'sub'));

-- RLS Policies for attestation_votes
CREATE POLICY "Anyone can view votes" 
  ON public.attestation_votes 
  FOR SELECT 
  USING (true);

CREATE POLICY "Authenticated users can vote" 
  ON public.attestation_votes 
  FOR INSERT 
  WITH CHECK (true);

-- Function to update reputation scores
CREATE OR REPLACE FUNCTION public.update_reputation_score(
  user_addr TEXT,
  score_change INTEGER,
  attestation_type TEXT DEFAULT 'attestation'
)
RETURNS VOID AS $$
BEGIN
  -- Insert or update reputation record
  INSERT INTO public.user_reputation (user_address, reputation_score, total_attestations, honest_attestations)
  VALUES (user_addr, GREATEST(0, 100 + score_change), 1, CASE WHEN score_change > 0 THEN 1 ELSE 0 END)
  ON CONFLICT (user_address) 
  DO UPDATE SET
    reputation_score = GREATEST(0, user_reputation.reputation_score + score_change),
    total_attestations = user_reputation.total_attestations + 1,
    honest_attestations = CASE 
      WHEN score_change > 0 THEN user_reputation.honest_attestations + 1 
      ELSE user_reputation.honest_attestations 
    END,
    dishonest_attestations = CASE 
      WHEN score_change < 0 THEN user_reputation.dishonest_attestations + 1 
      ELSE user_reputation.dishonest_attestations 
    END,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;