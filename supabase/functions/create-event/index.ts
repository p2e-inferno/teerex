import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken, getUserWalletAddresses } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { handleError } from "../_shared/error-handler.ts";
import { isAnyUserWalletIsLockManagerParallel, resolveTokenInfo } from "../_shared/unlock.ts";
import { Contract, JsonRpcProvider, Wallet } from "https://esm.sh/ethers@6.14.4";
import { buildStartsAtUtcIso, toDateOnly } from "../_shared/datetime.ts";
import { sanitizePurchaseMessage } from "../_shared/purchase-message.ts";
import { validatePurchaseFormSchema } from "../_shared/purchase-form.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYSTACK_PUBLIC_KEY = Deno.env.get("VITE_PAYSTACK_PUBLIC_KEY")!;
const UNLOCK_SERVICE_PRIVATE_KEY = Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY")!;

const REFUNDABLE_EVENT_MANAGER_ABI = [
    {
        inputs: [{ name: "lock", type: "address" }],
        name: "eventConfigByLock",
        outputs: [
            { name: "exists", type: "bool" },
            { name: "managerReleased", type: "bool" },
            { name: "cancelInitiated", type: "bool" },
            { name: "refundComplete", type: "bool" },
            { name: "creator", type: "address" },
            { name: "currency", type: "address" },
            { name: "keyPrice", type: "uint256" },
            { name: "minAttendees", type: "uint256" },
            { name: "refundTriggerTime", type: "uint256" },
            { name: "eventStartTime", type: "uint256" },
            { name: "eventEndTime", type: "uint256" },
            { name: "protocolFeeBpsAtCreation", type: "uint256" },
            { name: "effectiveBondFeeBps", type: "uint256" },
            { name: "reserveBond", type: "uint256" },
            { name: "refundCursor", type: "uint256" },
            { name: "refundUpperTokenId", type: "uint256" }
        ],
        stateMutability: "view",
        type: "function"
    }
] as const;

function toUnixSeconds(value: string | null | undefined, fieldName: string): bigint {
    if (!value) {
        throw new Error(`${fieldName} is required`);
    }
    const millis = new Date(value).getTime();
    if (!Number.isFinite(millis)) {
        throw new Error(`${fieldName} is invalid`);
    }
    return BigInt(Math.floor(millis / 1000));
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: buildPreflightHeaders(req) });
    }

    let privyUserId: string | undefined;

    try {
        // 1. Authenticate user using Privy JWT
        const authHeader = req.headers.get("X-Privy-Authorization");
        privyUserId = await verifyPrivyToken(authHeader);

        // 2. Parse payload
        const payload = await req.json();
        const {
            title,
            description,
            date,
            end_date,
            ends_at,
            time,
            location,
            event_type,
            capacity,
            price,
            currency,
            ngn_price,
            payout_destination,
            payment_methods,
            category,
            game_id,
            image_url,
            image_crop_x,
            image_crop_y,
            lock_address,
            transaction_hash,
            chain_id,
            service_manager_added,
            idempotency_hash,
            ticket_duration,
            custom_duration_days,
            is_public,
            allow_waitlist,
            has_allow_list,
            transferable,
            nft_metadata_set,
            nft_base_uri,
            refund_protection_enabled,
            refund_min_attendees,
            refund_trigger_at,
            refund_event_end_at,
            refund_controller_address,
            refund_reserve_bond,
            refund_status,
            purchase_confirmation_message,
            purchase_form_schema
        } = payload;

        // 3. Create Supabase service client
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 4. Validate lock ownership - CRITICAL SECURITY CHECK
        // Verify the caller is a lock manager on-chain before allowing event creation
        if (!lock_address || !chain_id) {
            throw new Error("Missing lock_address or chain_id");
        }

        // Get user's wallet addresses
        const userWalletAddresses = await getUserWalletAddresses(privyUserId);
        if (!userWalletAddresses || userWalletAddresses.length === 0) {
            throw new Error("No wallets linked to authenticated user");
        }

        // Validate chain and get network config
        const networkConfig = await validateChain(supabase, chain_id);
        if (!networkConfig || !networkConfig.rpc_url) {
            throw new Error("Chain not supported or not configured");
        }

        const isProtectedRefundEvent = Boolean(refund_protection_enabled);
        const provider = new JsonRpcProvider(networkConfig.rpc_url);

        // 5. Check Idempotency (Prevent Duplicates)
        if (idempotency_hash) {
            const { data: existingEvent } = await supabase
                .from('events')
                .select('*')
                .eq('creator_id', privyUserId)
                .eq('idempotency_hash', idempotency_hash)
                .maybeSingle();

            if (existingEvent) {
                return new Response(
                    JSON.stringify({
                        error: "DUPLICATE_EVENT",
                        event: existingEvent
                    }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        }

        // 6. Insert Event
        // For fiat events, use server-side Paystack public key if client didn't provide one
        const isFiatEvent = payment_methods?.includes('fiat');
        const resolvedPaystackPublicKey = isFiatEvent ? PAYSTACK_PUBLIC_KEY : null;
        let resolvedServiceManagerAdded = Boolean(service_manager_added);

        if (isFiatEvent && UNLOCK_SERVICE_PRIVATE_KEY) {
            try {
                const serviceWallet = new Wallet(UNLOCK_SERVICE_PRIVATE_KEY);
                const serviceAddress = serviceWallet.address;
                const { anyIsManager } = await isAnyUserWalletIsLockManagerParallel(
                    lock_address,
                    [serviceAddress],
                    networkConfig.rpc_url
                );
                resolvedServiceManagerAdded = Boolean(anyIsManager);
            } catch (error) {
                console.error("[create-event] Failed to verify service manager on-chain:", error);
            }
        }

        // Client sends date as full ISO string (e.g. 2026-02-05T00:00:00.000Z)
        // Extract date-only portion and combine with time deterministically in UTC.
        const timezoneOffsetMinutes =
          typeof (payload as any)?.timezone_offset_minutes === "number"
            ? (payload as any).timezone_offset_minutes
            : undefined;
        const dateOnly = toDateOnly(date, timezoneOffsetMinutes);
        const startsAt =
          payload.starts_at ||
          (dateOnly && time ? buildStartsAtUtcIso(dateOnly, time, timezoneOffsetMinutes) : null);
        const resolvedEndsAt = ends_at || refund_event_end_at || null;
        const defaultCutoff = startsAt
          ? new Date(new Date(startsAt).getTime() - 60 * 60 * 1000).toISOString()
          : null;
        let resolvedRefundControllerAddress = refund_controller_address || null;
        let resolvedRefundReserveBond = refund_reserve_bond || null;
        let resolvedRefundStatus = refund_status || null;

        if (isProtectedRefundEvent) {
            if (!payment_methods?.includes("crypto")) {
                throw new Error("Refund protection is only available for crypto paid events");
            }
            if (!networkConfig.refundable_event_manager_address) {
                throw new Error("Refundable event manager is not configured for this chain");
            }
            if (!resolvedEndsAt) {
                throw new Error("ends_at is required for protected events");
            }
            if (!refund_min_attendees || Number(refund_min_attendees) <= 0) {
                throw new Error("refund_min_attendees must be greater than zero");
            }
            if (Number(refund_min_attendees) > Number(capacity)) {
                throw new Error("refund_min_attendees cannot exceed capacity");
            }

            const controllerAddress = networkConfig.refundable_event_manager_address;
            if (
                refund_controller_address &&
                refund_controller_address.toLowerCase() !== controllerAddress.toLowerCase()
            ) {
                throw new Error("Refund controller does not match configured manager");
            }

            const { tokenAddress, keyPrice } = await resolveTokenInfo(
                currency,
                Number(price),
                Number(chain_id),
                networkConfig,
                provider
            );
            const controller = new Contract(controllerAddress, REFUNDABLE_EVENT_MANAGER_ABI, provider);
            const cfg = await controller.eventConfigByLock(lock_address);

            if (!cfg.exists) {
                throw new Error("Lock is not registered with the refundable event manager");
            }
            if (!userWalletAddresses.some((addr) => addr.toLowerCase() === String(cfg.creator).toLowerCase())) {
                throw new Error("Unauthorized: protected event creator is not a linked wallet");
            }
            if (String(cfg.currency).toLowerCase() !== tokenAddress.toLowerCase()) {
                throw new Error("Protected lock currency does not match event payload");
            }
            if (BigInt(cfg.keyPrice) !== keyPrice) {
                throw new Error("Protected lock price does not match event payload");
            }
            if (BigInt(cfg.minAttendees) !== BigInt(refund_min_attendees)) {
                throw new Error("Protected lock minimum attendees does not match event payload");
            }
            if (BigInt(cfg.refundTriggerTime) !== toUnixSeconds(refund_trigger_at, "refund_trigger_at")) {
                throw new Error("Protected lock refund trigger does not match event payload");
            }
            if (BigInt(cfg.eventStartTime) !== toUnixSeconds(startsAt, "starts_at")) {
                throw new Error("Protected lock start time does not match event payload");
            }
            if (BigInt(cfg.eventEndTime) !== toUnixSeconds(resolvedEndsAt, "ends_at")) {
                throw new Error("Protected lock end time does not match event payload");
            }

            resolvedServiceManagerAdded = false;
            resolvedRefundControllerAddress = controllerAddress;
            resolvedRefundReserveBond = cfg.reserveBond.toString();
            resolvedRefundStatus = "protected";
        } else {
            // Verify on-chain that at least one of user's wallets is a lock manager.
            const { anyIsManager: isAuthorized } = await isAnyUserWalletIsLockManagerParallel(
                lock_address,
                userWalletAddresses,
                networkConfig.rpc_url
            );

            if (!isAuthorized) {
                throw new Error("Unauthorized: You are not a manager of this lock contract");
            }
        }

        let resolvedGameId: string | null = null;
        if (category === "Tournament" && game_id) {
            const { data: game } = await supabase
                .from("games")
                .select("id")
                .eq("id", String(game_id))
                .eq("is_active", true)
                .maybeSingle();
            if (!game) {
                throw new Error("Invalid or inactive game_id");
            }
            resolvedGameId = game.id;
        }

        let sanitizedPurchaseMessage: string | null = null;
        try {
            sanitizedPurchaseMessage = sanitizePurchaseMessage(purchase_confirmation_message);
        } catch (err) {
            return new Response(
                JSON.stringify({
                    error: err instanceof Error ? err.message : "Invalid purchase confirmation message.",
                }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 400,
                },
            );
        }

        let validatedPurchaseFormSchema: ReturnType<typeof validatePurchaseFormSchema> = null;
        try {
            validatedPurchaseFormSchema = validatePurchaseFormSchema(purchase_form_schema);
        } catch (err) {
            return new Response(
                JSON.stringify({
                    error: err instanceof Error ? err.message : "Invalid purchase form schema.",
                }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 400,
                },
            );
        }

        const eventData = {
            creator_id: privyUserId,
            title,
            description,
            date,
            end_date,
            starts_at: startsAt,
            ends_at: resolvedEndsAt,
            registration_cutoff: defaultCutoff,
            time,
            location,
            event_type,
            capacity,
            price,
            currency,
            ngn_price,
            payout_destination: payout_destination === 'platform' ? 'platform' : 'seller',
            payment_methods,
            paystack_public_key: resolvedPaystackPublicKey,
            category,
            game_id: resolvedGameId,
            image_url,
            image_crop_x,
            image_crop_y,
            lock_address,
            transaction_hash,
            chain_id,
            service_manager_added: resolvedServiceManagerAdded,
            idempotency_hash,
            ticket_duration,
            custom_duration_days,
            is_public,
            allow_waitlist,
            has_allow_list,
            transferable,
            nft_metadata_set,
            nft_base_uri,
            refund_protection_enabled: isProtectedRefundEvent,
            refund_min_attendees: isProtectedRefundEvent ? refund_min_attendees : null,
            refund_trigger_at: isProtectedRefundEvent ? refund_trigger_at : null,
            refund_event_end_at: isProtectedRefundEvent ? resolvedEndsAt : null,
            refund_controller_address: isProtectedRefundEvent ? resolvedRefundControllerAddress : null,
            refund_reserve_bond: isProtectedRefundEvent ? resolvedRefundReserveBond : null,
            refund_status: isProtectedRefundEvent ? resolvedRefundStatus : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data: newEvent, error: insertError } = await supabase
            .from('events')
            .insert(eventData)
            .select()
            .single();

        if (insertError) {
            if (insertError.code === '23505' && insertError.message.includes('idempotency')) {
                // Race condition caught
                const { data: racedEvent } = await supabase
                    .from('events')
                    .select('*')
                    .eq('creator_id', privyUserId)
                    .eq('idempotency_hash', idempotency_hash)
                    .maybeSingle();

                if (racedEvent?.id && sanitizedPurchaseMessage) {
                    await supabase
                        .from("event_purchase_messages")
                        .upsert(
                            {
                                event_id: racedEvent.id,
                                message_html: sanitizedPurchaseMessage,
                                updated_by: privyUserId,
                                updated_at: new Date().toISOString(),
                            },
                            { onConflict: "event_id" },
                        );
                }
                if (racedEvent?.id && validatedPurchaseFormSchema) {
                    await supabase
                        .from("event_purchase_form_schemas")
                        .upsert(
                            {
                                event_id: racedEvent.id,
                                schema_json: validatedPurchaseFormSchema,
                                updated_by: privyUserId,
                                updated_at: new Date().toISOString(),
                            },
                            { onConflict: "event_id" },
                        );
                }

                return new Response(
                    JSON.stringify({
                        error: "DUPLICATE_EVENT",
                        event: racedEvent
                    }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
            throw insertError;
        }

        let purchaseMessageSaved = true;
        if (sanitizedPurchaseMessage) {
            const { error: purchaseMessageError } = await supabase
                .from("event_purchase_messages")
                .upsert(
                    {
                        event_id: newEvent.id,
                        message_html: sanitizedPurchaseMessage,
                        updated_by: privyUserId,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "event_id" },
                );

            if (purchaseMessageError) {
                console.error("Failed to save purchase confirmation message:", purchaseMessageError);
                purchaseMessageSaved = false;
            }
        }

        let purchaseFormSaved = true;
        if (validatedPurchaseFormSchema) {
            const { error: purchaseFormError } = await supabase
                .from("event_purchase_form_schemas")
                .upsert(
                    {
                        event_id: newEvent.id,
                        schema_json: validatedPurchaseFormSchema,
                        updated_by: privyUserId,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "event_id" },
                );

            if (purchaseFormError) {
                console.error("Failed to save purchase form schema:", purchaseFormError);
                purchaseFormSaved = false;
            }
        }

        return new Response(
            JSON.stringify({
                ...newEvent,
                purchase_message_saved: purchaseMessageSaved,
                purchase_form_saved: purchaseFormSaved,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        return handleError(error, privyUserId);
    }
});
