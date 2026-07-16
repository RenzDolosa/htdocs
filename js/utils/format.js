/** Formatting helpers, isolated so display rules live in one place. */

export function fmtMoney(amount) {
  return '$' + Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function fmtInt(value) {
  return Number(value || 0).toLocaleString();
}

/**
 * Formats a timestamp as "YYYY-MM-DD HH:mm:ss" in the browser's own local
 * timezone. Date's get* accessors (getFullYear/getHours/etc.) are already
 * local-time by definition — it's toISOString() that forces UTC, which is
 * what made exported "Last Updated" columns look shifted by several hours.
 */
export function fmtLocalDateTime(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Formats a Date (defaulting to now) as "YYYY-MM-DD" in local time, for filenames. */
export function fmtLocalDateStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Formats a Date (defaulting to now) as "Tue, Jul 14, 2026" — used to auto-fill the Manifest date field. */
export function fmtManifestDate(date = new Date()) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
