import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { verifyPrivyToken, getUserWalletAddresses } from "../_shared/privy.ts";
import { validateChain } from "../_shared/network-helpers.ts";
import { handleError } from "../_shared/error-handler.ts";
import { isAnyUserWalletIsLockManagerParallel } from "../_shared/unlock.ts";
import { Wallet } from "https://esm.sh/ethers@6.14.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYSTACK_PUBLIC_KEY = Deno.env.get("VITE_PAYSTACK_PUBLIC_KEY")!;
const UNLOCK_SERVICE_PRIVATE_KEY = Deno.env.get("UNLOCK_SERVICE_PRIVATE_KEY")!;

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
            time,
            location,
            event_type,
            capacity,
            price,
            currency,
            ngn_price,
            payment_methods,
            category,
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
            nft_base_uri
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

        // Verify on-chain that at least one of user's wallets is a lock manager
        const { anyIsManager: isAuthorized } = await isAnyUserWalletIsLockManagerParallel(
            lock_address,
            userWalletAddresses,
            networkConfig.rpc_url
        );

        if (!isAuthorized) {
            throw new Error("Unauthorized: You are not a manager of this lock contract");
        }

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

        const eventData = {
            creator_id: privyUserId,
            title,
            description,
            date,
            end_date,
            time,
            location,
            event_type,
            capacity,
            price,
            currency,
            ngn_price,
            payment_methods,
            paystack_public_key: resolvedPaystackPublicKey,
            category,
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

        return new Response(
            JSON.stringify(newEvent),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        return handleError(error, privyUserId);
    }
});
