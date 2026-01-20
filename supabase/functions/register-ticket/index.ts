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
        const requestBody = await req.json();
        const { event_id, owner_wallet, grant_tx_hash, user_email } = requestBody;

        if (!event_id || !owner_wallet || !grant_tx_hash) {
            throw new Error("Missing required fields: event_id, owner_wallet, grant_tx_hash");
        }

        // Verify user owns the "owner_wallet"
        await validateUserWallet(privyUserId, owner_wallet, "Unauthorized: Wallet does not belong to user");
        const normalizedOwner = owner_wallet.toLowerCase();

        const insertData = {
            event_id,
            owner_wallet: normalizedOwner,
            grant_tx_hash,
            status: 'active',
            user_email: user_email || null,
            created_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('tickets').insert(insertData);

        if (error) {
            // Handle duplicate key error gracefully (idempotency)
            if (error.code === '23505') {
                // Check if it's actually the same ticket (same tx hash)
                console.log("Duplicate ticket insertion attempt, likely idempotent retry.");
                return new Response(JSON.stringify({ success: true, message: 'Ticket already registered' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            throw error;
        }

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error: any) {
        return handleError(error, privyUserId);
    }
});
