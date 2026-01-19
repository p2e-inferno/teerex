import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken, getUserWalletAddresses } from "../_shared/privy.ts";
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

        // Get User Wallets
        const userWallets = await getUserWalletAddresses(privyUserId);
        if (!userWallets || userWallets.length === 0) {
            throw new Error("No connected wallets found regarding this user.");
        }
        const normalizedWallets = userWallets.map(w => w.toLowerCase());

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { action, attestationUid, schemaUid, ...payload } = await req.json();

        if (action === 'CREATE') {
            const { attester, recipient, event_id, data, expiration_time } = payload;

            // Verify user owns the "attester" wallet
            if (!normalizedWallets.includes(attester.toLowerCase())) {
                throw new Error("Unauthorized: Attester wallet does not belong to user");
            }

            const insertData = {
                attestation_uid: attestationUid, // UID from blockchain
                schema_uid: schemaUid,
                attester,
                recipient,
                event_id,
                data,
                expiration_time,
                created_at: new Date().toISOString(),
                // Note: lock_address and creator_address are handled by DB triggers usually, or could be passed.
                // We'll calculate them or let triggers do it if they exist.
                // If triggers don't exist, we might need to fetch event to get them, but typically `attestations` table might rely on triggers. 
                // Based on `attestationUtils.ts`, it says "trigger will populate...".
            };

            const { error } = await supabase.from('attestations').insert(insertData);
            if (error) {
                // Handle duplicate key error gracefully if needed
                if (error.code === '23505') {
                    return new Response(JSON.stringify({ success: false, error: 'Attestation already exists' }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }
                throw error;
            }

            return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === 'REVOKE') {
            if (!attestationUid) throw new Error("Attestation UID required");

            // Verify ownership before revoking. 
            // We need to fetch the attestation to check if the current user is the attester.
            const { data: attestation, error: fetchError } = await supabase
                .from('attestations')
                .select('attester')
                .eq('attestation_uid', attestationUid)
                .single();

            if (fetchError || !attestation) {
                throw new Error("Attestation not found");
            }

            if (!normalizedWallets.includes(attestation.attester.toLowerCase())) {
                throw new Error("Unauthorized: You are not the attester");
            }

            const { error } = await supabase
                .from('attestations')
                .update({
                    is_revoked: true,
                    revocation_time: new Date().toISOString()
                })
                .eq('attestation_uid', attestationUid);

            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        throw new Error("Invalid Action");

    } catch (error: any) {
        return handleError(error, privyUserId);
    }
});
