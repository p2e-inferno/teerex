-- Add idempotency hash column and constraint to prevent duplicate event creation
-- Hash is generated from: creator_id, title, date, time, location, capacity, price, currency, paymentMethod
-- This ensures the same event data cannot be submitted twice by the same user

-- Add idempotency_hash column to events table
ALTER TABLE public.events
ADD COLUMN idempotency_hash TEXT;

-- Add unique constraint on (creator_id, idempotency_hash)
-- This ensures one user can't create the same event twice
ALTER TABLE public.events
ADD CONSTRAINT events_creator_idempotency_unique
UNIQUE (creator_id, idempotency_hash);

-- Add index for fast lookups
CREATE INDEX idx_events_idempotency_hash
ON public.events(creator_id, idempotency_hash);

-- Add comment explaining the column
COMMENT ON COLUMN public.events.idempotency_hash IS
'SHA-256 hash of event properties (title, date, time, location, capacity, price, currency, paymentMethod) used to prevent duplicate event creation';
