import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { Contract, JsonRpcProvider } from "https://esm.sh/ethers@6.14.4";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { handleError } from "../_shared/error-handler.ts";
import { validateChain } from "../_shared/network-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  },
  {
    inputs: [{ name: "lock", type: "address" }],
    name: "attendeeCountForThreshold",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "lock", type: "address" }],
    name: "thresholdMet",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "lock", type: "address" }],
    name: "currentRefundReserve",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "lock", type: "address" }],
    name: "requiredFullRefundAtCurrentSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "lock", type: "address" },
      { name: "account", type: "address" }
    ],
    name: "isAuthorizedRefundCaller",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

function validHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function validAddresses(body: Record<string, unknown>): string[] {
  const values = Array.isArray(body.accounts)
    ? body.accounts
    : typeof body.account === "string"
      ? [body.account]
      : [];

  return [...new Set(
    values.filter((value): value is string =>
      typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
    ).map((value) => value.toLowerCase())
  )];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const eventId = body.event_id || body.eventId;
    const accounts = validAddresses(body);
    if (!eventId) throw new Error("event_id is required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) throw eventError;
    if (!event) throw new Error("Event not found");
    if (!event.refund_protection_enabled) {
      return new Response(
        JSON.stringify({ ok: false, error: "not_refundable_event" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const networkConfig = await validateChain(supabase, Number(event.chain_id));
    if (!networkConfig?.rpc_url) throw new Error("Chain not supported or not configured");
    const controllerAddress =
      event.refund_controller_address || networkConfig.refundable_event_manager_address;
    if (!controllerAddress) throw new Error("Refundable event manager is not configured");

    const provider = new JsonRpcProvider(networkConfig.rpc_url);
    const controller = new Contract(controllerAddress, REFUNDABLE_EVENT_MANAGER_ABI, provider);

    const [cfg, attendeeCount, thresholdMet, currentReserve, requiredReserve] = await Promise.all([
      controller.eventConfigByLock(event.lock_address),
      controller.attendeeCountForThreshold(event.lock_address),
      controller.thresholdMet(event.lock_address),
      controller.currentRefundReserve(event.lock_address),
      controller.requiredFullRefundAtCurrentSupply(event.lock_address)
    ]);

    if (!cfg.exists) throw new Error("Lock is not registered with the refundable event manager");

    let authorizedRefundCaller = false;
    let authorizedRefundAddress: string | null = null;
    if (accounts.length > 0) {
      const results = await Promise.all(
        accounts.map((account) =>
          controller.isAuthorizedRefundCaller(event.lock_address, account)
            .then(Boolean)
            .catch(() => false)
        )
      );
      authorizedRefundCaller = results.some(Boolean);
      const authorizedIndex = results.findIndex(Boolean);
      authorizedRefundAddress = authorizedIndex >= 0 ? accounts[authorizedIndex] : null;
    }

    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const managerReleased = Boolean(cfg.managerReleased);
    const managerReleasedAt =
      managerReleased
        ? event.refund_manager_released_at || new Date().toISOString()
        : null;
    let status = "protected";
    if (cfg.refundComplete) {
      status = "refunded";
    } else if (nowSeconds < BigInt(cfg.refundTriggerTime)) {
      status = "protected";
    } else if (thresholdMet) {
      status = "threshold_met";
    } else if (cfg.cancelInitiated) {
      status = "refund_in_progress";
    } else if (nowSeconds >= BigInt(cfg.eventEndTime)) {
      status = "creator_only_refund_window";
    } else {
      status = "refund_available";
    }

    const updatePayload: Record<string, unknown> = {
      refund_status: status,
      refund_manager_released: managerReleased,
      refund_manager_released_at: managerReleasedAt,
      refund_last_synced_at: new Date().toISOString(),
      refund_reserve_bond: cfg.reserveBond.toString(),
      refund_controller_address: controllerAddress
    };
    if (validHash(body.tx_hash)) {
      updatePayload.refund_last_tx_hash = body.tx_hash;
    }

    const { error: updateError } = await supabase
      .from("events")
      .update(updatePayload)
      .eq("id", event.id);
    if (updateError) throw updateError;

    if (cfg.refundComplete) {
      await supabase
        .from("tickets")
        .update({ status: "refunded" })
        .eq("event_id", event.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status,
        attendee_count: attendeeCount.toString(),
        min_attendees: cfg.minAttendees.toString(),
        threshold_met: Boolean(thresholdMet),
        current_refund_reserve: currentReserve.toString(),
        required_full_refund: requiredReserve.toString(),
        refund_complete: Boolean(cfg.refundComplete),
        cancel_initiated: Boolean(cfg.cancelInitiated),
        manager_released: managerReleased,
        manager_released_at: managerReleasedAt,
        refund_cursor: cfg.refundCursor.toString(),
        refund_upper_token_id: cfg.refundUpperTokenId.toString(),
        creator: cfg.creator,
        authorized_refund_caller: authorizedRefundCaller,
        authorized_refund_address: authorizedRefundAddress,
        controller_address: controllerAddress
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return handleError(error);
  }
});
