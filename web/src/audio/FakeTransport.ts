import type { Transport, TransportState } from './types';

interface ScheduledEvent {
  id: number;
  at: number;
  callback: (audioTime: number) => void;
}

/**
 * In-memory `Transport` for tests. Time only moves when the test calls `advanceTo` /
 * `advanceBy`, which fire due events in time order, like Tone's transport would.
 */
export class FakeTransport implements Transport {
  /** Audio-clock time of song position 0, so tests can tell song and audio time apart. */
  readonly audioOffset: number;
  private current: TransportState = 'stopped';
  private position = 0;
  private nextId = 1;
  private epoch = 0;
  private readonly events = new Map<number, ScheduledEvent>();

  constructor(audioOffset = 100) {
    this.audioOffset = audioOffset;
  }

  get state(): TransportState {
    return this.current;
  }

  get seconds(): number {
    return this.position;
  }

  get scheduledCount(): number {
    return this.events.size;
  }

  start(): void {
    this.current = 'started';
  }

  pause(): void {
    this.current = 'paused';
  }

  stop(): void {
    this.current = 'stopped';
    this.position = 0;
    this.epoch++;
  }

  seek(seconds: number): void {
    this.position = seconds;
    this.epoch++;
  }

  schedule(at: number, callback: (audioTime: number) => void): number {
    const id = this.nextId++;
    this.events.set(id, { id, at, callback });
    return id;
  }

  clear(id: number): void {
    this.events.delete(id);
  }

  /**
   * While started, move to `seconds` and fire events in [position, seconds) in time order.
   * A callback that seeks, pauses or stops ends the advance there.
   */
  advanceTo(seconds: number): void {
    if (this.current !== 'started') return;
    const from = this.position;
    const epoch = this.epoch;
    const due = [...this.events.values()]
      .filter((e) => e.at >= from && e.at < seconds)
      .sort((a, b) => a.at - b.at || a.id - b.id);
    for (const event of due) {
      if (this.current !== 'started' || this.epoch !== epoch) return;
      if (!this.events.has(event.id)) continue; // cleared by an earlier callback
      this.position = event.at;
      event.callback(event.at + this.audioOffset);
    }
    if (this.current === 'started' && this.epoch === epoch) this.position = seconds;
  }

  advanceBy(seconds: number): void {
    this.advanceTo(this.position + seconds);
  }
}
