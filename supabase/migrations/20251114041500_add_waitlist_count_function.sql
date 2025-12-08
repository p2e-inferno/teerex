-- Add function to get waitlist count without exposing emails
-- This allows anyone to see how many people are waiting, but not their emails

CREATE OR REPLACE FUNCTION public.get_waitlist_count(p_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count waitlist entries for the event
  SELECT COUNT(*) INTO v_count
  FROM public.event_waitlist
  WHERE event_id = p_event_id;

  RETURN v_count;
END;
$$;

-- Grant execute to everyone (anon and authenticated)
GRANT EXECUTE ON FUNCTION public.get_waitlist_count(UUID) TO anon, authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_waitlist_count(UUID) IS
'Returns the number of users on the waitlist for an event without exposing their email addresses';
