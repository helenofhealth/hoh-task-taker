/** Business-day helpers (Monday–Friday). */

function isBusinessDay(d: Date) {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

/** The earliest allowed desired-completion date: `days` business days from today. */
export function earliestBusinessDate(days = 3): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d)) added++;
  }
  return d;
}

export function toISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** true when `iso` is at least `days` business days ahead of today. */
export function meetsMinimumBusinessDays(iso: string, days = 3) {
  if (!iso) return false;
  return iso >= toISODate(earliestBusinessDate(days));
}

/** "Mon 8 Sep" style label. */
export function friendlyDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
