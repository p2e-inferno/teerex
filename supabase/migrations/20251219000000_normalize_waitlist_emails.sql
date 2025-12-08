-- Normalize event_waitlist user_email to lowercase, resolve dupes, and enforce case-insensitive uniqueness

-- 1) Drop existing unique constraint/index on (event_id, user_email) if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'event_waitlist_event_id_user_email_key'
  ) THEN
    EXECUTE 'ALTER TABLE public.event_waitlist DROP CONSTRAINT event_waitlist_event_id_user_email_key';
  END IF;
END$$;

-- 2) Normalize existing emails to lowercase/trim; keep earliest created_at per event/email
WITH cleaned AS (
  SELECT
    id,
    event_id,
    lower(trim(user_email)) AS normalized_email,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY event_id, lower(trim(user_email)) ORDER BY created_at ASC, id ASC) AS rn
  FROM public.event_waitlist
  WHERE user_email IS NOT NULL
)
UPDATE public.event_waitlist ew
SET user_email = c.normalized_email
FROM cleaned c
WHERE ew.id = c.id
  AND c.rn = 1;

-- Delete duplicates (keep the earliest row from the CTE above)
DELETE FROM public.event_waitlist ew
USING (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY event_id, lower(trim(user_email)) ORDER BY created_at ASC, id ASC) AS rn
    FROM public.event_waitlist
    WHERE user_email IS NOT NULL
  ) d
  WHERE d.rn > 1
) dupes
WHERE ew.id = dupes.id;

-- 3) Create functional unique index for case-insensitive uniqueness
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'event_waitlist_event_email_ci'
  ) THEN
    -- Not using CONCURRENTLY because this migration runs inside a single transaction
    EXECUTE 'CREATE UNIQUE INDEX event_waitlist_event_email_ci ON public.event_waitlist (event_id, lower(user_email)) WHERE user_email IS NOT NULL';
  END IF;
END$$;
