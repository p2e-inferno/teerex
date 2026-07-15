import { format, isSameDay } from 'date-fns';

const DEFAULT_TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

export interface EventStartInput {
  starts_at?: string | null;
  date?: Date | string | null;
}

export interface ResolvedEventStart {
  value: Date;
  precision: 'timestamp' | 'day';
}

export function resolveEventStart(event: EventStartInput): ResolvedEventStart | null {
  const startsAt = parseValidDate(event.starts_at);
  if (startsAt) return { value: startsAt, precision: 'timestamp' };

  const legacyDate = event.date instanceof Date ? event.date : parseValidDate(event.date);
  if (!legacyDate || !Number.isFinite(legacyDate.getTime())) return null;
  return { value: legacyDate, precision: 'day' };
}

export function isUpcomingEvent(event: EventStartInput, now: Date = new Date()): boolean {
  const start = resolveEventStart(event);
  if (!start) return false;
  if (start.precision === 'timestamp') return start.value >= now;

  return new Date(start.value.getFullYear(), start.value.getMonth(), start.value.getDate())
    >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDateOnlyFromUtcMs(utcMs: number): string {
  const dt = new Date(utcMs);
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toDateOnly(
  value: Date | string | null | undefined,
  timezoneOffsetMinutes = new Date().getTimezoneOffset()
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const localMs = date.getTime() - timezoneOffsetMinutes * 60 * 1000;
  return formatDateOnlyFromUtcMs(localMs);
}

export function buildEventUtcIso(
  date: Date | string | null | undefined,
  time: string | null | undefined,
  timezoneOffsetMinutes = new Date().getTimezoneOffset()
): string | null {
  const dateOnly = toDateOnly(date, timezoneOffsetMinutes);
  if (!dateOnly || !time) return null;

  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  const [year, month, day] = dateOnly.split('-').map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const localOffsetMs = timezoneOffsetMinutes * 60 * 1000;
  const result = new Date(utcMs + localOffsetMs);
  return Number.isFinite(result.getTime()) ? result.toISOString() : null;
}

export function getEventStartIso(formData: {
  date: Date | null;
  time: string;
}): string | null {
  return buildEventUtcIso(formData.date, formData.time);
}

export function getEventEndIso(formData: {
  date: Date | null;
  endDate?: Date | null;
  endTime?: string;
  time: string;
}): string | null {
  return buildEventUtcIso(formData.endDate || formData.date, formData.endTime || formData.time);
}

export function getDefaultRefundTriggerIso(startsAtIso: string | null): string | null {
  if (!startsAtIso) return null;
  const startsAt = new Date(startsAtIso);
  if (!Number.isFinite(startsAt.getTime())) return null;
  return new Date(startsAt.getTime() - 60 * 60 * 1000).toISOString();
}

export function formatEventLocalTime(
  startsAtIso: string | null | undefined,
  fallbackTime: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_TIME_OPTIONS
): string {
  const startsAt = parseValidDate(startsAtIso);
  if (startsAt) {
    return startsAt.toLocaleTimeString(undefined, options);
  }

  return fallbackTime;
}

export function formatEventLocalTimeRange(
  startsAtIso: string | null | undefined,
  endsAtIso: string | null | undefined,
  fallbackStartTime: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_TIME_OPTIONS
): string {
  const startsAt = parseValidDate(startsAtIso);
  const endsAt = parseValidDate(endsAtIso);
  const startLabel = startsAt
    ? startsAt.toLocaleTimeString(undefined, options)
    : fallbackStartTime;

  if (!endsAt) return startLabel;

  const endLabel = endsAt.toLocaleTimeString(undefined, options);
  if (!startLabel) return endLabel;

  const timeZone = typeof options.timeZone === 'string' ? options.timeZone : undefined;
  if (startsAt && isSameDisplayDay(startsAt, endsAt, timeZone)) {
    return `${startLabel} - ${endLabel}`;
  }

  const sameDisplayYear = startsAt && getDisplayYear(startsAt, timeZone) === getDisplayYear(endsAt, timeZone);
  return `${startLabel} - ${formatDisplayEndDate(endsAt, Boolean(!sameDisplayYear), timeZone)}, ${endLabel}`;
}

export function formatEventLocalDateTime(
  isoValue: string | null | undefined,
  dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
  timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
): string | null {
  const value = parseValidDate(isoValue);
  if (!value) return null;

  return `${value.toLocaleDateString(undefined, dateOptions)} at ${value.toLocaleTimeString(undefined, timeOptions)}`;
}

function parseValidDate(isoValue: string | null | undefined): Date | null {
  if (!isoValue) return null;
  const value = new Date(isoValue);
  return Number.isFinite(value.getTime()) ? value : null;
}

function isSameDisplayDay(left: Date, right: Date, timeZone?: string): boolean {
  if (!timeZone) return isSameDay(left, right);
  return getDisplayDateKey(left, timeZone) === getDisplayDateKey(right, timeZone);
}

function getDisplayDateKey(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function getDisplayYear(value: Date, timeZone?: string): number {
  if (!timeZone) return value.getFullYear();
  return Number(new Intl.DateTimeFormat('en', { timeZone, year: 'numeric' }).format(value));
}

function formatDisplayEndDate(value: Date, includeYear: boolean, timeZone?: string): string {
  if (!timeZone) {
    return format(value, includeYear ? 'd MMMM yyyy' : 'd MMMM');
  }

  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'long',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(value);
}
