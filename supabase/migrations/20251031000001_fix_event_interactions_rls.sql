-- ============================================================================
-- Fix Event Interactions RLS Policies
-- Created: 2025-10-31
-- Purpose: Secure event interactions via edge functions with service role
-- Note: All mutations go through edge functions that verify authorization
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.event_posts;
DROP POLICY IF EXISTS "Authenticated users can insert reactions" ON public.post_reactions;
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.post_comments;
DROP POLICY IF EXISTS "Authenticated users can insert likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Anyone can create event posts" ON public.event_posts;
DROP POLICY IF EXISTS "Anyone can create post reactions" ON public.post_reactions;
DROP POLICY IF EXISTS "Anyone can create post comments" ON public.post_comments;
DROP POLICY IF EXISTS "Anyone can create comment likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Users can update own posts" ON public.event_posts;
DROP POLICY IF EXISTS "Users can update own comments" ON public.post_comments;
DROP POLICY IF EXISTS "Anyone can update event posts" ON public.event_posts;
DROP POLICY IF EXISTS "Anyone can update post comments" ON public.post_comments;

-- Create service-role only policies for insert/update
-- Edge functions use SUPABASE_SERVICE_ROLE_KEY for authorization
CREATE POLICY "Service role can insert posts" ON public.event_posts
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can update posts" ON public.event_posts
  FOR UPDATE USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can insert reactions" ON public.post_reactions
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can insert comments" ON public.post_comments
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can update comments" ON public.post_comments
  FOR UPDATE USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can insert likes" ON public.comment_likes
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Delete policies remain unchanged (already check user_address from JWT)
-- Read policies remain unchanged (public read access for ticket holders)
