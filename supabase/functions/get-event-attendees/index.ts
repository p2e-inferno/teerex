/* deno-lint-ignore-file no-explicit-any */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { corsHeaders, buildPreflightHeaders } from "../_shared/cors.ts";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../_shared/constants.ts";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: buildPreflightHeaders(req) });

  try {
    // Public endpoint: verified attendees are shown on the public event page.
    const body = await req.json().catch(() => ({}));
    const eventId = String(body.event_id || "").trim();
    const schemaUid = String(body.schema_uid || "").trim();

    if (!eventId || !schemaUid) {
      return json({ ok: false, error: "event_id and schema_uid are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: attestationsData, error: attErr } = await supabase
      .from("attestations")
      .select("id, recipient, created_at, data")
      .eq("event_id", eventId)
      .eq("schema_uid", schemaUid)
      .eq("is_revoked", false)
      .order("created_at", { ascending: false });

    if (attErr) return json({ ok: false, error: attErr.message }, 400);
    if (!attestationsData || attestationsData.length === 0) return json({ ok: true, attendees: [] }, 200);

    // Keep the latest attestation per recipient.
    const byRecipient = new Map<string, any>();
    for (const a of attestationsData) {
      const prev = byRecipient.get(a.recipient);
      if (!prev || new Date(a.created_at) > new Date(prev.created_at)) byRecipient.set(a.recipient, a);
    }
    const uniqueAttestations = Array.from(byRecipient.values());

    const attendeeAddresses = uniqueAttestations.map((a) => a.recipient);
    const attestationIds = uniqueAttestations.map((a) => a.id);

    const [{ data: reputationData }, { data: challengesData }, { data: votesData }] = await Promise.all([
      supabase
        .from("user_reputation")
        .select("user_address, reputation_score, total_attestations")
        .in("user_address", attendeeAddresses),
      supabase
        .from("attestation_challenges")
        .select("attestation_id")
        .in("attestation_id", attestationIds),
      supabase
        .from("attestation_votes")
        .select("attestation_id, vote_type")
        .in("attestation_id", attestationIds),
    ]);

    const attendees = uniqueAttestations.map((attestation) => {
      const reputation = reputationData?.find((r) => r.user_address === attestation.recipient);
      const challengesCount = challengesData?.filter((c) => c.attestation_id === attestation.id).length || 0;
      const votes = votesData?.filter((v) => v.attestation_id === attestation.id) || [];

      return {
        id: attestation.id,
        recipient: attestation.recipient,
        created_at: attestation.created_at,
        data: attestation.data,
        reputation_score: reputation?.reputation_score ?? 100,
        total_attestations: reputation?.total_attestations ?? 0,
        challenges_count: challengesCount,
        votes_support: votes.filter((v) => v.vote_type === "support").length,
        votes_challenge: votes.filter((v) => v.vote_type === "challenge").length,
      };
    });

    return json({ ok: true, attendees }, 200);
  } catch (err: any) {
    console.error("[get-event-attendees]", err);
    return json({ ok: false, error: err?.message || "Internal error" }, 400);
  }
});
