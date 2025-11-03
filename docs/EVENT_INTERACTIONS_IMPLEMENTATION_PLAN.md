# Event Interactions Feature - Implementation Plan

## Overview

Build a modular, blockchain-ready event interaction system allowing creators to post announcements and attendees to engage through threaded replies, reactions (thumbs up/down), and nested comments. Feature is ticket-gated and uses Supabase Realtime for live updates, with data models designed for eventual blockchain migration.

---

## Core Features

### Event Creator Capabilities
- Post multiple announcement threads
- Pin important posts to top
- Delete any comment/reply
- Disable comments on specific posts
- View engagement analytics

### Attendee Capabilities
- Reply to creator posts
- React to posts (👍 agree / 👎 disagree)
- Like/unlike attendee replies
- View all interactions in real-time
- Thread-based conversations per post

### Access Control
- Only visible to users with valid event tickets
- Empty state for non-ticket holders
- Real-time ticket verification via Unlock Protocol

---

## Architecture Design

### 1. Database Schema (Blockchain-Ready)

```sql
-- ============================================================================
-- EVENT POSTS (Creator announcements)
-- Blockchain: Store on IPFS/Arweave, hash on-chain
-- ============================================================================
CREATE TABLE event_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  creator_address TEXT NOT NULL,  -- Ethereum address (for signature verification)

  -- Content (will be stored off-chain via IPFS in future)
  content TEXT NOT NULL,
  content_hash TEXT,  -- SHA-256 hash for integrity verification
  ipfs_cid TEXT,      -- IPFS Content ID (future migration)

  -- Moderation
  is_pinned BOOLEAN DEFAULT false,
  comments_enabled BOOLEAN DEFAULT true,
  is_deleted BOOLEAN DEFAULT false,

  -- Blockchain compatibility
  signature TEXT,  -- EIP-191 signature of content
  nonce BIGINT,    -- For replay protection
  chain_id INTEGER,
  block_number BIGINT,     -- When migrated to chain
  transaction_hash TEXT,   -- On-chain tx hash
  on_chain BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Indexes
  INDEX idx_event_posts_event_id (event_id),
  INDEX idx_event_posts_creator (creator_address),
  INDEX idx_event_posts_pinned (event_id, is_pinned, created_at)
);

-- ============================================================================
-- POST REACTIONS (Agree/Disagree - Thumbs up/down)
-- Blockchain: On-chain as attestations for verifiable engagement
-- ============================================================================
CREATE TABLE post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES event_posts(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,  -- Ethereum address

  -- Reaction type
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('agree', 'disagree')),

  -- Blockchain compatibility
  signature TEXT,           -- User's signature
  attestation_uid TEXT,     -- EAS attestation UID (when on-chain)
  transaction_hash TEXT,
  on_chain BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- One reaction type per user per post
  CONSTRAINT unique_post_reaction UNIQUE (post_id, user_address, reaction_type)
);

-- ============================================================================
-- POST COMMENTS (Attendee replies to posts)
-- Blockchain: IPFS for content, reference on-chain
-- ============================================================================
CREATE TABLE post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES event_posts(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,  -- For nested replies
  user_address TEXT NOT NULL,

  -- Content
  content TEXT NOT NULL,
  content_hash TEXT,
  ipfs_cid TEXT,

  -- Moderation
  is_deleted BOOLEAN DEFAULT false,
  deleted_by TEXT,  -- Address of who deleted (creator or self)

  -- Blockchain
  signature TEXT,
  nonce BIGINT,
  transaction_hash TEXT,
  on_chain BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  INDEX idx_post_comments_post (post_id, created_at),
  INDEX idx_post_comments_parent (parent_comment_id)
);

-- ============================================================================
-- COMMENT LIKES (Attendees like other comments)
-- Blockchain: Simple counter on-chain
-- ============================================================================
CREATE TABLE comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,

  -- Blockchain
  attestation_uid TEXT,
  on_chain BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT unique_comment_like UNIQUE (comment_id, user_address)
);

-- ============================================================================
-- ANALYTICS & CACHING (Performance optimization)
-- ============================================================================
CREATE TABLE post_engagement_stats (
  post_id UUID PRIMARY KEY REFERENCES event_posts(id) ON DELETE CASCADE,

  -- Cached counts (updated via triggers)
  agree_count INTEGER DEFAULT 0,
  disagree_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,

  -- Engagement score (for sorting)
  engagement_score NUMERIC DEFAULT 0,

  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE event_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- Public read access (frontend will filter by ticket ownership)
CREATE POLICY "Public read access" ON event_posts FOR SELECT USING (true);
CREATE POLICY "Public read access" ON post_reactions FOR SELECT USING (true);
CREATE POLICY "Public read access" ON post_comments FOR SELECT USING (true);
CREATE POLICY "Public read access" ON comment_likes FOR SELECT USING (true);

-- Insert policies (authenticated users only)
CREATE POLICY "Users can insert" ON event_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can insert" ON post_reactions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can insert" ON post_comments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can insert" ON comment_likes FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Update/Delete policies (own content only, or event creator)
CREATE POLICY "Users can update own posts" ON event_posts FOR UPDATE
  USING (creator_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

CREATE POLICY "Users can delete own comments" ON post_comments FOR DELETE
  USING (user_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

-- Auto-update engagement stats
CREATE OR REPLACE FUNCTION update_post_engagement_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO post_engagement_stats (post_id, agree_count, disagree_count, comment_count)
  VALUES (
    NEW.post_id,
    (SELECT COUNT(*) FROM post_reactions WHERE post_id = NEW.post_id AND reaction_type = 'agree'),
    (SELECT COUNT(*) FROM post_reactions WHERE post_id = NEW.post_id AND reaction_type = 'disagree'),
    (SELECT COUNT(*) FROM post_comments WHERE post_id = NEW.post_id AND is_deleted = false)
  )
  ON CONFLICT (post_id) DO UPDATE SET
    agree_count = EXCLUDED.agree_count,
    disagree_count = EXCLUDED.disagree_count,
    comment_count = EXCLUDED.comment_count,
    engagement_score = (EXCLUDED.agree_count + EXCLUDED.disagree_count + EXCLUDED.comment_count * 2),
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER post_reaction_stats_trigger
  AFTER INSERT OR DELETE ON post_reactions
  FOR EACH ROW EXECUTE FUNCTION update_post_engagement_stats();

CREATE TRIGGER post_comment_stats_trigger
  AFTER INSERT OR UPDATE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION update_post_engagement_stats();
```

### 2. Component Structure (Modular & Reusable)

```
src/components/interactions/
├── core/
│   ├── EventInteractionsCard.tsx      # Main card (preview mode)
│   ├── EventInteractionsDialog.tsx    # Full expanded view
│   └── InteractionsProvider.tsx       # Context for shared state
│
├── posts/
│   ├── PostList.tsx                   # List of creator posts
│   ├── PostItem.tsx                   # Individual post card
│   ├── PostComposer.tsx               # Create post (creator only)
│   ├── PostHeader.tsx                 # Post metadata & actions
│   ├── PostContent.tsx                # Post text display
│   ├── PostReactions.tsx              # Agree/Disagree buttons
│   └── PostStats.tsx                  # Engagement metrics
│
├── comments/
│   ├── CommentList.tsx                # Comments for a post
│   ├── CommentItem.tsx                # Individual comment
│   ├── CommentInput.tsx               # Reply input
│   ├── CommentLikeButton.tsx          # Like button
│   └── CommentThread.tsx              # Nested replies
│
├── moderation/
│   ├── PinPostButton.tsx              # Pin/unpin post
│   ├── DeleteButton.tsx               # Delete with confirmation
│   └── ToggleCommentsButton.tsx       # Enable/disable comments
│
└── hooks/
    ├── useEventPosts.ts               # Post CRUD + realtime
    ├── usePostReactions.ts            # Reactions management
    ├── usePostComments.ts             # Comments CRUD + realtime
    ├── useCommentLikes.ts             # Like management
    ├── useTicketVerification.ts       # Check ticket ownership
    └── useCreatorPermissions.ts       # Check if user is creator
```

### 3. Key Components Reference

**Main Card (Preview Mode):**
- Lives in EventDetails sidebar
- Shows post count and total comments
- Button to open expanded dialog
- Empty state for non-ticket holders
- Located at: `src/components/interactions/core/EventInteractionsCard.tsx`

**Expanded Dialog View:**
- Full-screen modal with tabs (All Posts / Pinned)
- Post composer for creators at top
- Scrollable post list with realtime updates
- Each post expands inline to show comments
- Located at: `src/components/interactions/core/EventInteractionsDialog.tsx`

**Post Composer:**
- Textarea with character count
- Preview mode
- Submit button (disabled while posting)
- Auto-focus on mount
- Located at: `src/components/interactions/posts/PostComposer.tsx`

**Post Item:**
- Header with creator badge, timestamp, pin status
- Content with read more expansion
- Reaction buttons (agree/disagree with counts)
- Comment count and toggle
- Moderation actions (creator only)
- Located at: `src/components/interactions/posts/PostItem.tsx`

**Comment Thread:**
- Nested replies (1 level deep)
- Like button for each comment
- Reply button to create nested comment
- Delete button (own comments or creator)
- Located at: `src/components/interactions/comments/CommentThread.tsx`

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal:** Basic post & comment functionality

**Tasks:**
1. Create database migration file
2. Build `EventInteractionsCard` component
3. Build `EventInteractionsDialog` component
4. Implement `useEventPosts` hook with Realtime
5. Create `PostComposer` component
6. Create `PostList` component
7. Integrate with EventDetails page
8. Add ticket verification logic

**Deliverables:**
- ✅ Database tables created
- ✅ Card displays in EventDetails
- ✅ Dialog opens with posts
- ✅ Creators can create posts
- ✅ Ticket holders see content
- ✅ Non-ticket holders see empty state

**Files Created:**
- `supabase/migrations/20251031000000_event_interactions.sql`
- `src/components/interactions/core/EventInteractionsCard.tsx`
- `src/components/interactions/core/EventInteractionsDialog.tsx`
- `src/components/interactions/posts/PostComposer.tsx`
- `src/components/interactions/posts/PostList.tsx`
- `src/components/interactions/posts/PostItem.tsx`
- `src/components/interactions/hooks/useEventPosts.ts`
- `src/components/interactions/hooks/useTicketVerification.ts`
- `src/components/interactions/hooks/useCreatorPermissions.ts`

### Phase 2: Reactions & Comments (Week 2)
**Goal:** Full interaction capabilities

**Tasks:**
1. Implement post reactions (agree/disagree)
2. Build comment system
3. Add comment likes
4. Implement nested replies
5. Add realtime updates for all interactions
6. Display engagement stats

**Deliverables:**
- ✅ Users can react to posts
- ✅ Users can comment on posts
- ✅ Users can reply to comments
- ✅ Users can like comments
- ✅ All interactions update in real-time

**Files Created:**
- `src/components/interactions/posts/PostReactions.tsx`
- `src/components/interactions/posts/PostStats.tsx`
- `src/components/interactions/comments/CommentList.tsx`
- `src/components/interactions/comments/CommentItem.tsx`
- `src/components/interactions/comments/CommentInput.tsx`
- `src/components/interactions/comments/CommentLikeButton.tsx`
- `src/components/interactions/comments/CommentThread.tsx`
- `src/components/interactions/hooks/usePostReactions.ts`
- `src/components/interactions/hooks/usePostComments.ts`
- `src/components/interactions/hooks/useCommentLikes.ts`

### Phase 3: Moderation (Week 3)
**Goal:** Creator control features

**Tasks:**
1. Implement pin/unpin posts
2. Add delete functionality for posts/comments
3. Toggle comments on/off per post
4. Add creator badge UI
5. Build moderation audit log
6. Add confirmation dialogs

**Deliverables:**
- ✅ Creators can pin posts
- ✅ Creators can delete any comment
- ✅ Creators can disable comments
- ✅ Creator actions are logged
- ✅ Confirmation before destructive actions

**Files Created:**
- `src/components/interactions/moderation/PinPostButton.tsx`
- `src/components/interactions/moderation/DeleteButton.tsx`
- `src/components/interactions/moderation/ToggleCommentsButton.tsx`

### Phase 4: Polish & Optimization (Week 4)
**Goal:** Production-ready

**Tasks:**
1. Add loading skeletons
2. Implement error boundaries
3. Add optimistic UI updates
4. Build analytics dashboard
5. Optimize with pagination/virtual scrolling
6. Mobile responsive testing
7. Accessibility audit
8. Performance testing

**Deliverables:**
- ✅ Smooth loading states
- ✅ Graceful error handling
- ✅ Instant UI feedback
- ✅ Creator analytics view
- ✅ Works on all screen sizes
- ✅ WCAG AA compliant
- ✅ < 1s initial load

---

## Integration Points

### EventDetails.tsx Changes

**Add import:**
```tsx
import { EventInteractionsCard } from '@/components/interactions/core/EventInteractionsCard';
```

**Add to sidebar (after EventAttestationCard):**
```tsx
<div className="space-y-6">
  {/* Existing cards */}
  <EventAttestationCard event={event} />

  {/* NEW: Event Interactions */}
  <EventInteractionsCard
    eventId={event.id}
    lockAddress={event.lock_address}
    creatorAddress={event.creator_id}
  />
</div>
```

---

## Blockchain Migration Strategy

### Design Principles
1. **Off-chain first, on-chain optional** - Start with Supabase, migrate incrementally
2. **Content on IPFS, metadata on-chain** - Store large data off-chain
3. **Cryptographic proofs** - Sign all content for verification
4. **Gas optimization** - Batch operations, only critical data on-chain

### Migration Path

**Stage 1: Signatures (Immediate)**
- Add EIP-191 signatures to all posts/comments
- Verify signatures off-chain
- Build reputation system based on signed content

**Stage 2: IPFS Integration (Month 2-3)**
- Upload post content to IPFS
- Store CID in database
- Fallback to database if IPFS unavailable

**Stage 3: On-Chain Attestations (Month 4-6)**
- Creator posts → EAS attestations (immutable record)
- Post reactions → On-chain votes (verifiable engagement)
- Build on-chain engagement graph

**Stage 4: Full Decentralization (Month 6+)**
- Smart contract for post registry
- Token-curated moderation
- On-chain governance for platform rules

### Blockchain Schema Mapping

```solidity
// Future smart contract structure
contract EventInteractions {
    struct Post {
        bytes32 contentHash;  // SHA-256 of content
        string ipfsCid;       // IPFS content ID
        address creator;
        uint256 timestamp;
        bool isPinned;
        bool commentsEnabled;
    }

    struct Reaction {
        address user;
        bool isAgree;  // true = agree, false = disagree
        uint256 timestamp;
    }

    mapping(bytes32 => Post) public posts;
    mapping(bytes32 => Reaction[]) public reactions;
    mapping(bytes32 => uint256) public commentCounts;

    event PostCreated(bytes32 indexed postId, address indexed creator, string ipfsCid);
    event ReactionAdded(bytes32 indexed postId, address indexed user, bool isAgree);
}
```

---

## Styling Consistency

Follow EventDetails patterns:

**Card wrapper:**
```tsx
<Card className="border-0 shadow-sm" />
```

**Section headers:**
```tsx
<div className="flex items-center space-x-2">
  <Icon className="w-5 h-5 text-primary" />
  <h3 className="font-semibold">Title</h3>
</div>
```

**Action buttons:**
```tsx
<Button variant="ghost" size="sm">
  <Icon className="w-4 h-4 mr-1" />
  <span>Action</span>
</Button>
```

**Metadata text:**
```tsx
<div className="text-xs text-muted-foreground">
  {timeAgo} • {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
</div>
```

**Item backgrounds:**
```tsx
<div className="p-3 rounded-lg bg-muted/40">
```

**Pinned items:**
```tsx
<div className="bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500">
```

---

## Testing Strategy

### Unit Tests
- Hook logic (CRUD operations)
- Signature verification (future)
- Ticket gating logic
- Comment threading logic

### Integration Tests
- Realtime subscriptions
- Creator permissions
- Nested comment threads
- Reaction counting

### E2E Tests
- Complete post → react → comment flow
- Moderation actions (pin, delete, toggle)
- Ticket verification gating
- Mobile interaction flow

---

## Success Metrics

### Engagement
- **Posts per event**: Target 3-5 creator posts
- **Comments per post**: Target 10+ for active events
- **Reaction rate**: Target 30% of ticket holders
- **Reply depth**: Average 2-3 levels of conversation

### Performance
- **Initial load**: < 1s
- **Realtime update latency**: < 500ms
- **Infinite scroll**: Smooth 60fps
- **Database queries**: < 100ms p95

### User Experience
- **Mobile usability**: 90%+ score
- **Zero layout shifts**: CLS < 0.1
- **Accessibility**: WCAG AA compliant
- **Error rate**: < 1% failed interactions

---

## Timeline Summary

- **Week 1**: Database + Basic Posts (Foundation)
- **Week 2**: Reactions + Comments (Interactions)
- **Week 3**: Moderation Features (Creator Tools)
- **Week 4**: Polish + Launch (Production Ready)

**Total**: 4 weeks to MVP, with blockchain migration path defined for future phases

---

## Developer Notes

### Realtime Subscriptions

```typescript
// Example pattern for Realtime
const subscription = supabase
  .channel('event-posts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'event_posts',
    filter: `event_id=eq.${eventId}`
  }, (payload) => {
    setPosts(prev => [payload.new, ...prev]);
  })
  .subscribe();
```

### Optimistic UI Pattern

```typescript
// Optimistic like
const handleLike = async (commentId: string) => {
  // Update UI immediately
  setComments(prev => prev.map(c =>
    c.id === commentId
      ? { ...c, like_count: c.like_count + 1, user_has_liked: true }
      : c
  ));

  // Send to server
  const { error } = await supabase.from('comment_likes').insert({
    comment_id: commentId,
    user_address: wallet.address
  });

  // Revert on error
  if (error) {
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, like_count: c.like_count - 1, user_has_liked: false }
        : c
    ));
    toast({ title: 'Error', description: error.message });
  }
};
```

### Ticket Verification

```typescript
// Check if user has valid ticket
const { data: hasTicket } = await checkKeyOwnership(
  event.lock_address,
  wallet.address
);

// Show gated content only if hasTicket === true
```

---

**Last Updated**: 2025-10-31
**Status**: Implementation Plan
**Next Steps**: Begin Phase 1 implementation
