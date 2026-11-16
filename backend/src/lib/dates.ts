const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Today's calendar date (YYYY-MM-DD) in the given IANA timezone. */
export function todayIn(tz: string, now: Date): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Add days to a YYYY-MM-DD string (pure calendar arithmetic, no tz involved). */
export function addDays(date: string, days: number): string {
  if (!DATE_RE.test(date)) throw new Error(`Invalid date: ${date}`);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
