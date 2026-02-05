import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken } from "../_shared/privy.ts";
import { handleError } from "../_shared/error-handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Whitelist of allowed fields for draft operations
// This prevents clients from setting protected fields like user_id, id, created_at
const ALLOWED_DRAFT_FIELDS = [
    'title',
    'description',
    'date',
    'end_date',
    'time',
    'timezone_offset_minutes',
    'location',
    'event_type',
    'capacity',
    'price',
    'currency',
    'ngn_price',
    'payment_methods',
    'paystack_public_key',
    'category',
    'image_url',
    'image_crop_x',
    'image_crop_y',
    'ticket_duration',
    'custom_duration_days',
    'is_public',
    'allow_waitlist',
    'has_allow_list',
    'transferable',
    'chain_id'
];

// Sanitize payload to only include allowed fields
function sanitizePayload(payload: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    for (const field of ALLOWED_DRAFT_FIELDS) {
        if (field in payload) {
            sanitized[field] = payload[field];
        }
    }
    return sanitized;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: buildPreflightHeaders(req) });
    }

    let privyUserId: string | undefined;

    try {
        // 1. Authenticate
        const authHeader = req.headers.get("X-Privy-Authorization");
        privyUserId = await verifyPrivyToken(authHeader);

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { action, draftId, ...payload } = await req.json();

        // LIST - Get all drafts for the authenticated user
        if (action === 'LIST') {
            const { data, error } = await supabase
                .from('event_drafts')
                .select('*')
                .eq('user_id', privyUserId)
                .order('updated_at', { ascending: false });
            if (error) throw error;
            return new Response(JSON.stringify({ drafts: data || [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // GET - Get a single draft by ID (with ownership check)
        if (action === 'GET') {
            if (!draftId) throw new Error("Draft ID required");
            const { data, error } = await supabase
                .from('event_drafts')
                .select('*')
                .eq('id', draftId)
                .eq('user_id', privyUserId)
                .single();
            if (error) {
                if (error.code === 'PGRST116') {
                    return new Response(JSON.stringify({ draft: null }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }
                throw error;
            }
            return new Response(JSON.stringify({ draft: data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // CREATE - Create a new draft (with sanitized payload)
        if (action === 'CREATE') {
            const sanitizedPayload = sanitizePayload(payload);
            const draftData = {
                ...sanitizedPayload,
                user_id: privyUserId, // Always set by server, not client
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            const { data, error } = await supabase.from('event_drafts').insert(draftData).select().single();
            if (error) throw error;
            return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // UPDATE - Update an existing draft (with sanitized payload)
        if (action === 'UPDATE') {
            if (!draftId) throw new Error("Draft ID required");
            const sanitizedPayload = sanitizePayload(payload);
            const draftData = {
                ...sanitizedPayload,
                updated_at: new Date().toISOString() // Always update timestamp
            };
            const { error } = await supabase
                .from('event_drafts')
                .update(draftData)
                .eq('id', draftId)
                .eq('user_id', privyUserId); // Ownership check
            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // DELETE - Delete a draft
        if (action === 'DELETE') {
            if (!draftId) throw new Error("Draft ID required");
            const { error } = await supabase
                .from('event_drafts')
                .delete()
                .eq('id', draftId)
                .eq('user_id', privyUserId);
            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        throw new Error("Invalid action. Supported: LIST, GET, CREATE, UPDATE, DELETE");

    } catch (error: any) {
        return handleError(error, privyUserId);
    }
});
