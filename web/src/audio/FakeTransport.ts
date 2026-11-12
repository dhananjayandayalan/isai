import type { AudioClock } from '../midi/AudioClock';
import type { Transport, TransportState } from './types';

interface ScheduledEvent {
  id: number;
  at: number;
  callback: (audioTime: number) => void;
}

/**
 * In-memory `Transport` for tests. Time only moves when the test calls `advanceTo`,
 * `advanceBy` or `wait`. Like the real one it has two clocks: the position, which only
 * moves while started, and the audio clock, which never stops.
 */
export class FakeTransport implements Transport {
  /** Audio-clock time when the transport was created, so the two clocks differ. */
  readonly audioOffset: number;
  /** See `Transport.lookahead`. Here `start()` simply takes this long. */
  lookahead = 0;
  private current: TransportState = 'stopped';
  private position = 0;
  private audioNow: number;
  private nextId = 1;
  private epoch = 0;
  private readonly events = new Map<number, ScheduledEvent>();

  /** The audio clock of this transport, for code that needs an `AudioClock`. */
  readonly clock: AudioClock = {
    now: () => this.audioNow,
    fromDomTimestamp: () => this.audioNow,
  };

  constructor(audioOffset = 100) {
    this.audioOffset = audioOffset;
    this.audioNow = audioOffset;
  }

  get state(): TransportState {
    return this.current;
  }

  get seconds(): number {
    return this.position;
  }

  /** Audio-clock time now. */
  get audioTime(): number {
    return this.audioNow;
  }

  get scheduledCount(): number {
    return this.events.size;
  }

  start(): void {
    if (this.current === 'started') return;
    this.audioNow += this.lookahead;
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
   * A callback that seeks, pauses or stops ends the advance there. An event at the
   * position itself fires (again), as it does when a real transport starts on it.
   */
  advanceTo(seconds: number): void {
    if (this.current !== 'started') return;
    const epoch = this.epoch;
    const fired = new Set<number>();
    for (;;) {
      // Look again after every callback: it may have scheduled or cleared events.
      let next: ScheduledEvent | undefined;
      for (const event of this.events.values()) {
        if (fired.has(event.id) || event.at < this.position || event.at >= seconds) continue;
        if (!next || event.at < next.at || (event.at === next.at && event.id < next.id)) next = event;
      }
      if (!next) break;
      fired.add(next.id);
      this.moveTo(next.at);
      const firstNewId = this.nextId;
      next.callback(this.audioNow);
      if (this.current !== 'started' || this.epoch !== epoch) return;
      // Like the real transport, an event added for a time that is already being
      // processed has missed its moment.
      for (const event of this.events.values()) {
        if (event.id >= firstNewId && event.at <= this.position) fired.add(event.id);
      }
    }
    this.moveTo(seconds);
  }

  advanceBy(seconds: number): void {
    this.advanceTo(this.position + seconds);
  }

  /**
   * Let `seconds` of real time pass. While started that advances the position too; while
   * paused or stopped only the audio clock moves (a learner thinking about the next note).
   */
  wait(seconds: number): void {
    if (this.current === 'started') this.advanceBy(seconds);
    else this.audioNow += seconds;
  }

  private moveTo(position: number): void {
    this.audioNow += position - this.position;
    this.position = position;
  }
}
