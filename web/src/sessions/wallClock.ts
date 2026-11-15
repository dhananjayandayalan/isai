// Calendar time, for dating a saved session and showing that date. This is the only file
// in the app that may use `Date` (ADR 0006; the rule 6 lint guard has an exception for
// exactly this path). Nothing here may be used for timing: how long a run lasted, and
// everything about notes, comes from the audio clock.

/** Now, as an ISO 8601 date and time. */
export function isoNow(): string {
  return new Date().toISOString();
}

/** A stored date for display, e.g. "13 Nov, 12:52". Empty when it can't be read. */
export function formatWhen(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}
