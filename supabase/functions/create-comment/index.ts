/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { getUserWalletAddresses } from "../_shared/privy.ts";
import { isAnyUserWalletHasValidKeyParallel } from "../_shared/unlock.ts";
import {
  createRemoteJWKSet,
  jwtVerify,
  importSPKI,
} from "https://deno.land/x/jose@v4.14.4/index.ts";
import { validateChain } from "../_shared/network-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRIVY_APP_ID = Deno.env.get("VITE_PRIVY_APP_ID")!;
const PRIVY_VERIFICATION_KEY = Deno.env.get("PRIVY_VERIFICATION_KEY");

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
    const token = authHeader.split(" ")[1];

    let privyUserId: string | undefined;
    try {
      // Primary: JWKS verification with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("JWKS verification timeout after 3 seconds")), 3000)
      );
      const jwksPromise = (async () => {
        const JWKS = createRemoteJWKSet(
          new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`)
        );
        const { payload} = await jwtVerify(token, JWKS, {
          issuer: "privy.io",
          audience: PRIVY_APP_ID,
        });
        return payload;
      })();
      const payload: any = await Promise.race([jwksPromise, timeoutPromise]);
      privyUserId = payload.sub as string | undefined;
    } catch (jwksError) {
      // Fallback: Local JWT verification
      if (!PRIVY_VERIFICATION_KEY) throw jwksError;
      const publicKey = await importSPKI(PRIVY_VERIFICATION_KEY, "ES256");
      const { payload } = await jwtVerify(token, publicKey, {
        issuer: "privy.io",
        audience: PRIVY_APP_ID,
      });
      privyUserId = (payload as any).sub as string | undefined;
    }
    if (!privyUserId) {
      throw new Error("Token verification failed");
    }

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
      .select("id, lock_address, chain_id")
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

    // 7. Validate chain and get network configuration
    const networkConfig = await validateChain(supabase, event.chain_id);
    if (!networkConfig) {
      throw new Error("Chain not supported or not active");
    }

    if (!networkConfig.rpc_url) {
      throw new Error("Network not fully configured (missing RPC URL)");
    }

    // 8. Authorization: ONLY key holders (ticket holders) can comment
    const { anyHasKey, holder } = await isAnyUserWalletHasValidKeyParallel(
      event.lock_address,
      userWallets,
      networkConfig.rpc_url
    );

    if (!anyHasKey) {
      throw new Error("Unauthorized: You must hold a valid ticket to comment on posts");
    }

    // 9. Insert comment
    const { data: newComment, error: insertError } = await supabase
      .from("post_comments")
      .insert({
        post_id: postId,
        parent_comment_id: parentCommentId || null,
        user_address: holder!.toLowerCase(),
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
