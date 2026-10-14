// Business-day calendar and ACT/360 accrual. Weekends are skipped; holidays are ignored
// (an explicit simplification). Interest accrues for calendar days, so Friday's accrual
// covers Friday→Monday (3 days), as it does on a real US money-market book.

const DAY_MS = 86400000;
export const START_DATE = '2027-01-04'; // a Monday

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(d.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export function nextBusinessDay(iso: string): string {
  let d = addDays(iso, 1);
  for (;;) {
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    if (wd !== 0 && wd !== 6) return d;
    d = addDays(d, 1);
  }
}

export function calendarDaysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / DAY_MS);
}

/** Accrual days from this business day to the next one (1, or 3 over a weekend). */
export function accrualDays(iso: string): number {
  return calendarDaysBetween(iso, nextBusinessDay(iso));
}

export const DAY_COUNT = 360;

export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${wd} ${d.getUTCDate()} ${mo} ${d.getUTCFullYear()}`;
}
