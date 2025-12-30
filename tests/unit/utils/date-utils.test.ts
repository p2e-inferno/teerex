
import { describe, it, expect } from 'vitest';
import { formatEventDate } from '../../../supabase/functions/_shared/date-utils';

describe('formatEventDate', () => {
    it('formats valid date string correctly', () => {
        const input = '2023-12-25T10:00:00Z';
        const expected = '2023-12-25';
        expect(formatEventDate(input)).toBe(expected);
    });

    it('returns fallback for null input', () => {
        expect(formatEventDate(null)).toBe('TBA');
    });

    it('returns fallback for empty string', () => {
        expect(formatEventDate('')).toBe('TBA');
    });

    it('uses custom fallback', () => {
        expect(formatEventDate(null, 'Coming Soon')).toBe('Coming Soon');
    });

    it('returns fallback for invalid date string', () => {
        expect(formatEventDate('invalid-date')).toBe('TBA');
    });
});
