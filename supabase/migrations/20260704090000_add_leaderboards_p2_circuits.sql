-- Leaderboards P2: organizer circuits with materialized standings.
-- A board aggregates one organizer's final game_results for one game (optionally bounded to a
-- season window). Standings are precomputed (read-heavy/write-light) by the shared TS scoring
-- module and persisted atomically via replace_board_standings — scoring math is never
-- duplicated in SQL. Access stays fully server-mediated: service_role grants only.

-- =============================================================================================
-- leaderboard_boards
-- =============================================================================================
CREATE TABLE public.leaderboard_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'event' and 'official_game' are reserved for later tiers; P2 creates organizer circuits only.
  scope TEXT NOT NULL DEFAULT 'organizer_circuit'
    CHECK (scope IN ('event', 'organizer_circuit', 'official_game')),
  game_id UUID NOT NULL REFERENCES public.games(id),
  organizer_id TEXT,                                     -- events.creator_id (Privy sub)
  name TEXT NOT NULL,
  season_label TEXT,

  -- Optional season window applied to the source event date during recompute.
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,

  -- NULL = use the game's scoring_profile.
  scoring_profile JSONB,

  is_active BOOLEAN NOT NULL DEFAULT true,
  last_recomputed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT circuit_requires_organizer
    CHECK (scope <> 'organizer_circuit' OR organizer_id IS NOT NULL),
  CONSTRAINT valid_board_name CHECK (length(trim(name)) BETWEEN 2 AND 80),
  CONSTRAINT valid_season_window
    CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

CREATE UNIQUE INDEX idx_leaderboard_boards_organizer_game_name
  ON public.leaderboard_boards(organizer_id, game_id, lower(name));
CREATE INDEX idx_leaderboard_boards_game_id ON public.leaderboard_boards(game_id);
CREATE INDEX idx_leaderboard_boards_organizer_id
  ON public.leaderboard_boards(organizer_id) WHERE organizer_id IS NOT NULL;
CREATE INDEX idx_leaderboard_boards_active_recompute
  ON public.leaderboard_boards(last_recomputed_at) WHERE is_active;

-- =============================================================================================
-- leaderboard_standings (materialized rows; fully replaced on each recompute)
-- =============================================================================================
CREATE TABLE public.leaderboard_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  board_id UUID NOT NULL REFERENCES public.leaderboard_boards(id) ON DELETE CASCADE,

  -- Resolved Privy sub when known, else the lowercase wallet: one row per player per board.
  player_key TEXT NOT NULL,
  player_id TEXT,
  wallet_address TEXT,

  rank INTEGER NOT NULL CHECK (rank >= 1),
  points NUMERIC NOT NULL DEFAULT 0,
  events_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,

  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Replace/upsert target (non-partial unique); its leading column also serves as the FK index.
CREATE UNIQUE INDEX idx_leaderboard_standings_board_player_unique
  ON public.leaderboard_standings(board_id, player_key);
CREATE INDEX idx_leaderboard_standings_player_id
  ON public.leaderboard_standings(player_id) WHERE player_id IS NOT NULL;

-- =============================================================================================
-- app_user_profiles.display_name (public player name; email remains server-only PII)
-- =============================================================================================
ALTER TABLE public.app_user_profiles ADD COLUMN display_name TEXT
  CHECK (display_name IS NULL OR length(trim(display_name)) BETWEEN 2 AND 40);

-- =============================================================================================
-- RPC: replace_board_standings
-- Atomic delete-then-insert of a board's standings set (computed by the edge function); a
-- mid-failure must never leave a board half-replaced.
-- =============================================================================================
CREATE OR REPLACE FUNCTION public.replace_board_standings(
  p_board_id uuid,
  p_rows jsonb
)
RETURNS integer
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Lock the board row so concurrent recomputes (cron + organizer edit + admin) serialize
  -- instead of colliding on the (board_id, player_key) unique index.
  PERFORM 1 FROM public.leaderboard_boards WHERE id = p_board_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'board_not_found';
  END IF;

  DELETE FROM public.leaderboard_standings WHERE board_id = p_board_id;

  INSERT INTO public.leaderboard_standings (
    board_id, player_key, player_id, wallet_address, rank, points, events_played, wins, computed_at
  )
  SELECT
    p_board_id,
    r->>'player_key',
    NULLIF(r->>'player_id', ''),
    NULLIF(lower(r->>'wallet_address'), ''),
    (r->>'rank')::int,
    COALESCE((r->>'points')::numeric, 0),
    COALESCE((r->>'events_played')::int, 0),
    COALESCE((r->>'wins')::int, 0),
    now()
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) r;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.leaderboard_boards
  SET last_recomputed_at = now()
  WHERE id = p_board_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_board_standings(uuid, jsonb) TO service_role;

-- =============================================================================================
-- RLS + grants (server-only)
-- =============================================================================================
ALTER TABLE public.leaderboard_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_standings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leaderboard_boards TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leaderboard_standings TO service_role;

CREATE POLICY "Service role full access on leaderboard_boards"
  ON public.leaderboard_boards FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on leaderboard_standings"
  ON public.leaderboard_standings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_leaderboard_boards_updated_at
  BEFORE UPDATE ON public.leaderboard_boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_leaderboard_standings_updated_at
  BEFORE UPDATE ON public.leaderboard_standings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.leaderboard_boards IS 'Circuit/official leaderboard definitions; standings materialized per board.';
COMMENT ON TABLE public.leaderboard_standings IS 'Precomputed board standings, fully replaced by replace_board_standings on recompute.';
