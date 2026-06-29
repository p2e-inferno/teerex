import { z } from 'zod';

// Constants are duplicated here (mirroring supabase/functions/_shared/purchase-form.ts)
// rather than imported across the client/Deno boundary. Keep in sync.
export const PURCHASE_FORM_MAX_FIELDS = 10;
export const PURCHASE_FORM_MAX_LABEL_LENGTH = 200;
export const PURCHASE_FORM_MAX_HELP_LENGTH = 300;
export const PURCHASE_FORM_MAX_TEXT_LENGTH = 1000;
export const PURCHASE_FORM_DEFAULT_SHORT_TEXT_LENGTH = 200;
export const PURCHASE_FORM_DEFAULT_LONG_TEXT_LENGTH = 1000;
export const PURCHASE_FORM_MAX_SELECT_OPTIONS = 20;
export const PURCHASE_FORM_MAX_OPTION_LENGTH = 100;
export const PURCHASE_FORM_MAX_FIELD_ID_LENGTH = 32;

export type PurchaseFormFieldType =
  | 'short_text'
  | 'long_text'
  | 'select'    // dropdown — pick one option from a list
  | 'checkbox'  // radio buttons — pick one option from a list
  | 'phone'
  | 'url'
  | 'number';

export const PURCHASE_FORM_FIELD_TYPES: { value: PurchaseFormFieldType; label: string }[] = [
  { value: 'short_text', label: 'Short answer' },
  { value: 'long_text', label: 'Paragraph' },
  { value: 'select', label: 'Multiple choice' },
  { value: 'checkbox', label: 'Single choice' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL' },
  { value: 'number', label: 'Number' },
];

export interface PurchaseFormField {
  id: string;
  label: string;
  type: PurchaseFormFieldType;
  required: boolean;
  help_text?: string | null;
  max_length?: number | null;
  options?: string[] | null;
  min?: number | null;
  max?: number | null;
  integer_only?: boolean | null;
}

export interface PurchaseFormSchema {
  version: 1;
  fields: PurchaseFormField[];
}

export type PurchaseFormResponseValues = Record<string, string | number | null>;

export const isPurchaseFormOptionField = (type: PurchaseFormFieldType): boolean =>
  type === 'select' || type === 'checkbox';

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

export const isSensitiveLabel = (label: string): boolean =>
  SENSITIVE_LABEL_PATTERNS.some((re) => re.test(label));

const FIELD_ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const PHONE_PATTERN = /^[+]?[\d][\d\s().-]{4,30}$/;
const URL_PATTERN = /^https?:\/\/[^\s]{3,200}$/i;

export const purchaseFormFieldSchema = z
  .object({
    id: z.string().regex(FIELD_ID_PATTERN, 'Invalid field id'),
    label: z.string().trim().min(1).max(PURCHASE_FORM_MAX_LABEL_LENGTH),
    type: z.enum(['short_text', 'long_text', 'select', 'checkbox', 'phone', 'url', 'number']),
    required: z.boolean(),
    help_text: z
      .string()
      .max(PURCHASE_FORM_MAX_HELP_LENGTH)
      .nullish()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    max_length: z.number().int().positive().max(PURCHASE_FORM_MAX_TEXT_LENGTH).nullish(),
    options: z
      .array(z.string().trim().min(1).max(PURCHASE_FORM_MAX_OPTION_LENGTH))
      .max(PURCHASE_FORM_MAX_SELECT_OPTIONS)
      .nullish(),
    min: z.number().nullish(),
    max: z.number().nullish(),
    integer_only: z.boolean().nullish(),
  })
  .superRefine((field, ctx) => {
    if (isSensitiveLabel(field.label)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['label'],
        message: 'Label looks like sensitive data — pick something else.',
      });
    }
    if (isPurchaseFormOptionField(field.type)) {
      const opts = (field.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'Add at least one choice',
        });
      }
      const dedup = new Set(opts);
      if (dedup.size !== opts.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'Choices must be unique',
        });
      }
    }
    if (field.type === 'number' && field.min != null && field.max != null && field.min > field.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max'],
        message: 'Max must be greater than or equal to min',
      });
    }
  });

export const purchaseFormSchemaSchema = z
  .object({
    version: z.literal(1),
    fields: z.array(purchaseFormFieldSchema).max(PURCHASE_FORM_MAX_FIELDS),
  })
  .superRefine((schema, ctx) => {
    const ids = new Set<string>();
    schema.fields.forEach((f, i) => {
      if (ids.has(f.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fields', i, 'id'],
          message: 'Duplicate field id',
        });
      } else {
        ids.add(f.id);
      }
    });
  });

export const isPurchaseFormSchemaEmpty = (schema: PurchaseFormSchema | null | undefined): boolean =>
  !schema || !schema.fields || schema.fields.length === 0;

export const makeEmptyPurchaseFormSchema = (): PurchaseFormSchema => ({
  version: 1,
  fields: [],
});

export const slugifyFieldId = (raw: string): string => {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, PURCHASE_FORM_MAX_FIELD_ID_LENGTH);
  if (!base) return 'field';
  return /^[a-z]/.test(base) ? base : `f_${base}`.slice(0, PURCHASE_FORM_MAX_FIELD_ID_LENGTH);
};

export const validateResponseField = (
  field: PurchaseFormField,
  rawValue: unknown,
): string | null => {
  const present = rawValue !== undefined && rawValue !== null && rawValue !== '';
  if (!present) {
    return field.required ? `${field.label} is required.` : null;
  }
  switch (field.type) {
    case 'short_text':
    case 'long_text': {
      if (typeof rawValue !== 'string') return `${field.label} must be text.`;
      const trimmed = rawValue.trim();
      if (field.required && !trimmed) return `${field.label} is required.`;
      const limit = field.max_length ?? PURCHASE_FORM_MAX_TEXT_LENGTH;
      if (trimmed.length > limit) return `${field.label} exceeds ${limit} characters.`;
      return null;
    }
    case 'phone': {
      if (typeof rawValue !== 'string' || !PHONE_PATTERN.test(rawValue.trim())) {
        return `${field.label} must be a valid phone number.`;
      }
      return null;
    }
    case 'url': {
      if (typeof rawValue !== 'string' || !URL_PATTERN.test(rawValue.trim())) {
        return `${field.label} must be a valid http(s) URL.`;
      }
      return null;
    }
    case 'select': {
      if (typeof rawValue !== 'string') return field.required ? `${field.label} is required.` : null;
      const values = rawValue.split(',');
      const invalid = values.filter((v) => !(field.options ?? []).includes(v));
      if (invalid.length > 0) {
        return `${field.label} is not one of the allowed options.`;
      }
      return null;
    }
    case 'checkbox': {
      if (typeof rawValue !== 'string' || rawValue === '') {
        return field.required ? `${field.label} must be checked.` : null;
      }
      if (!(field.options ?? []).includes(rawValue)) {
        return `${field.label} is not one of the allowed options.`;
      }
      return null;
    }
    case 'number': {
      const num = typeof rawValue === 'number' ? rawValue : Number(String(rawValue));
      if (!Number.isFinite(num)) return `${field.label} must be a number.`;
      if (field.integer_only && !Number.isInteger(num)) return `${field.label} must be a whole number.`;
      if (field.min != null && num < field.min) return `${field.label} must be at least ${field.min}.`;
      if (field.max != null && num > field.max) return `${field.label} must be at most ${field.max}.`;
      return null;
    }
  }
};

export const validatePurchaseFormResponse = (
  schema: PurchaseFormSchema | null,
  response: PurchaseFormResponseValues,
): { errors: Record<string, string>; values: PurchaseFormResponseValues } => {
  const errors: Record<string, string> = {};
  const values: PurchaseFormResponseValues = {};
  if (!schema || schema.fields.length === 0) return { errors, values };

  for (const field of schema.fields) {
    const error = validateResponseField(field, response[field.id]);
    if (error) {
      errors[field.id] = error;
    } else {
      const incoming = response[field.id];
      if (incoming === undefined || incoming === null || incoming === '') {
        values[field.id] = null;
      } else if (field.type === 'number') {
        values[field.id] =
          typeof incoming === 'number' ? incoming : Number(String(incoming));
      } else if (typeof incoming === 'string') {
        values[field.id] = incoming.trim();
      } else {
        values[field.id] = incoming as any;
      }
    }
  }
  return { errors, values };
};
