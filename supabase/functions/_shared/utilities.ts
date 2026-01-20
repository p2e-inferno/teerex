/* deno-lint-ignore-file no-explicit-any */

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeClaimCode(input: string): string {
  return input.trim().replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

