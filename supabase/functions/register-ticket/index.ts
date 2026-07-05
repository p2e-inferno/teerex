import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken, validateUserWallet } from "../_shared/privy.ts";
import { handleError } from "../_shared/error-handler.ts";
import { getEventPurchaseMessageSnapshot } from "../_shared/purchase-message.ts";
import { notifyTicketIssuedTelegram } from "../_shared/telegram-dispatch.ts";
import {
    getPublishedPurchaseFormSchema,
    validatePurchaseFormResponse,
    type PurchaseFormResponseSnapshot,
} from "../_shared/purchase-form.ts";

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
        const { event_id, owner_wallet, grant_tx_hash, user_email, purchase_form_response } = requestBody;

        if (!event_id || !owner_wallet || !grant_tx_hash) {
            throw new Error("Missing required fields: event_id, owner_wallet, grant_tx_hash");
        }

        // Verify user owns the "owner_wallet"
        await validateUserWallet(privyUserId, owner_wallet, "Unauthorized: Wallet does not belong to user");
        const normalizedOwner = owner_wallet.toLowerCase();

        // Snapshot the current purchase confirmation message so the attendee
        // keeps the version they received even if the creator edits it later.
        const purchaseMessageSnapshot = await getEventPurchaseMessageSnapshot(supabase, event_id);

        // Validate the purchase-form response against the live schema and build
        // the per-ticket snapshot.
        const { schema: formSchema, updatedAt: formSchemaUpdatedAt } =
            await getPublishedPurchaseFormSchema(supabase, event_id);
        let formResponseSnapshot: PurchaseFormResponseSnapshot | null = null;
        if (formSchema) {
            try {
                const { values, labels } = validatePurchaseFormResponse(formSchema, purchase_form_response);
                formResponseSnapshot = {
                    schema_updated_at: formSchemaUpdatedAt,
                    values,
                    labels,
                };
            } catch (err) {
                return new Response(
                    JSON.stringify({
                        error: err instanceof Error ? err.message : "Invalid purchase form response.",
                    }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
                );
            }
        }

        const nowIso = new Date().toISOString();

        const insertData = {
            event_id,
            owner_wallet: normalizedOwner,
            grant_tx_hash,
            status: 'active',
            user_email: user_email || null,
            created_at: nowIso,
            purchase_confirmation_message_snapshot: purchaseMessageSnapshot,
            purchase_confirmation_message_snapshot_at: purchaseMessageSnapshot ? nowIso : null,
            purchase_form_response_snapshot: formResponseSnapshot,
            purchase_form_schema_version_at: formResponseSnapshot ? formSchemaUpdatedAt : null,
        };

        const { error } = await supabase.from('tickets').insert(insertData);

        if (error) {
            // Handle duplicate key error gracefully (idempotency). Return the
            // existing ticket snapshot, not the current event message.
            if (error.code === '23505') {
                console.log("Duplicate ticket insertion attempt, likely idempotent retry.");
                const { data: existingTicket } = await supabase
                    .from('tickets')
                    .select('purchase_confirmation_message_snapshot')
                    .eq('event_id', event_id)
                    .eq('owner_wallet', normalizedOwner)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false })
                    .maybeSingle();

                return new Response(
                    JSON.stringify({
                        success: true,
                        message: 'Ticket already registered',
                        purchase_confirmation_message_snapshot:
                            existingTicket?.purchase_confirmation_message_snapshot ?? null,
                    }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
            throw error;
        }

        notifyTicketIssuedTelegram(supabase, {
            eventId: event_id,
            ownerWallet: normalizedOwner,
            txHash: grant_tx_hash,
        }).catch((err) => {
            console.error("[register-ticket] Failed to trigger Telegram ticket notification:", err?.message || err);
        });

        return new Response(
            JSON.stringify({
                success: true,
                purchase_confirmation_message_snapshot: purchaseMessageSnapshot,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        return handleError(error, privyUserId);
    }
});
