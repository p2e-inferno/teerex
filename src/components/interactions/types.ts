/**
 * TypeScript types for Event Interactions feature
 */

export interface EventPost {
  id: string;
  event_id: string;
  creator_address: string;
  content: string;
  content_hash: string | null;
  ipfs_cid: string | null;
  is_pinned: boolean;
  comments_enabled: boolean;
  is_deleted: boolean;
  signature: string | null;
  nonce: number | null;
  chain_id: number | null;
  block_number: number | null;
  transaction_hash: string | null;
  on_chain: boolean;
  created_at: string;
  updated_at: string;

  // Joined data from engagement stats
  agree_count?: number;
  disagree_count?: number;
  comment_count?: number;
  engagement_score?: number;

  // User-specific data
  user_has_reacted_agree?: boolean;
  user_has_reacted_disagree?: boolean;
}

export interface PostReaction {
  id: string;
  post_id: string;
  user_address: string;
  reaction_type: 'agree' | 'disagree';
  signature: string | null;
  attestation_uid: string | null;
  transaction_hash: string | null;
  on_chain: boolean;
  created_at: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  user_address: string;
  content: string;
  content_hash: string | null;
  ipfs_cid: string | null;
  is_deleted: boolean;
  deleted_by: string | null;
  signature: string | null;
  nonce: number | null;
  transaction_hash: string | null;
  on_chain: boolean;
  created_at: string;
  updated_at: string;

  // Joined data
  like_count?: number;
  user_has_liked?: boolean;

  // Nested replies
  replies?: PostComment[];
}

export interface CommentLike {
  id: string;
  comment_id: string;
  user_address: string;
  attestation_uid: string | null;
  on_chain: boolean;
  created_at: string;
}

export interface PostEngagementStats {
  post_id: string;
  agree_count: number;
  disagree_count: number;
  comment_count: number;
  engagement_score: number;
  updated_at: string;
}

// ============================================================================
// Supabase Query Types (with joined data)
// ============================================================================

export interface EventPostWithStats extends EventPost {
  post_engagement_stats: PostEngagementStats | null;
  post_reactions: PostReaction[];
}

export interface PostCommentWithLikes extends PostComment {
  comment_likes: CommentLike[];
}

// ============================================================================
// Form/Input Types
// ============================================================================

export interface CreatePostInput {
  event_id: string;
  creator_address: string;
  content: string;
}

export interface CreateReactionInput {
  post_id: string;
  user_address: string;
  reaction_type: 'agree' | 'disagree';
}

export interface CreateCommentInput {
  post_id: string;
  parent_comment_id?: string | null;
  user_address: string;
  content: string;
}

export interface CreateLikeInput {
  comment_id: string;
  user_address: string;
}

// ============================================================================
// Hook Return Types
// ============================================================================

export interface UseEventPostsReturn {
  posts: EventPost[];
  isLoading: boolean;
  error: Error | null;
  createPost: (content: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  pinPost: (postId: string, isPinned: boolean) => Promise<void>;
  toggleComments: (postId: string, enabled: boolean) => Promise<void>;
  refetch: () => Promise<void>;
}

export interface UsePostReactionsReturn {
  toggleReaction: (postId: string, reactionType: 'agree' | 'disagree') => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export interface UsePostCommentsReturn {
  comments: PostComment[];
  isLoading: boolean;
  error: Error | null;
  addComment: (postId: string, content: string, parentId?: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export interface UseCommentLikesReturn {
  toggleLike: (commentId: string) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export interface UseTicketVerificationReturn {
  hasTicket: boolean;
  isChecking: boolean;
  ticketCount: number;
  error: Error | null;
  refetch: () => void;
}

export interface UseCreatorPermissionsReturn {
  isCreator: boolean;
  isChecking: boolean;
}
