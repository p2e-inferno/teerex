/**
 * Admin List Payout Accounts Edge Function
 *
 * Admin endpoint to list all vendor payout accounts with filtering and pagination.
 * Used for admin oversight dashboard.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { ensureAdmin } from "../_shared/admin-check.ts";
import { maskAccountNumber } from "../_shared/paystack.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface PayoutAccountRow {
  id: string;
  vendor_id: string;
  provider: string;
  business_name: string;
  account_holder_name: string | null;
  settlement_bank_code: string | null;
  settlement_bank_name: string | null;
  account_number: string | null;
  currency: string;
  percentage_charge: number;
  status: string;
  is_verified: boolean;
  verification_status: string | null;
  verification_error: string | null;
  submitted_at: string;
  verified_at: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
}

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

    // 1. Verify admin access
    try {
      await ensureAdmin(req.headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      const status = message === "unauthorized" ? 403 : 401;
      return new Response(
        JSON.stringify({ ok: false, error: message }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status,
        }
      );
    }

    // 2. Parse query parameters
    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // verified|verification_failed|pending_verification|suspended
    const provider = url.searchParams.get("provider"); // paystack|stripe|etc
    const search = url.searchParams.get("search"); // business name or vendor ID
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const sortBy = url.searchParams.get("sort_by") || "created_at";
    const sortOrder = url.searchParams.get("sort_order") === "asc" ? true : false;

    // 3. Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4. Build query
    let query = supabase
      .from("vendor_payout_accounts")
      .select(`
        id,
        vendor_id,
        provider,
        business_name,
        account_holder_name,
        settlement_bank_code,
        settlement_bank_name,
        account_number,
        currency,
        percentage_charge,
        status,
        is_verified,
        verification_status,
        verification_error,
        submitted_at,
        verified_at,
        suspended_at,
        suspended_by,
        suspension_reason,
        created_at,
        updated_at
      `, { count: "exact" });

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (provider) {
      query = query.eq("provider", provider);
    }
    if (search) {
      // Search by business name or vendor ID
      query = query.or(`business_name.ilike.%${search}%,vendor_id.ilike.%${search}%`);
    }

    // Apply sorting and pagination
    query = query
      .order(sortBy, { ascending: sortOrder })
      .range(offset, offset + limit - 1);

    const { data: payoutAccounts, error: fetchError, count } = await query;

    if (fetchError) {
      console.error("Error fetching payout accounts:", fetchError);
      return new Response(
        JSON.stringify({ ok: false, error: "Database error" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // 5. Mask sensitive data and format response
    const maskedAccounts = (payoutAccounts as PayoutAccountRow[] | null)?.map((account) => ({
      ...account,
      account_number: account.account_number
        ? maskAccountNumber(account.account_number)
        : null,
    })) || [];

    // 6. Return paginated response
    return new Response(
      JSON.stringify({
        ok: true,
        payout_accounts: maskedAccounts,
        pagination: {
          total: count || 0,
          limit,
          offset,
          has_more: (count || 0) > offset + limit,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Unexpected error in admin-list-payout-accounts:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
