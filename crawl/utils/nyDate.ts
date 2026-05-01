// utils/nyDate.ts
export function nyDateString(d = new Date()): string {
  // Get a YYYY-MM-DD for America/New_York without extra deps
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const y = parts.find(p => p.type === 'year')?.value ?? '0000';
  const m = parts.find(p => p.type === 'month')?.value ?? '01';
  const day = parts.find(p => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

export function isYesterdayNY(lastISO?: string): boolean {
  if (!lastISO) return false;
  const today = nyDateString();
  const nyMidnight = new Date(`${today}T00:00:00`);
  // subtract one day from NY midnight → yesterday
  const y = new Date(nyMidnight.getTime() - 24 * 60 * 60 * 1000);
  const yStr = nyDateString(y);
  return lastISO === yStr;
}
