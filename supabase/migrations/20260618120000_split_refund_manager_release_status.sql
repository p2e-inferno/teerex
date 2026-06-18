-- Separate protected-event outcome status from lock-manager release state.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS refund_manager_released BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_manager_released_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.events.refund_manager_released
  IS 'Whether protected-event lock-manager control has been released back to the creator. This is operational state, not the event outcome.';

COMMENT ON COLUMN public.events.refund_manager_released_at
  IS 'Best-known timestamp when protected-event lock-manager control was observed as released.';

COMMENT ON COLUMN public.events.refund_status
  IS 'Cached protected-event outcome/status: protected, threshold_met, refund_available, refund_in_progress, refunded, creator_only_refund_window. Legacy released rows are backfilled when inferable; manager release is tracked separately in refund_manager_released.';

UPDATE public.events
SET
  refund_manager_released = true,
  refund_manager_released_at = COALESCE(refund_manager_released_at, refund_last_synced_at, updated_at)
WHERE refund_protection_enabled = true
  AND refund_status = 'released';

UPDATE public.events AS e
SET refund_status = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.tickets AS t
    WHERE t.event_id = e.id
      AND t.status = 'refunded'
  ) THEN 'refunded'
  WHEN e.refund_min_attendees IS NOT NULL
    AND (
      SELECT count(*)
      FROM public.tickets AS t
      WHERE t.event_id = e.id
        AND t.status IN ('active', 'refunded')
    ) >= e.refund_min_attendees
  THEN 'threshold_met'
  ELSE 'refunded'
END
WHERE e.refund_protection_enabled = true
  AND e.refund_status = 'released';
