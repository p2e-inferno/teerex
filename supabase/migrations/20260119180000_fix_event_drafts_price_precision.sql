-- Fix price precision loss in event_drafts table
-- 
-- Problem: The price column was defined as DECIMAL(10,2) which only stores 2 decimal places.
-- This causes prices like 0.0002 ETH to be rounded to 0.00, resulting in locks being deployed
-- with 0 price when publishing from drafts.
--
-- Solution: Change price type to NUMERIC (unconstrained precision) to match the events table
-- and support micro-transactions and tokens with varying decimal places (ETH: 18, USDC: 6, etc.)

-- Step 1: Alter the price column type from DECIMAL(10,2) to NUMERIC
ALTER TABLE public.event_drafts 
ALTER COLUMN price TYPE NUMERIC USING price::NUMERIC;

-- Step 2: Add a helpful comment explaining the column purpose and type
COMMENT ON COLUMN public.event_drafts.price IS
  'Price in primary units (e.g., 0.0002 ETH, 500 DG). NUMERIC type with no precision constraint preserves decimal precision for micro-transactions and supports tokens with varying decimals. Used only when payment_methods contains ''crypto''.';

-- Step 3: Verify the change was applied correctly
DO $$
BEGIN
  -- Check if price column is now NUMERIC type
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name = 'event_drafts' 
      AND column_name = 'price' 
      AND data_type = 'numeric'
      AND numeric_precision IS NULL  -- Unconstrained precision
      AND numeric_scale IS NULL      -- Unconstrained scale
  ) THEN
    RAISE EXCEPTION 'Migration verification failed: price column is not NUMERIC with unconstrained precision';
  END IF;
  
  RAISE NOTICE 'Migration successful: event_drafts.price is now NUMERIC (unconstrained precision)';
END $$;

-- Note: Existing drafts with prices that were truncated (e.g., 0.0002 -> 0.00 -> 0) cannot be 
-- automatically recovered as the original values were lost. Users will need to re-enter prices 
-- when editing those drafts. New drafts will correctly preserve decimal precision.
