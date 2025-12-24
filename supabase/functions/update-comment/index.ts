/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { getUserWalletAddresses, verifyPrivyToken } from "../_shared/privy.ts";
import { isAnyUserWalletIsLockManagerParallel } from "../_shared/unlock.ts";
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
    const commentId: string | undefined = body.commentId;
    const updates: any = body.updates;

    if (!commentId || !updates || typeof updates !== "object") {
      throw new Error("Missing required fields: commentId, updates");
    }

    // Validate allowed update fields
    const allowedFields = ["content", "is_deleted"];
    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0) {
      throw new Error("No update fields provided");
    }
    for (const key of updateKeys) {
      if (!allowedFields.includes(key)) {
        throw new Error(`Invalid update field: ${key}`);
      }
    }

    // Validate content if provided
    if ("content" in updates) {
      const content = updates.content;
      if (typeof content !== "string") {
        throw new Error("Content must be a string");
      }
      if (content.trim().length === 0 || content.length > 2000) {
        throw new Error("Content must be between 1 and 2000 characters");
      }
      // Trim content
      updates.content = content.trim();
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Get comment details
    const { data: comment, error: commentError } = await supabase
      .from("post_comments")
      .select("id, post_id, user_address, is_deleted")
      .eq("id", commentId)
      .maybeSingle();

    if (commentError || !comment) {
      throw new Error("Comment not found");
    }

    // Cannot edit deleted comments
    if (comment.is_deleted && "content" in updates) {
      throw new Error("Cannot edit deleted comments");
    }

    // 4. Get post and event details
    const { data: post, error: postError } = await supabase
      .from("event_posts")
      .select("id, event_id")
      .eq("id", comment.post_id)
      .maybeSingle();

    if (postError || !post) {
      throw new Error("Post not found");
    }

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

    // 5. Get user wallets
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

    // 6. Validate chain and get network configuration
    const networkConfig = await validateChain(supabase, event.chain_id);
    if (!networkConfig) {
      throw new Error("Chain not supported or not active");
    }

    if (!networkConfig.rpc_url) {
      throw new Error("Network not fully configured (missing RPC URL)");
    }

    // 7. Authorization based on update type
    const isEdit = "content" in updates;
    const isDelete = "is_deleted" in updates;

    // Check if user is comment owner
    const isCommentOwner = normalizedWallets.some(
      (w) => w.toLowerCase() === comment.user_address.toLowerCase()
    );

    if (isEdit) {
      // Edit: ONLY comment owner can edit their own comments
      if (!isCommentOwner) {
        throw new Error("Unauthorized: Only comment owner can edit comments");
      }
    }

    if (isDelete) {
      // Delete: Comment owner OR lock manager can delete
      if (!isCommentOwner && !(isCreatorByWallet || isCreatorById)) {
        // Check if user is lock manager
        const { anyIsManager } = await isAnyUserWalletIsLockManagerParallel(
          event.lock_address,
          normalizedWallets,
          networkConfig.rpc_url
        );

        if (!anyIsManager) {
          throw new Error("Unauthorized: Only comment owner, event creator, or lock manager can delete comments");
        }
      }
    }

    // 8. Update comment
    const { error: updateError } = await supabase
      .from("post_comments")
      .update(updates)
      .eq("id", commentId);

    if (updateError) {
      throw new Error(`Failed to update comment: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[update-comment] error:", (error as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
