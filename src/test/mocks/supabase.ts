import { http, HttpResponse } from "msw";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL || "http://localhost:54321").replace(/\/+$/, "");

export function edgeFunctionUrl(name: string) {
  return `${supabaseUrl}/functions/v1/${name}`;
}

export function mockEdgeFunction(
  name: string,
  handler: (ctx: { request: Request; body: any; headers: Headers }) => any | Promise<any>
) {
  return http.all(edgeFunctionUrl(name), async ({ request }) => {
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? null
        : await request.json().catch(() => null);
    const result = await handler({
      request,
      body,
      headers: request.headers,
    });
    return HttpResponse.json(result, { status: 200 });
  });
}

export { http, HttpResponse };
