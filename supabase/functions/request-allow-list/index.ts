import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";
import { handleError } from "../_shared/error-handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: buildPreflightHeaders(req) });
    }

    let privyUserId: string | undefined;

    try {
        const authHeader = req.headers.get("X-Privy-Authorization");
        privyUserId = await verifyPrivyToken(authHeader);

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { event_id, user_email, wallet_address } = await req.json();

        if (!event_id || !user_email || !wallet_address) {
            throw new Error("Missing event_id, user_email, or wallet_address");
        }

        // Validate wallet ownership - required for allow list requests
        // This prevents users from claiming allow-list spots with wallets they don't own
        const validatedWalletAddress = await validateUserWallet(
            privyUserId,
            wallet_address,
            "Unauthorized: Wallet address does not belong to authenticated user"
        );

        const { data, error } = await supabase
            .from('event_allow_list_requests')
            .insert({
                event_id,
                user_email,
                wallet_address: validatedWalletAddress
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return new Response(JSON.stringify({ success: false, error: 'Request already sent', code: '23505' }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            throw error;
        }

        return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error: any) {
        return handleError(error, privyUserId);
    }
});
