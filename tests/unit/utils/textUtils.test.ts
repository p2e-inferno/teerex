
import { describe, it, expect } from 'vitest';
import { stripHtml, truncateText, prepareTextForCard, isEmptyHtml } from '../../../src/utils/textUtils';

describe('textUtils', () => {
    describe('stripHtml', () => {
        it('removes tags from simple html', () => {
            expect(stripHtml('<p>Hello</p>')).toBe('Hello');
        });

        it('returns empty string for null/empty input', () => {
            expect(stripHtml('')).toBe('');
        });

        it('handles nested tags', () => {
            expect(stripHtml('<div><p>Hello <b>World</b></p></div>')).toBe('Hello World');
        });
    });

    describe('truncateText', () => {
        it('truncates text correctly', () => {
            expect(truncateText('Hello World', 5)).toBe('Hello...');
        });

        it('returns original text if short enough', () => {
            expect(truncateText('Hello', 10)).toBe('Hello');
        });

        it('handles empty input', () => {
            expect(truncateText('', 5)).toBe('');
        });
    });

    describe('prepareTextForCard', () => {
        it('strips and truncates', () => {
            const html = '<p>This is a long description</p>';
            expect(prepareTextForCard(html, 10)).toBe('This is a...');
        });

        it('strips without truncation if no limit', () => {
            const html = '<p>Short</p>';
            expect(prepareTextForCard(html)).toBe('Short');
        });
    });

    describe('isEmptyHtml', () => {
        it('returns true for empty string', () => {
            expect(isEmptyHtml('')).toBe(true);
        });

        it('returns true for html with only whitespace', () => {
            expect(isEmptyHtml('<p>   </p>')).toBe(true);
            expect(isEmptyHtml('<div><br/></div>')).toBe(true);
            // Note: Implementation uses stripHtml -> textContent. <br/> -> "" usually.
        });

        it('returns false for actual content', () => {
            expect(isEmptyHtml('<p>Hi</p>')).toBe(false);
        });
    });
});
