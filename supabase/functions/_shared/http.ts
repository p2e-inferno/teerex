import { corsHeaders } from "./cors.ts";

/**
 * Ensures the request is POST. Returns a Response if not allowed, otherwise null.
 */
export function enforcePost(req: Request): Response | null {
  if (req.method === "POST") return null;
  if (req.method === "OPTIONS") return null;
  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}
