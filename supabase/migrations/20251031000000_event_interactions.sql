-- ============================================================================
-- Event Interactions Feature - Database Schema
-- Created: 2025-10-31
-- Purpose: Enable creators to post announcements and attendees to interact
-- ============================================================================

-- ============================================================================
-- EVENT POSTS (Creator announcements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.event_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  creator_address TEXT NOT NULL,

  -- Content
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 5000),
  content_hash TEXT,  -- SHA-256 for future integrity verification
  ipfs_cid TEXT,      -- IPFS CID for future decentralization

  -- Moderation
  is_pinned BOOLEAN DEFAULT false,
  comments_enabled BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,

  -- Blockchain compatibility (for future migration)
  signature TEXT,
  nonce BIGINT,
  chain_id INTEGER,
  block_number BIGINT,
  transaction_hash TEXT,
  on_chain BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_event_posts_event_id ON public.event_posts(event_id) WHERE is_deleted = false;
CREATE INDEX idx_event_posts_creator ON public.event_posts(creator_address);
CREATE INDEX idx_event_posts_pinned ON public.event_posts(event_id, is_pinned DESC, created_at DESC) WHERE is_deleted = false;

-- ============================================================================
-- POST REACTIONS (Agree/Disagree)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.event_posts(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,

  -- Reaction type
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('agree', 'disagree')),

  -- Blockchain compatibility
  signature TEXT,
  attestation_uid TEXT,
  transaction_hash TEXT,
  on_chain BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- One reaction type per user per post
  CONSTRAINT unique_post_reaction UNIQUE (post_id, user_address, reaction_type)
);

CREATE INDEX idx_post_reactions_post ON public.post_reactions(post_id);
CREATE INDEX idx_post_reactions_user ON public.post_reactions(user_address);

-- ============================================================================
-- POST COMMENTS (Attendee replies)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.event_posts(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,

  -- Content
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 2000),
  content_hash TEXT,
  ipfs_cid TEXT,

  -- Moderation
  is_deleted BOOLEAN DEFAULT false,
  deleted_by TEXT,

  -- Blockchain
  signature TEXT,
  nonce BIGINT,
  transaction_hash TEXT,
  on_chain BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_post_comments_post ON public.post_comments(post_id, created_at) WHERE is_deleted = false;
CREATE INDEX idx_post_comments_parent ON public.post_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- ============================================================================
-- COMMENT LIKES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,

  -- Blockchain
  attestation_uid TEXT,
  on_chain BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT unique_comment_like UNIQUE (comment_id, user_address)
);

CREATE INDEX idx_comment_likes_comment ON public.comment_likes(comment_id);

-- ============================================================================
-- ENGAGEMENT STATS (Cached counts for performance)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.post_engagement_stats (
  post_id UUID PRIMARY KEY REFERENCES public.event_posts(id) ON DELETE CASCADE,

  -- Cached counts
  agree_count INTEGER DEFAULT 0,
  disagree_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,

  -- Engagement score for sorting
  engagement_score NUMERIC DEFAULT 0,

  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update post engagement stats
CREATE OR REPLACE FUNCTION update_post_engagement_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
BEGIN
  -- Get the post_id from the affected row
  IF TG_TABLE_NAME = 'post_reactions' THEN
    IF TG_OP = 'DELETE' THEN
      v_post_id := OLD.post_id;
    ELSE
      v_post_id := NEW.post_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'post_comments' THEN
    IF TG_OP = 'DELETE' THEN
      v_post_id := OLD.post_id;
    ELSE
      v_post_id := NEW.post_id;
    END IF;
  END IF;

  -- Update or insert stats
  INSERT INTO public.post_engagement_stats (
    post_id,
    agree_count,
    disagree_count,
    comment_count,
    engagement_score,
    updated_at
  )
  SELECT
    v_post_id,
    COALESCE((SELECT COUNT(*) FROM public.post_reactions WHERE post_id = v_post_id AND reaction_type = 'agree'), 0),
    COALESCE((SELECT COUNT(*) FROM public.post_reactions WHERE post_id = v_post_id AND reaction_type = 'disagree'), 0),
    COALESCE((SELECT COUNT(*) FROM public.post_comments WHERE post_id = v_post_id AND is_deleted = false), 0),
    (
      COALESCE((SELECT COUNT(*) FROM public.post_reactions WHERE post_id = v_post_id AND reaction_type = 'agree'), 0) +
      COALESCE((SELECT COUNT(*) FROM public.post_reactions WHERE post_id = v_post_id AND reaction_type = 'disagree'), 0) +
      COALESCE((SELECT COUNT(*) FROM public.post_comments WHERE post_id = v_post_id AND is_deleted = false), 0) * 2
    ),
    now()
  ON CONFLICT (post_id) DO UPDATE SET
    agree_count = EXCLUDED.agree_count,
    disagree_count = EXCLUDED.disagree_count,
    comment_count = EXCLUDED.comment_count,
    engagement_score = EXCLUDED.engagement_score,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Triggers for engagement stats
CREATE TRIGGER post_reaction_stats_trigger
  AFTER INSERT OR DELETE ON public.post_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_post_engagement_stats();

CREATE TRIGGER post_comment_stats_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_post_engagement_stats();

-- Note: update_updated_at_column() function already exists (fixed in 20251030000001_fix_function_search_path.sql)
-- Using the existing function for triggers

-- Triggers for updated_at
CREATE TRIGGER update_event_posts_updated_at
  BEFORE UPDATE ON public.event_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_post_comments_updated_at
  BEFORE UPDATE ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.event_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_engagement_stats ENABLE ROW LEVEL SECURITY;

-- Public read access (frontend filters by ticket ownership)
CREATE POLICY "Public read event_posts" ON public.event_posts
  FOR SELECT USING (true);

CREATE POLICY "Public read post_reactions" ON public.post_reactions
  FOR SELECT USING (true);

CREATE POLICY "Public read post_comments" ON public.post_comments
  FOR SELECT USING (true);

CREATE POLICY "Public read comment_likes" ON public.comment_likes
  FOR SELECT USING (true);

CREATE POLICY "Public read post_engagement_stats" ON public.post_engagement_stats
  FOR SELECT USING (true);

-- Insert policies (authenticated users)
CREATE POLICY "Authenticated users can insert posts" ON public.event_posts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert reactions" ON public.post_reactions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert comments" ON public.post_comments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert likes" ON public.comment_likes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Update policies
CREATE POLICY "Users can update own posts" ON public.event_posts
  FOR UPDATE USING (
    creator_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
  );

CREATE POLICY "Users can update own comments" ON public.post_comments
  FOR UPDATE USING (
    user_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
  );

-- Delete policies
CREATE POLICY "Users can delete own reactions" ON public.post_reactions
  FOR DELETE USING (
    user_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
  );

CREATE POLICY "Users can delete own comments" ON public.post_comments
  FOR DELETE USING (
    user_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
  );

CREATE POLICY "Users can delete own likes" ON public.comment_likes
  FOR DELETE USING (
    user_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.event_posts IS 'Creator announcements and posts for events';
COMMENT ON TABLE public.post_reactions IS 'User reactions (agree/disagree) to posts';
COMMENT ON TABLE public.post_comments IS 'Comments and replies on posts';
COMMENT ON TABLE public.comment_likes IS 'Likes on comments';
COMMENT ON TABLE public.post_engagement_stats IS 'Cached engagement metrics for posts';

COMMENT ON FUNCTION update_post_engagement_stats IS 'Auto-updates engagement statistics with explicit search_path for security';
