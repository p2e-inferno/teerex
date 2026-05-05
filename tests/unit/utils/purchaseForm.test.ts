import { describe, expect, it } from 'vitest';
import {
  PurchaseFormSchema,
  isPurchaseFormSchemaEmpty,
  isSensitiveLabel,
  slugifyFieldId,
  validateResponseField,
  validatePurchaseFormResponse,
} from '@/types/purchaseForm';

const schema = (
  fields: PurchaseFormSchema['fields'],
): PurchaseFormSchema => ({ version: 1, fields });

describe('purchaseForm — slugifyFieldId', () => {
  it('lowercases and replaces non-alphanumerics with underscore', () => {
    expect(slugifyFieldId('Full Name?')).toBe('full_name');
    expect(slugifyFieldId('  Email Address!! ')).toBe('email_address');
  });

  it('prefixes f_ when slug starts with non-letter', () => {
    expect(slugifyFieldId('123 abc')).toBe('f_123_abc');
  });

  it('returns "field" for empty input', () => {
    expect(slugifyFieldId('')).toBe('field');
    expect(slugifyFieldId('   ')).toBe('field');
  });

  it('caps length at 32 chars', () => {
    const long = 'a'.repeat(50);
    expect(slugifyFieldId(long).length).toBeLessThanOrEqual(32);
  });
});

describe('purchaseForm — isSensitiveLabel', () => {
  it('flags obvious sensitive labels', () => {
    expect(isSensitiveLabel('Your SSN')).toBe(true);
    expect(isSensitiveLabel('Credit card number')).toBe(true);
    expect(isSensitiveLabel('Password')).toBe(true);
    expect(isSensitiveLabel('CVV')).toBe(true);
    expect(isSensitiveLabel('PIN code')).toBe(true);
    expect(isSensitiveLabel('Passport number')).toBe(true);
    expect(isSensitiveLabel('IBAN')).toBe(true);
  });

  it('does not flag innocuous labels', () => {
    expect(isSensitiveLabel('Full name')).toBe(false);
    expect(isSensitiveLabel('Telegram handle')).toBe(false);
    expect(isSensitiveLabel('T-shirt size')).toBe(false);
  });
});

describe('purchaseForm — isPurchaseFormSchemaEmpty', () => {
  it('returns true for null/undefined/empty fields', () => {
    expect(isPurchaseFormSchemaEmpty(null)).toBe(true);
    expect(isPurchaseFormSchemaEmpty(undefined)).toBe(true);
    expect(isPurchaseFormSchemaEmpty(schema([]))).toBe(true);
  });

  it('returns false when fields exist', () => {
    expect(
      isPurchaseFormSchemaEmpty(
        schema([{ id: 'a', label: 'A', type: 'short_text', required: true }]),
      ),
    ).toBe(false);
  });
});

describe('purchaseForm — validateResponseField', () => {
  it('rejects empty value when required', () => {
    expect(
      validateResponseField(
        { id: 'name', label: 'Name', type: 'short_text', required: true },
        '',
      ),
    ).toMatch(/required/);
  });

  it('passes empty value when optional', () => {
    expect(
      validateResponseField(
        { id: 'name', label: 'Name', type: 'short_text', required: false },
        '',
      ),
    ).toBeNull();
  });

  it('rejects text exceeding max_length', () => {
    expect(
      validateResponseField(
        { id: 'a', label: 'A', type: 'short_text', required: true, max_length: 5 },
        '123456',
      ),
    ).toMatch(/exceeds/);
  });

  it('validates phone format', () => {
    const f = { id: 'p', label: 'Phone', type: 'phone' as const, required: true };
    expect(validateResponseField(f, '+2348012345678')).toBeNull();
    expect(validateResponseField(f, 'abc')).toMatch(/valid phone/);
  });

  it('validates URL format', () => {
    const f = { id: 'u', label: 'URL', type: 'url' as const, required: true };
    expect(validateResponseField(f, 'https://example.com')).toBeNull();
    expect(validateResponseField(f, 'not a url')).toMatch(/valid http/);
  });

  it('rejects select value not in options', () => {
    expect(
      validateResponseField(
        {
          id: 'size',
          label: 'Size',
          type: 'select',
          required: true,
          options: ['S', 'M', 'L'],
        },
        'XL',
      ),
    ).toMatch(/not one of/);
  });

  it('validates number range and integer-only', () => {
    const f = {
      id: 'age',
      label: 'Age',
      type: 'number' as const,
      required: true,
      min: 18,
      max: 100,
      integer_only: true,
    };
    expect(validateResponseField(f, 21)).toBeNull();
    expect(validateResponseField(f, 17)).toMatch(/at least 18/);
    expect(validateResponseField(f, 101)).toMatch(/at most 100/);
    expect(validateResponseField(f, 21.5)).toMatch(/whole number/);
    expect(validateResponseField(f, 'abc')).toMatch(/must be a number/);
  });

  it('treats numeric 0 as a valid present value', () => {
    expect(
      validateResponseField(
        { id: 'n', label: 'N', type: 'number', required: true },
        0,
      ),
    ).toBeNull();
  });

  it('checkbox required must be true', () => {
    const f = { id: 'agree', label: 'Agree', type: 'checkbox' as const, required: true };
    expect(validateResponseField(f, true)).toBeNull();
    expect(validateResponseField(f, false)).toMatch(/must be checked/);
  });

  it('checkbox optional accepts both true and false', () => {
    const f = { id: 'agree', label: 'Agree', type: 'checkbox' as const, required: false };
    expect(validateResponseField(f, true)).toBeNull();
    expect(validateResponseField(f, false)).toBeNull();
  });
});

describe('purchaseForm — validatePurchaseFormResponse', () => {
  it('returns empty when schema is empty', () => {
    const result = validatePurchaseFormResponse(null, {});
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({});
  });

  it('aggregates errors per field', () => {
    const s = schema([
      { id: 'name', label: 'Name', type: 'short_text', required: true },
      { id: 'phone', label: 'Phone', type: 'phone', required: true },
    ]);
    const { errors } = validatePurchaseFormResponse(s, { name: '', phone: 'bad' });
    expect(Object.keys(errors).sort()).toEqual(['name', 'phone']);
  });

  it('returns cleaned values for valid input', () => {
    const s = schema([
      { id: 'name', label: 'Name', type: 'short_text', required: true },
      { id: 'count', label: 'Count', type: 'number', required: false },
      { id: 'agree', label: 'Agree', type: 'checkbox', required: false },
    ]);
    const { errors, values } = validatePurchaseFormResponse(s, {
      name: '  Alice  ',
      count: '42',
      agree: 'true',
    });
    expect(errors).toEqual({});
    expect(values).toEqual({ name: 'Alice', count: 42, agree: true });
  });

  it('preserves null for optional unset fields', () => {
    const s = schema([
      { id: 'name', label: 'Name', type: 'short_text', required: false },
    ]);
    const { values } = validatePurchaseFormResponse(s, {});
    expect(values).toEqual({ name: null });
  });
});
