/* deno-lint-ignore-file no-explicit-any */

const RESERVED_DISPLAY_NAME_KEYS = new Set([
  "admin",
  "administrator",
  "base",
  "ethereum",
  "founder",
  "help",
  "host",
  "mod",
  "moderator",
  "official",
  "organizer",
  "owner",
  "paystack",
  "privy",
  "security",
  "staff",
  "support",
  "system",
  "team",
  "teerex",
  "teerexadmin",
  "teerexofficial",
  "teerexsupport",
  "teerexteam",
  "unlock",
  "verification",
  "verified",
]);

const UNSAFE_DISPLAY_NAME_CHARACTERS =
  /[\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0]/u;

export function displayNameKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hasUnsafeDisplayNameCharacters(value: string): boolean {
  return UNSAFE_DISPLAY_NAME_CHARACTERS.test(value);
}

export function validateDisplayName(displayName: string | null): string | null {
  if (displayName === null) return null;
  if (displayName.length < 2 || displayName.length > 40) return "display_name_must_be_2_to_40_chars";
  if (hasUnsafeDisplayNameCharacters(displayName)) return "display_name_unsafe_characters";
  const key = displayNameKey(displayName);
  if (RESERVED_DISPLAY_NAME_KEYS.has(key)) return "display_name_reserved";
  return null;
}

// Public player/host names only — app_user_profiles.email is PII and must never leave the server.
// Chunked: a large id set would otherwise put many KB of DIDs in one in() query string.
export async function loadDisplayNames(
  supabase: any,
  privyUserIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = Array.from(new Set(privyUserIds)).filter(Boolean);
  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const { data } = await supabase
      .from("app_user_profiles")
      .select("privy_user_id, display_name")
      .in("privy_user_id", unique.slice(i, i + chunkSize))
      .not("display_name", "is", null);
    for (const p of data ?? []) names.set(p.privy_user_id, p.display_name);
  }
  return names;
}

export async function resolveDisplayName(
  supabase: any,
  privyUserId: string | null | undefined,
): Promise<string | null> {
  if (!privyUserId) return null;
  const names = await loadDisplayNames(supabase, [privyUserId]);
  return names.get(privyUserId) ?? null;
}
