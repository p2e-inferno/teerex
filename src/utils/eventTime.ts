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
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
): string {
  if (startsAtIso) {
    const startsAt = new Date(startsAtIso);
    if (Number.isFinite(startsAt.getTime())) {
      return startsAt.toLocaleTimeString(undefined, options);
    }
  }

  return fallbackTime;
}

export function formatEventLocalDateTime(
  isoValue: string | null | undefined,
  dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
  timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
): string | null {
  if (!isoValue) return null;
  const value = new Date(isoValue);
  if (!Number.isFinite(value.getTime())) return null;

  return `${value.toLocaleDateString(undefined, dateOptions)} at ${value.toLocaleTimeString(undefined, timeOptions)}`;
}
