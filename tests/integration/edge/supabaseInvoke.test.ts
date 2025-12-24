import { supabase } from "@/integrations/supabase/client";
import { server } from "@/test/msw/server";
import { mockEdgeFunction } from "@/test/mocks/supabase";

describe("Supabase edge invoke (MSW integration)", () => {
  it("returns mocked data for an edge function", async () => {
    server.use(
      mockEdgeFunction("get-transaction-status", async ({ body, headers }) => ({
        ok: true,
        echo: body?.reference,
        has_privy_header: headers.has("x-privy-authorization"),
      }))
    );

    const { data, error } = await supabase.functions.invoke(
      "get-transaction-status",
      {
        body: { reference: "ref_123" },
        headers: { "X-Privy-Authorization": "Bearer test" },
      }
    );

    expect(error).toBeNull();
    expect(data).toEqual({
      ok: true,
      echo: "ref_123",
      has_privy_header: true,
    });
  });
});

