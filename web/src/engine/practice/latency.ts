// The latency model for scoring (ADR 0006). A key press reaches the app late, and the
// learner hears Isai late; scoring compares the press with the song as it was heard.

/** The largest offset calibration may set, in seconds. Beyond this something else is wrong. */
export const MAX_OFFSET = 0.3;

/**
 * When a key press happened, as the learner heard the song. `midiTime` is the adapter's
 * audio-clock time, `outputLatency` what the transport says the clock doesn't already
 * cover, and `userOffset` what calibration measured for this device.
 */
export function effectiveTime(midiTime: number, outputLatency: number, userOffset: number): number {
  return midiTime - outputLatency - userOffset;
}

/** A usable offset: a number, within ±`MAX_OFFSET`. Anything else is 0. */
export function clampOffset(offset: unknown): number {
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return 0;
  return Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, offset));
}
