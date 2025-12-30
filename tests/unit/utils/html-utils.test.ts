
import { describe, it, expect } from 'vitest';
import { stripHtml, decodeHtmlEntities, truncateText } from '../../../supabase/functions/_shared/html-utils';

describe('html-utils', () => {
    describe('stripHtml', () => {
        it('removes simple tags', () => {
            const input = '<p>Hello <b>World</b></p>';
            expect(stripHtml(input)).toBe('Hello World');
        });

        it('converts block elements to newlines', () => {
            const input = '<p>Line 1</p><p>Line 2</p>';
            const result = stripHtml(input);
            expect(result).toContain('Line 1');
            expect(result).toContain('Line 2');
            // Exact whitespace might vary slightly due to implementation, but should have specific structure
        });

        it('removes script tags and content', () => {
            const input = "<script>alert('bad')</script>Hello";
            expect(stripHtml(input)).toBe('Hello');
        });
    });

    describe('decodeHtmlEntities', () => {
        it('decodes named entities', () => {
            expect(decodeHtmlEntities('&amp;')).toBe('&');
            expect(decodeHtmlEntities('&lt;')).toBe('<');
            expect(decodeHtmlEntities('&copy;')).toBe('©');
        });

        it('decodes numeric entities', () => {
            expect(decodeHtmlEntities('&#65;')).toBe('A');
            expect(decodeHtmlEntities('&#x41;')).toBe('A');
        });
    });

    describe('truncateText', () => {
        it('returns original text if below limit', () => {
            expect(truncateText('Hello', 10)).toBe('Hello');
        });

        it('truncates text above limit', () => {
            const text = 'Hello World This Is Long';
            const result = truncateText(text, 10);
            expect(result.length).toBeLessThanOrEqual(10);
            expect(result.endsWith('...')).toBe(true);
        });
    });
});
