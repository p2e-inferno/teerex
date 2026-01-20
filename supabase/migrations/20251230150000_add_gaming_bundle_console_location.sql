-- Add console and location fields to gaming_bundles
-- console: Optional field for gaming console type (PS5, PS4, XBOX, etc.)
-- location: Required field for physical gaming center location

ALTER TABLE public.gaming_bundles
  ADD COLUMN console TEXT,
  ADD COLUMN location TEXT NOT NULL DEFAULT '';

-- Add indexes for filtering
CREATE INDEX idx_gaming_bundles_location ON public.gaming_bundles(location);
CREATE INDEX idx_gaming_bundles_console ON public.gaming_bundles(console) WHERE console IS NOT NULL;

-- Remove default after migration (location should be required for new records)
ALTER TABLE public.gaming_bundles ALTER COLUMN location DROP DEFAULT;

COMMENT ON COLUMN public.gaming_bundles.console IS 'Gaming console type (e.g., PS5, PS4, XBOX Series X, Nintendo Switch, PC)';
COMMENT ON COLUMN public.gaming_bundles.location IS 'Physical gaming center location where bundle can be redeemed';
