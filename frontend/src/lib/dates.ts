export function todayLocal(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function formatDue(dueDate: string, today = todayLocal()): { label: string; tone: 'overdue' | 'today' | 'soon' | 'normal' } {
  const diff = daysBetween(today, dueDate);
  const pretty = new Date(`${dueDate}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  if (diff < 0) return { label: `${pretty} · ${-diff}d overdue`, tone: 'overdue' };
  if (diff === 0) return { label: 'Today', tone: 'today' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'soon' };
  return { label: pretty, tone: diff <= 3 ? 'soon' : 'normal' };
}
