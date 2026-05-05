/**
 * Shared validators for the per-event "purchase form" feature.
 *
 * The schema lets a creator collect a small, ordered list of required inputs
 * from each ticket purchaser (e.g. full name, telegram, t-shirt size) on top
 * of the always-required email. The schema is constrained: a whitelist of
 * field types, hard caps on counts and sizes, a sensitive-label denylist.
 *
 * No Zod here — Deno edge functions stay dependency-light. Plain TS keeps
 * this file copy-paste friendly with the client-side validator while avoiding
 * an extra import per function.
 *
 * Design intent:
 *  - Schema and response are stored as JSONB. Server is the source of truth.
 *  - Once any ticket exists for an event, schema edits must be additive
 *    (loosening only). See `assertAdditiveSchemaEdit`.
 *  - Responses are re-validated against the *current* schema before insert.
 *  - The snapshot stored on the ticket includes the schema_updated_at so
 *    historical data stays interpretable even after future edits.
 */

// ---------- Types ----------

export type PurchaseFormFieldType =
  | "short_text"
  | "long_text"
  | "select"
  | "phone"
  | "url"
  | "number"
  | "checkbox";

export interface PurchaseFormField {
  id: string;
  label: string;
  type: PurchaseFormFieldType;
  required: boolean;
  help_text?: string | null;
  // text fields
  max_length?: number | null;
  // select fields
  options?: string[] | null;
  // number fields
  min?: number | null;
  max?: number | null;
  integer_only?: boolean | null;
}

export interface PurchaseFormSchema {
  version: 1;
  fields: PurchaseFormField[];
}

export type PurchaseFormResponse = Record<
  string,
  string | number | boolean | null
>;

export interface PurchaseFormResponseSnapshot {
  schema_updated_at: string | null;
  values: PurchaseFormResponse;
  // Captured labels at time of submission so exports stay readable even after
  // a creator renames a field later.
  labels: Record<string, string>;
}

// ---------- Constants ----------

export const PURCHASE_FORM_MAX_FIELDS = 10;
export const PURCHASE_FORM_MAX_LABEL_LENGTH = 200;
export const PURCHASE_FORM_MAX_HELP_LENGTH = 300;
export const PURCHASE_FORM_MAX_TEXT_LENGTH = 1000;
export const PURCHASE_FORM_DEFAULT_SHORT_TEXT_LENGTH = 200;
export const PURCHASE_FORM_DEFAULT_LONG_TEXT_LENGTH = 1000;
export const PURCHASE_FORM_MAX_SELECT_OPTIONS = 20;
export const PURCHASE_FORM_MAX_OPTION_LENGTH = 100;
export const PURCHASE_FORM_MAX_FIELD_ID_LENGTH = 32;
// Belt-and-suspenders bound on the serialized snapshot (matches the DB CHECK).
export const PURCHASE_FORM_MAX_RESPONSE_BYTES = 16384;

// Sensitive-label denylist: best-effort signal that the creator should not be
// using this feature for highly sensitive data. Kept small and conservative.
const SENSITIVE_LABEL_PATTERNS: RegExp[] = [
  /\bssn\b/i,
  /social\s*security/i,
  /credit\s*card/i,
  /\bcvv\b/i,
  /\bpassword\b/i,
  /\bpin\s*(code)?\b/i,
  /passport\s*(number|no)?/i,
  /bank\s*account/i,
  /\biban\b/i,
];

const FIELD_ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const PHONE_PATTERN = /^[+]?[\d][\d\s().-]{4,30}$/;
const URL_PATTERN = /^https?:\/\/[^\s]{3,200}$/i;

// ---------- Helpers ----------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isSensitiveLabel(label: string): boolean {
  return SENSITIVE_LABEL_PATTERNS.some((re) => re.test(label));
}

// ---------- Schema validation ----------

/**
 * Normalize + validate a creator-submitted schema. Returns a canonical schema
 * object or null if the input represents "no form" (empty / nullish).
 *
 * Throws Error with a user-presentable message on validation failure.
 */
export function validatePurchaseFormSchema(
  input: unknown,
): PurchaseFormSchema | null {
  if (input === null || input === undefined) return null;
  if (!isPlainObject(input)) {
    throw new Error("purchase_form_schema must be an object");
  }

  const fieldsRaw = (input as any).fields;
  if (fieldsRaw === undefined || fieldsRaw === null) return null;
  if (!Array.isArray(fieldsRaw)) {
    throw new Error("purchase_form_schema.fields must be an array");
  }
  if (fieldsRaw.length === 0) return null;
  if (fieldsRaw.length > PURCHASE_FORM_MAX_FIELDS) {
    throw new Error(
      `purchase_form_schema cannot have more than ${PURCHASE_FORM_MAX_FIELDS} fields`,
    );
  }

  const seenIds = new Set<string>();
  const fields: PurchaseFormField[] = [];

  for (let i = 0; i < fieldsRaw.length; i += 1) {
    const raw = fieldsRaw[i];
    if (!isPlainObject(raw)) {
      throw new Error(`Field #${i + 1} must be an object`);
    }

    const id = trimOrNull(raw.id);
    if (!id || !FIELD_ID_PATTERN.test(id)) {
      throw new Error(
        `Field #${i + 1} id must be 1-${PURCHASE_FORM_MAX_FIELD_ID_LENGTH} chars, lowercase letters/digits/underscore, starting with a letter`,
      );
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate field id: ${id}`);
    }
    seenIds.add(id);

    const label = trimOrNull(raw.label);
    if (!label) {
      throw new Error(`Field "${id}" requires a label`);
    }
    if (label.length > PURCHASE_FORM_MAX_LABEL_LENGTH) {
      throw new Error(
        `Field "${id}" label exceeds ${PURCHASE_FORM_MAX_LABEL_LENGTH} characters`,
      );
    }
    if (isSensitiveLabel(label)) {
      throw new Error(
        `Field "${id}" label looks like sensitive data (e.g. SSN, password, credit card). This feature is not for collecting sensitive personal data.`,
      );
    }

    const type = String(raw.type || "") as PurchaseFormFieldType;
    if (
      type !== "short_text" &&
      type !== "long_text" &&
      type !== "select" &&
      type !== "phone" &&
      type !== "url" &&
      type !== "number" &&
      type !== "checkbox"
    ) {
      throw new Error(`Field "${id}" has unsupported type: ${type}`);
    }

    const required = Boolean(raw.required);

    let help_text: string | null = null;
    const helpRaw = trimOrNull(raw.help_text);
    if (helpRaw) {
      if (helpRaw.length > PURCHASE_FORM_MAX_HELP_LENGTH) {
        throw new Error(
          `Field "${id}" help_text exceeds ${PURCHASE_FORM_MAX_HELP_LENGTH} characters`,
        );
      }
      help_text = helpRaw;
    }

    const field: PurchaseFormField = { id, label, type, required, help_text };

    if (type === "short_text" || type === "long_text") {
      const defaultMax = type === "short_text"
        ? PURCHASE_FORM_DEFAULT_SHORT_TEXT_LENGTH
        : PURCHASE_FORM_DEFAULT_LONG_TEXT_LENGTH;
      const requested = typeof raw.max_length === "number"
        ? Math.floor(raw.max_length)
        : defaultMax;
      if (!Number.isFinite(requested) || requested < 1) {
        throw new Error(`Field "${id}" max_length must be a positive integer`);
      }
      field.max_length = Math.min(requested, PURCHASE_FORM_MAX_TEXT_LENGTH);
    }

    if (type === "select") {
      if (!Array.isArray(raw.options)) {
        throw new Error(`Field "${id}" requires an options array`);
      }
      const cleaned: string[] = [];
      const seen = new Set<string>();
      for (const opt of raw.options) {
        const value = trimOrNull(opt);
        if (!value) continue;
        if (value.length > PURCHASE_FORM_MAX_OPTION_LENGTH) {
          throw new Error(
            `Field "${id}" has an option longer than ${PURCHASE_FORM_MAX_OPTION_LENGTH} characters`,
          );
        }
        if (seen.has(value)) continue;
        seen.add(value);
        cleaned.push(value);
      }
      if (cleaned.length === 0) {
        throw new Error(`Field "${id}" must have at least one option`);
      }
      if (cleaned.length > PURCHASE_FORM_MAX_SELECT_OPTIONS) {
        throw new Error(
          `Field "${id}" cannot have more than ${PURCHASE_FORM_MAX_SELECT_OPTIONS} options`,
        );
      }
      field.options = cleaned;
    }

    if (type === "number") {
      if (raw.min !== null && raw.min !== undefined) {
        if (typeof raw.min !== "number" || !Number.isFinite(raw.min)) {
          throw new Error(`Field "${id}" min must be a number`);
        }
        field.min = raw.min;
      } else {
        field.min = null;
      }
      if (raw.max !== null && raw.max !== undefined) {
        if (typeof raw.max !== "number" || !Number.isFinite(raw.max)) {
          throw new Error(`Field "${id}" max must be a number`);
        }
        field.max = raw.max;
      } else {
        field.max = null;
      }
      if (
        field.min !== null &&
        field.min !== undefined &&
        field.max !== null &&
        field.max !== undefined &&
        field.min > field.max
      ) {
        throw new Error(`Field "${id}" min cannot exceed max`);
      }
      field.integer_only = Boolean(raw.integer_only);
    }

    fields.push(field);
  }

  return { version: 1, fields };
}

// ---------- Additive-only edit rule ----------

/**
 * Compares two schemas. Allowed once tickets exist:
 *  - Append new fields (must keep the existing prefix intact).
 *  - Edit label / help_text / max_length (text) freely.
 *  - Add options to a select field (never remove or rename).
 *  - Loosen required: true -> false. Tightening (false -> true) is rejected.
 *
 * Throws Error on disallowed change.
 */
export function assertAdditiveSchemaEdit(
  prev: PurchaseFormSchema | null,
  next: PurchaseFormSchema | null,
): void {
  const prevFields = prev?.fields ?? [];
  const nextFields = next?.fields ?? [];

  if (nextFields.length < prevFields.length) {
    throw new Error(
      "Cannot remove existing fields once tickets have been issued. You may add new fields or edit labels/help text.",
    );
  }

  for (let i = 0; i < prevFields.length; i += 1) {
    const a = prevFields[i];
    const b = nextFields[i];
    if (a.id !== b.id) {
      throw new Error(
        `Cannot reorder or replace existing fields after tickets exist (field "${a.id}" -> "${b.id}").`,
      );
    }
    if (a.type !== b.type) {
      throw new Error(
        `Cannot change the type of existing field "${a.id}" after tickets exist.`,
      );
    }
    if (!a.required && b.required) {
      throw new Error(
        `Cannot make existing field "${a.id}" required after tickets exist (allowed direction: required -> optional only).`,
      );
    }
    if (a.type === "select") {
      const prevOpts = new Set(a.options ?? []);
      for (const opt of prevOpts) {
        if (!(b.options ?? []).includes(opt)) {
          throw new Error(
            `Cannot remove option "${opt}" from field "${a.id}" after tickets exist.`,
          );
        }
      }
    }
  }
}

// ---------- Response validation ----------

export interface ValidatedResponse {
  values: PurchaseFormResponse;
  labels: Record<string, string>;
}

/**
 * Validate a purchase-time response against the current published schema and
 * return a clean, server-trusted value object plus the labels at submission
 * time (used in the per-ticket snapshot for stable exports).
 */
export function validatePurchaseFormResponse(
  schema: PurchaseFormSchema | null,
  rawResponse: unknown,
): ValidatedResponse {
  const fields = schema?.fields ?? [];
  if (fields.length === 0) {
    return { values: {}, labels: {} };
  }

  const response = isPlainObject(rawResponse) ? rawResponse : {};
  const values: PurchaseFormResponse = {};
  const labels: Record<string, string> = {};

  for (const field of fields) {
    const incoming = response[field.id];
    const present = incoming !== undefined && incoming !== null && incoming !== "";

    if (!present) {
      if (field.required) {
        throw new Error(`"${field.label}" is required.`);
      }
      values[field.id] = null;
      labels[field.id] = field.label;
      continue;
    }

    switch (field.type) {
      case "short_text":
      case "long_text": {
        if (typeof incoming !== "string") {
          throw new Error(`"${field.label}" must be text.`);
        }
        const trimmed = incoming.trim();
        if (!trimmed) {
          if (field.required) throw new Error(`"${field.label}" is required.`);
          values[field.id] = null;
        } else {
          const limit = field.max_length ?? PURCHASE_FORM_MAX_TEXT_LENGTH;
          if (trimmed.length > limit) {
            throw new Error(
              `"${field.label}" exceeds ${limit} characters.`,
            );
          }
          values[field.id] = trimmed;
        }
        break;
      }
      case "phone": {
        if (typeof incoming !== "string") {
          throw new Error(`"${field.label}" must be text.`);
        }
        const trimmed = incoming.trim();
        if (!PHONE_PATTERN.test(trimmed)) {
          throw new Error(`"${field.label}" must be a valid phone number.`);
        }
        values[field.id] = trimmed;
        break;
      }
      case "url": {
        if (typeof incoming !== "string") {
          throw new Error(`"${field.label}" must be a URL.`);
        }
        const trimmed = incoming.trim();
        if (!URL_PATTERN.test(trimmed)) {
          throw new Error(`"${field.label}" must be a valid http(s) URL.`);
        }
        values[field.id] = trimmed;
        break;
      }
      case "select": {
        if (typeof incoming !== "string") {
          throw new Error(`"${field.label}" must be a selection.`);
        }
        if (!(field.options ?? []).includes(incoming)) {
          throw new Error(`"${field.label}" is not one of the allowed options.`);
        }
        values[field.id] = incoming;
        break;
      }
      case "number": {
        const num = typeof incoming === "number"
          ? incoming
          : Number(String(incoming));
        if (!Number.isFinite(num)) {
          throw new Error(`"${field.label}" must be a number.`);
        }
        if (field.integer_only && !Number.isInteger(num)) {
          throw new Error(`"${field.label}" must be a whole number.`);
        }
        if (field.min !== null && field.min !== undefined && num < field.min) {
          throw new Error(`"${field.label}" must be at least ${field.min}.`);
        }
        if (field.max !== null && field.max !== undefined && num > field.max) {
          throw new Error(`"${field.label}" must be at most ${field.max}.`);
        }
        values[field.id] = num;
        break;
      }
      case "checkbox": {
        if (typeof incoming === "boolean") {
          values[field.id] = incoming;
        } else if (incoming === "true" || incoming === "false") {
          values[field.id] = incoming === "true";
        } else {
          throw new Error(`"${field.label}" must be true or false.`);
        }
        if (field.required && values[field.id] !== true) {
          throw new Error(`"${field.label}" must be checked.`);
        }
        break;
      }
    }

    labels[field.id] = field.label;
  }

  // Belt-and-suspenders: ensure the serialized snapshot fits the DB CHECK.
  // This is the trust boundary — if a creator picked very large max_lengths
  // we want a friendly error, not a CHECK constraint violation.
  const serialized = JSON.stringify({ values, labels });
  if (serialized.length > PURCHASE_FORM_MAX_RESPONSE_BYTES) {
    throw new Error(
      `Your answers are too long (max ~${PURCHASE_FORM_MAX_RESPONSE_BYTES} bytes). Please shorten one or more responses.`,
    );
  }

  return { values, labels };
}

/**
 * Returns true if the event has any ticket. Used by manage-event-purchase-form
 * to switch into additive-only edit mode.
 */
export async function eventHasAnyTickets(
  supabase: any,
  eventId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) {
    console.error("[purchase-form] eventHasAnyTickets failed:", error);
    // Fail closed: treat as if tickets exist so we don't accidentally allow a
    // non-additive edit when we couldn't verify.
    return true;
  }
  return (count ?? 0) > 0;
}

/**
 * Load the current published schema for an event. Returns null if no schema
 * row exists (i.e., the event has no purchase form).
 */
export async function getPublishedPurchaseFormSchema(
  supabase: any,
  eventId: string | null | undefined,
): Promise<{ schema: PurchaseFormSchema | null; updatedAt: string | null }> {
  if (!eventId) return { schema: null, updatedAt: null };
  const { data, error } = await supabase
    .from("event_purchase_form_schemas")
    .select("schema_json, updated_at")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) {
    console.error("[purchase-form] failed to load schema:", error);
    return { schema: null, updatedAt: null };
  }
  if (!data) return { schema: null, updatedAt: null };
  try {
    const schema = validatePurchaseFormSchema(data.schema_json);
    return { schema, updatedAt: data.updated_at ?? null };
  } catch (err) {
    console.error("[purchase-form] stored schema failed validation:", err);
    return { schema: null, updatedAt: null };
  }
}
