/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";
import { requireVendor } from "../_shared/vendor.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildPreflightHeaders(req) });
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      });
    }

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const toBool = (value: unknown) => value === true || value === "true";
    const mine = toBool(body.mine ?? url.searchParams.get("mine"));
    const includeInactive = toBool(body.include_inactive ?? url.searchParams.get("include_inactive"));
    const bundleType = body.bundle_type || url.searchParams.get("bundle_type");
    const bundleId = body.bundle_id || body.bundleId || url.searchParams.get("bundle_id");
    const consoleFilter = body.console || url.searchParams.get("console");
    const locationFilter = body.location || url.searchParams.get("location");
    const search = body.q || url.searchParams.get("q");
    const limit = Math.min(Number((body.limit ?? url.searchParams.get("limit")) || 50), 200);
    const offset = Math.max(Number((body.offset ?? url.searchParams.get("offset")) || 0), 0);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let vendorId: string | null = null;
    if (mine) {
      const vendor = await requireVendor(req);
      vendorId = vendor.vendorId;
    }

    let query = supabase
      .from("gaming_bundles")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (vendorId) {
      query = query.eq("vendor_id", vendorId);
      if (!includeInactive) {
        query = query.eq("is_active", true);
      }
    } else {
      query = query.eq("is_active", true);
    }

    if (bundleId) {
      query = query.eq("id", bundleId);
    }

    if (bundleType) {
      query = query.eq("bundle_type", bundleType.toUpperCase());
    }

    if (consoleFilter) {
      query = query.eq("console", consoleFilter);
    }

    if (locationFilter) {
      query = query.ilike("location", `%${locationFilter}%`);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: bundles, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const bundleIds = (bundles || []).map((b: any) => b.id);
    let countsMap: Record<string, number> = {};
    if (bundleIds.length > 0) {
      const { data: orders } = await supabase
        .from("gaming_bundle_orders")
        .select("bundle_id")
        .in("bundle_id", bundleIds)
        .eq("status", "PAID");
      countsMap = (orders || []).reduce((acc: Record<string, number>, row: any) => {
        acc[row.bundle_id] = (acc[row.bundle_id] || 0) + 1;
        return acc;
      }, {});
    }

    const payload = (bundles || []).map((bundle: any) => ({
      ...bundle,
      sold_count: countsMap[bundle.id] || 0,
    }));

    return new Response(JSON.stringify({ ok: true, bundles: payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    const message = error?.message || "Internal error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: message === "vendor_access_denied" ? 403 : 400,
    });
  }
});
