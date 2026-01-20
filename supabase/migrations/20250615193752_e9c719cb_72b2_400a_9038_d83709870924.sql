
UPDATE public.events
SET lock_address = '0xf2de0438b700b5a8b4f30e48c65ac6fcc79c5bfa'
WHERE lock_address = '0x0000000000000000000000000000000000000000' OR lock_address = 'Unknown';
