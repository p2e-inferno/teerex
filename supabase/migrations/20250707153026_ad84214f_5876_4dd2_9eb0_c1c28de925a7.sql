-- Fix the database trigger to properly handle creator_address
DROP TRIGGER IF EXISTS populate_attestation_addresses_trigger ON public.attestations;
DROP FUNCTION IF EXISTS public.populate_attestation_addresses();

-- Create improved function to populate attestation addresses
CREATE OR REPLACE FUNCTION public.populate_attestation_addresses()
RETURNS TRIGGER AS $$
BEGIN
  -- If event_id is provided, populate lock_address and creator_address
  IF NEW.event_id IS NOT NULL THEN
    SELECT e.lock_address, e.creator_id
    INTO NEW.lock_address, NEW.creator_address
    FROM public.events e
    WHERE e.id = NEW.event_id;
    
    -- Ensure creator_address is valid (42 chars) or NULL
    IF NEW.creator_address IS NOT NULL AND length(NEW.creator_address) != 42 THEN
      NEW.creator_address := NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically populate addresses
CREATE TRIGGER populate_attestation_addresses_trigger
  BEFORE INSERT ON public.attestations
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_attestation_addresses();