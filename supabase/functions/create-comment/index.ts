/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { getUserWalletAddresses, verifyPrivyToken } from "../_shared/privy.ts";
import { isAnyUserWalletHasValidKeyParallel, isAnyUserWalletIsLockManagerParallel } from "../_shared/unlock.ts";
import { validateChain } from "../_shared/network-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    // 1. Authenticate via Privy JWT
    const authHeader = req.headers.get("X-Privy-Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing or invalid X-Privy-Authorization header" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }
    const privyUserId = await verifyPrivyToken(authHeader);

    // 2. Parse and validate request body
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const postId: string | undefined = body.postId;
    const content: string | undefined = body.content;
    const parentCommentId: string | undefined = body.parentCommentId;

    if (!postId || !content) {
      throw new Error("Missing required fields: postId, content");
    }
    if (content.trim().length === 0 || content.length > 2000) {
      throw new Error("Content must be between 1 and 2000 characters");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Get post and verify comments are enabled
    const { data: post, error: postError } = await supabase
      .from("event_posts")
      .select("id, event_id, comments_enabled")
      .eq("id", postId)
      .maybeSingle();

    if (postError || !post) {
      throw new Error("Post not found");
    }

    if (!post.comments_enabled) {
      throw new Error("Comments are disabled for this post");
    }

    // 4. If parentCommentId provided, verify it exists
    if (parentCommentId) {
      const { data: parentComment } = await supabase
        .from("post_comments")
        .select("id")
        .eq("id", parentCommentId)
        .eq("post_id", postId)
        .eq("is_deleted", false)
        .maybeSingle();

      if (!parentComment) {
        throw new Error("Parent comment not found");
      }
    }

    // 5. Get event details
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, lock_address, chain_id, creator_id")
      .eq("id", post.event_id)
      .maybeSingle();

    if (eventError || !event) {
      throw new Error("Event not found");
    }

    if (!event.lock_address) {
      throw new Error("Event has no lock address");
    }

    // 6. Get user wallets
    const userWallets = await getUserWalletAddresses(privyUserId);
    if (!userWallets || userWallets.length === 0) {
      throw new Error("No wallet addresses found for user");
    }
    const normalizedWallets = userWallets.map((addr) => addr.toLowerCase());
    const creatorAddress = (event as any).creator_address
      ? (event as any).creator_address.toLowerCase()
      : undefined;
    const isCreatorByWallet = creatorAddress ? normalizedWallets.includes(creatorAddress) : false;
    const isCreatorById = event.creator_id ? event.creator_id === privyUserId : false;

    // 7. Validate chain and get network configuration
    const networkConfig = await validateChain(supabase, event.chain_id);
    if (!networkConfig) {
      throw new Error("Chain not supported or not active");
    }

    if (!networkConfig.rpc_url) {
      throw new Error("Network not fully configured (missing RPC URL)");
    }

    // 8. Authorization: creators, lock managers, or key holders can comment
    const [{ anyHasKey, holder }, { anyIsManager, manager }] = await Promise.all([
      isAnyUserWalletHasValidKeyParallel(event.lock_address, normalizedWallets, networkConfig.rpc_url),
      isAnyUserWalletIsLockManagerParallel(event.lock_address, normalizedWallets, networkConfig.rpc_url),
    ]);

    if (!(isCreatorByWallet || isCreatorById || anyIsManager || anyHasKey)) {
      throw new Error("Unauthorized: You must be an event creator, lock manager, or ticket holder to comment");
    }

    let commenterAddress: string | undefined;
    if (isCreatorByWallet) {
      commenterAddress = creatorAddress;
    } else if (anyIsManager) {
      commenterAddress = manager;
    } else if (anyHasKey) {
      commenterAddress = holder;
    } else if (isCreatorById && normalizedWallets.length > 0) {
      commenterAddress = normalizedWallets[0];
    }
    if (!commenterAddress) {
      throw new Error("Unable to resolve commenter address");
    }

    // 9. Insert comment
    const { data: newComment, error: insertError } = await supabase
      .from("post_comments")
      .insert({
        post_id: postId,
        parent_comment_id: parentCommentId || null,
        user_address: commenterAddress.toLowerCase(),
        content: content.trim(),
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create comment: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({ ok: true, commentId: newComment.id, comment: newComment }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[create-comment] error:", (error as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
