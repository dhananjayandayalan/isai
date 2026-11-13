// What Isai remembers about the learner's setup between visits (ADR 0006). Kept behind an
// interface: `localStorage` now, the learner's profile once there is a backend (P8).

import { clampOffset } from '../engine/practice/latency';
import { DEFAULT_KEYBOARD_SIZE, KEYBOARD_SIZES, type KeyboardSize } from '../piano/layout';

export interface AppSettings {
  keyboardSize: KeyboardSize;
  /** The MIDI device connected last, to pick it again. */
  lastDeviceId: string | null;
  /** "Play my notes through Isai". */
  monitor: boolean;
  /** Calibrated latency offset in seconds, per MIDI device id. */
  latencyOffsets: Record<string, number>;
}

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = {
  keyboardSize: DEFAULT_KEYBOARD_SIZE,
  lastDeviceId: null,
  monitor: true,
  latencyOffsets: {},
};

export interface SettingsStore {
  /** The saved settings, with defaults for anything missing or unreadable. Never throws. */
  load(): AppSettings;
  /** Change some settings and return them all. Never throws; a failed write is kept in memory. */
  save(patch: Partial<AppSettings>): AppSettings;
}

export const SETTINGS_KEY = 'isai-settings';

/** Turn whatever was stored into valid settings, field by field. */
export function readSettings(raw: unknown): AppSettings {
  const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, latencyOffsets: {} };
  if (typeof raw !== 'object' || raw === null) return settings;
  const stored = raw as Record<string, unknown>;
  const size = KEYBOARD_SIZES.find((s) => s === stored.keyboardSize);
  if (size) settings.keyboardSize = size;
  if (typeof stored.lastDeviceId === 'string') settings.lastDeviceId = stored.lastDeviceId;
  if (typeof stored.monitor === 'boolean') settings.monitor = stored.monitor;
  if (typeof stored.latencyOffsets === 'object' && stored.latencyOffsets !== null) {
    for (const [device, offset] of Object.entries(stored.latencyOffsets)) {
      if (typeof offset === 'number' && Number.isFinite(offset)) settings.latencyOffsets[device] = clampOffset(offset);
    }
  }
  return settings;
}

export class MemorySettingsStore implements SettingsStore {
  private current: AppSettings;

  constructor(initial: Partial<AppSettings> = {}) {
    this.current = readSettings({ ...DEFAULT_APP_SETTINGS, ...initial });
  }

  load(): AppSettings {
    return this.current;
  }

  save(patch: Partial<AppSettings>): AppSettings {
    this.current = readSettings({ ...this.current, ...patch });
    return this.current;
  }
}

/**
 * Settings in `localStorage`. `storage` is a function because merely reading
 * `window.localStorage` throws in some private modes; every access is guarded, and when
 * storage is unavailable the settings simply last for the visit.
 */
export class LocalSettingsStore implements SettingsStore {
  private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  private readonly key: string;
  private current: AppSettings | null = null;

  constructor(storage: () => Pick<Storage, 'getItem' | 'setItem'>, key: string = SETTINGS_KEY) {
    this.storage = storage;
    this.key = key;
  }

  load(): AppSettings {
    if (this.current) return this.current;
    let raw: unknown;
    try {
      const text = this.storage().getItem(this.key);
      raw = text === null ? null : (JSON.parse(text) as unknown);
    } catch {
      raw = null; // unavailable or corrupt: start from the defaults
    }
    this.current = readSettings(raw);
    return this.current;
  }

  save(patch: Partial<AppSettings>): AppSettings {
    const next = readSettings({ ...this.load(), ...patch });
    this.current = next;
    try {
      this.storage().setItem(this.key, JSON.stringify({ version: 1, ...next }));
    } catch {
      // Private mode or a full disk: the settings still apply until the page closes.
    }
    return next;
  }
}
