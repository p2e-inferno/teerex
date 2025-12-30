import { http, HttpResponse } from "msw";
import { mockNetworkConfigs } from "@/test/mocks/networkConfigs";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL || "http://localhost:54321").replace(/\/+$/, "");

const mockAttestationSchemas = [
  {
    schema_uid: `0x${"1".repeat(64)}`,
    name: "TeeRex EventLike",
    revocable: true,
  },
  {
    schema_uid: `0x${"2".repeat(64)}`,
    name: "TeeRex EventGoing",
    revocable: true,
  },
];

function parseEqNumber(input: string | null): number | null {
  if (!input) return null;
  if (input.startsWith("eq.")) return Number(input.slice(3));
  return Number(input);
}

export const handlers = [
  // Default fallback: many admin pages require this check early in render.
  http.all(`${supabaseUrl}/functions/v1/is-admin`, () => {
    return HttpResponse.json({ is_admin: true }, { status: 200 });
  }),

  http.get(`${supabaseUrl}/rest/v1/network_configs`, ({ request }) => {
    const url = new URL(request.url);
    const chainId = parseEqNumber(url.searchParams.get("chain_id"));
    const isActiveParam = url.searchParams.get("is_active");
    const isActive = isActiveParam ? isActiveParam === "eq.true" || isActiveParam === "true" : null;

    const rows = Object.values(mockNetworkConfigs).filter((row) => {
      if (chainId && row.chain_id !== chainId) return false;
      if (isActive !== null && row.is_active !== isActive) return false;
      return true;
    });

    const accept = request.headers.get("accept") || "";
    if (accept.includes("application/vnd.pgrst.object+json")) {
      return HttpResponse.json(rows[0] ?? null, { status: 200 });
    }

    return HttpResponse.json(rows, { status: 200 });
  }),

  http.get(`${supabaseUrl}/rest/v1/attestation_schemas`, ({ request }) => {
    const url = new URL(request.url);
    const nameParam = url.searchParams.get("name");
    const schemaUidParam = url.searchParams.get("schema_uid");

    const rows = mockAttestationSchemas.filter((row) => {
      if (nameParam && nameParam.startsWith("eq.") && row.name !== nameParam.slice(3)) return false;
      if (schemaUidParam && schemaUidParam.startsWith("eq.") && row.schema_uid !== schemaUidParam.slice(3)) return false;
      return true;
    });

    const accept = request.headers.get("accept") || "";
    if (accept.includes("application/vnd.pgrst.object+json")) {
      return HttpResponse.json(rows[0] ?? null, { status: 200 });
    }

    return HttpResponse.json(rows, { status: 200 });
  }),

  http.get(`${supabaseUrl}/rest/v1/attestations`, ({ request }) => {
    const accept = request.headers.get("accept") || "";
    if (accept.includes("application/vnd.pgrst.object+json")) {
      return HttpResponse.json(null, { status: 200 });
    }
    return HttpResponse.json([], { status: 200 });
  }),
];

export { http, HttpResponse };
