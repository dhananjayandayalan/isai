// Small helpers the account pages share.

import type { SourceType } from '../api/types';

/** True when the page was opened from a sign-in link that no longer works. */
export function linkExpired(location: { hash: string; search: string }): boolean {
  const text = `${location.hash} ${location.search}`;
  return /error_code=otp_expired|error=access_denied/.test(text);
}

/** 213.6 → "3:34". */
export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export const SOURCE_LABEL: Record<SourceType, string> = {
  'piano-solo': 'Piano solo',
  'full-mix': 'Full song',
  'a-cappella': 'Voice only',
};

export const SOURCE_HINT: Record<SourceType, string> = {
  'piano-solo': 'Just a piano. Isai transcribes every note and splits the hands.',
  'full-mix': 'A song with singing and a band. Isai follows the melody and the chords.',
  'a-cappella': 'Voice with no instruments. Isai follows the melody and suggests chords.',
};
