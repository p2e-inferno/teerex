
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatEventDateRange, isEventOngoing, hasEventEnded } from '../../../src/utils/dateUtils';

describe('dateUtils', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('formatEventDateRange', () => {
        it('formats single day short', () => {
            const date = new Date('2025-01-15T12:00:00');
            expect(formatEventDateRange({ startDate: date })).toBe('Jan 15, 2025');
        });

        it('formats single day long', () => {
            const date = new Date('2025-01-15T12:00:00');
            expect(formatEventDateRange({ startDate: date, formatStyle: 'long' }))
                .toBe('Wednesday, January 15th, 2025');
            // Note: date-fns 'do' might be 15th. Check date-fns locale if needed. (Standard en-US is 1st, 2nd, 3rd...)
        });

        it('formats multi-day same month', () => {
            const start = new Date('2025-01-15T10:00:00');
            const end = new Date('2025-01-18T10:00:00');
            expect(formatEventDateRange({ startDate: start, endDate: end }))
                .toBe('Jan 15 - 18, 2025');
        });

        it('formats multi-day different months', () => {
            const start = new Date('2025-01-28');
            const end = new Date('2025-02-02');
            expect(formatEventDateRange({ startDate: start, endDate: end }))
                .toBe('Jan 28 - Feb 2, 2025');
        });

        it('formats multi-day different years', () => {
            const start = new Date('2025-12-30');
            const end = new Date('2026-01-02');
            expect(formatEventDateRange({ startDate: start, endDate: end }))
                .toBe('Dec 30, 2025 - Jan 2, 2026');
        });
    });

    describe('isEventOngoing', () => {
        it('returns true if current time is within range', () => {
            const now = new Date('2025-01-16T12:00:00');
            vi.setSystemTime(now);

            const start = new Date('2025-01-15');
            const end = new Date('2025-01-18');
            expect(isEventOngoing(start, end)).toBe(true);
        });

        it('returns false if before start', () => {
            const now = new Date('2025-01-14T12:00:00');
            vi.setSystemTime(now);

            const start = new Date('2025-01-15');
            expect(isEventOngoing(start)).toBe(false);
        });

        it('returns false if after end', () => {
            const now = new Date('2025-01-19T12:00:00');
            vi.setSystemTime(now);

            const start = new Date('2025-01-15');
            const end = new Date('2025-01-18');
            expect(isEventOngoing(start, end)).toBe(false);
        });
    });

    describe('hasEventEnded', () => {
        it('returns true if now is after end date', () => {
            const now = new Date('2025-01-19T00:00:00'); // Midnight next day
            vi.setSystemTime(now);

            const start = new Date('2025-01-15');
            const end = new Date('2025-01-18');
            expect(hasEventEnded(start, end)).toBe(true);
        });

        it('returns false if now is during event', () => {
            const now = new Date('2025-01-18T23:00:00'); // Last hour
            vi.setSystemTime(now);

            const start = new Date('2025-01-15');
            const end = new Date('2025-01-18');
            expect(hasEventEnded(start, end)).toBe(false);
        });
    });
});
