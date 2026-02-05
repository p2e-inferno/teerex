export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDateOnlyFromUtcMs(utcMs: number): string {
  const dt = new Date(utcMs);
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Convert a date input to a date-only string (YYYY-MM-DD).
 * If a timezone offset (minutes) is provided, the date is interpreted
 * as local time for that offset, then converted to a local date.
 */
export function toDateOnly(
  value: unknown,
  timezoneOffsetMinutes?: number,
): string | null {
  if (typeof value === "string") {
    if (isValidDateOnly(value)) return value;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return null;
    if (Number.isFinite(timezoneOffsetMinutes)) {
      const offsetMs = Number(timezoneOffsetMinutes) * 60 * 1000;
      const localMs = parsed.getTime() - offsetMs;
      return formatDateOnlyFromUtcMs(localMs);
    }
    return parsed.toISOString().split("T")[0];
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    if (Number.isFinite(timezoneOffsetMinutes)) {
      const offsetMs = Number(timezoneOffsetMinutes) * 60 * 1000;
      const localMs = value.getTime() - offsetMs;
      return formatDateOnlyFromUtcMs(localMs);
    }
    return value.toISOString().split("T")[0];
  }

  return null;
}

type ParsedTime = { hour: number; minute: number };

/**
 * Parse times like:
 * - "19:00"
 * - "7:00 PM"
 * - "07:00pm"
 */
export function parseTimeToHourMinute(timeString: unknown): ParsedTime {
  if (typeof timeString !== "string") {
    throw new Error("Invalid time format");
  }

  const m = timeString.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) throw new Error("Invalid time format (expected HH:MM or H:MM AM/PM)");

  const hoursRaw = Number(m[1]);
  const minutes = Number(m[2]);
  const period = m[3]?.toUpperCase();

  if (!Number.isFinite(hoursRaw) || !Number.isFinite(minutes)) {
    throw new Error("Invalid time format");
  }
  if (minutes < 0 || minutes > 59) {
    throw new Error("Invalid time minutes");
  }

  let hour = hoursRaw;
  if (period) {
    if (hoursRaw < 1 || hoursRaw > 12) {
      throw new Error("Invalid 12-hour time");
    }
    if (period === "PM" && hoursRaw !== 12) hour = hoursRaw + 12;
    if (period === "AM" && hoursRaw === 12) hour = 0;
  } else {
    if (hoursRaw < 0 || hoursRaw > 23) {
      throw new Error("Invalid 24-hour time");
    }
  }

  return { hour, minute: minutes };
}

/**
 * Build a canonical TIMESTAMPTZ ISO string from a date-only (YYYY-MM-DD)
 * and a time string (24h or 12h with AM/PM), interpreted in the server's
 * local timezone.
 *
 * This avoids runtime-dependent parsing of `new Date("${date}T${time}")`.
 */
export function buildStartsAtUtcIso(
  dateOnly: string,
  timeString: string,
  timezoneOffsetMinutes?: number,
): string {
  if (!isValidDateOnly(dateOnly)) {
    throw new Error("Invalid date format (expected YYYY-MM-DD)");
  }

  const [yearStr, monthStr, dayStr] = dateOnly.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1; // 0-based
  const day = Number(dayStr);
  const { hour, minute } = parseTimeToHourMinute(timeString);

  const baseUtcMs = Date.UTC(year, monthIndex, day, hour, minute, 0, 0);
  const offsetMs = Number.isFinite(timezoneOffsetMinutes)
    ? Number(timezoneOffsetMinutes) * 60 * 1000
    : 0;
  const dt = new Date(baseUtcMs + offsetMs);
  if (!Number.isFinite(dt.getTime())) {
    throw new Error("Failed to build starts_at timestamp");
  }
  return dt.toISOString();
}
