/**
 * List Nigerian Banks Edge Function
 *
 * Public endpoint (no auth required) to list Nigerian banks with their codes.
 * Used for bank selection dropdown in payout account form.
 * Results can be cached client-side as bank list rarely changes.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { listNigerianBanks, type PaystackBank } from "../_shared/paystack.ts";

// Simple in-memory cache for bank list (1 hour TTL)
let cachedBanks: PaystackBank[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ ok: false, error: "Method not allowed" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 405,
        }
      );
    }

    // Check if we have a valid cache
    const now = Date.now();
    if (cachedBanks && now - cacheTimestamp < CACHE_TTL_MS) {
      return new Response(
        JSON.stringify({
          ok: true,
          banks: cachedBanks.map((bank) => ({
            code: bank.code,
            name: bank.name,
            slug: bank.slug,
            type: bank.type,
          })),
          cached: true,
          cache_age_seconds: Math.floor((now - cacheTimestamp) / 1000),
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600", // Browser cache for 1 hour
          },
          status: 200,
        }
      );
    }

    // Fetch fresh bank list from Paystack
    const banks = await listNigerianBanks();

    // Update cache
    cachedBanks = banks;
    cacheTimestamp = now;

    // Filter to only active banks and sort alphabetically
    const activeBanks = banks
      .filter((bank) => bank.active)
      .sort((a, b) => a.name.localeCompare(b.name));

    return new Response(
      JSON.stringify({
        ok: true,
        banks: activeBanks.map((bank) => ({
          code: bank.code,
          name: bank.name,
          slug: bank.slug,
          type: bank.type,
        })),
        cached: false,
        total: activeBanks.length,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600", // Browser cache for 1 hour
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error fetching Nigerian banks:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch banks";
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
