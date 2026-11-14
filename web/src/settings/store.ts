// What Isai remembers about the learner's setup between visits (ADR 0006). Kept behind an
// interface: `localStorage` now, the learner's profile once there is a backend (P8).
//
// Version 2 (P7) adds the Devices screen's settings and replaces version 1's `monitor`
// with `appSound`. Records are read field by field: anything missing or broken takes its
// default, the rest is kept.

import type { VelocityCurve } from '../audio/velocity';
import { clampOffset } from '../engine/practice/latency';
import { DEFAULT_KEYBOARD_SIZE, KEYBOARD_SIZES, type KeyboardSize } from '../piano/layout';
import type { Notation } from '../theory/labels';
import type { MinorSolfege } from '../theory/solfege';
import type { SwaraDetail } from '../theory/swaras';

/** What sounds your notes: Isai's grand or electric piano, or only your keyboard ("Off"). */
export type AppSound = 'grand' | 'electric' | 'off';

export interface AppSettings {
  keyboardSize: KeyboardSize;
  /** The MIDI device connected last, to pick it again. */
  lastDeviceId: string | null;
  /** Isai's sound. "off" stops Isai sounding your notes; its own parts use the grand piano. */
  appSound: AppSound;
  /** How your touch is shaped when Isai sounds your notes. */
  velocityCurve: VelocityCurve;
  /** Calibrated latency offset in seconds, per MIDI device id. */
  latencyOffsets: Record<string, number>;
  /** How notes and chords are named, or the staff. */
  notation: Notation;
  /** Letters with octave numbers. */
  octaves: boolean;
  swaraDetail: SwaraDetail;
  minorSolfege: MinorSolfege;
  /** Seconds of music the falling notes show ahead, 2–8. */
  lookahead: number;
  /** The metronome is on when Practice opens. */
  metronome: boolean;
  /** Show the arranged hand you're not playing (as a ghost) rather than hide it. */
  showOtherHand: boolean;
}

export const LOOKAHEAD_RANGE = { min: 2, max: 8 } as const;

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = {
  keyboardSize: DEFAULT_KEYBOARD_SIZE,
  lastDeviceId: null,
  appSound: 'grand',
  velocityCurve: 'normal',
  latencyOffsets: {},
  notation: 'letters',
  octaves: false,
  swaraDetail: 'short',
  minorSolfege: 'do',
  lookahead: 4,
  metronome: false,
  showOtherHand: true,
};

export const SETTINGS_VERSION = 2;

const APP_SOUNDS: readonly AppSound[] = ['grand', 'electric', 'off'];
const CURVES: readonly VelocityCurve[] = ['soft', 'normal', 'hard'];
const NOTATIONS: readonly Notation[] = ['letters', 'solfege', 'swaras', 'roman', 'staff'];
const SWARA_DETAILS: readonly SwaraDetail[] = ['short', 'detailed'];
const MINOR_SOLFEGE: readonly MinorSolfege[] = ['do', 'la'];

export interface SettingsStore {
  /** The saved settings, with defaults for anything missing or unreadable. Never throws. */
  load(): AppSettings;
  /** Change some settings and return them all. Never throws; a failed write is kept in memory. */
  save(patch: Partial<AppSettings>): AppSettings;
}

export const SETTINGS_KEY = 'isai-settings';

function oneOf<T>(options: readonly T[], value: unknown): T | undefined {
  return options.find((option) => option === value);
}

/** Turn whatever was stored (version 1 or 2) into valid settings, field by field. */
export function readSettings(raw: unknown): AppSettings {
  const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, latencyOffsets: {} };
  if (typeof raw !== 'object' || raw === null) return settings;
  const stored = raw as Record<string, unknown>;
  settings.keyboardSize = oneOf(KEYBOARD_SIZES, stored.keyboardSize) ?? settings.keyboardSize;
  if (typeof stored.lastDeviceId === 'string') settings.lastDeviceId = stored.lastDeviceId;
  // Version 1 had "play my notes" as `monitor`: off means app sound "Off".
  const sound = oneOf(APP_SOUNDS, stored.appSound);
  if (sound) settings.appSound = sound;
  else if (stored.monitor === false) settings.appSound = 'off';
  settings.velocityCurve = oneOf(CURVES, stored.velocityCurve) ?? settings.velocityCurve;
  settings.notation = oneOf(NOTATIONS, stored.notation) ?? settings.notation;
  if (typeof stored.octaves === 'boolean') settings.octaves = stored.octaves;
  settings.swaraDetail = oneOf(SWARA_DETAILS, stored.swaraDetail) ?? settings.swaraDetail;
  settings.minorSolfege = oneOf(MINOR_SOLFEGE, stored.minorSolfege) ?? settings.minorSolfege;
  if (typeof stored.lookahead === 'number' && Number.isFinite(stored.lookahead)) {
    settings.lookahead = Math.min(LOOKAHEAD_RANGE.max, Math.max(LOOKAHEAD_RANGE.min, stored.lookahead));
  }
  if (typeof stored.metronome === 'boolean') settings.metronome = stored.metronome;
  if (typeof stored.showOtherHand === 'boolean') settings.showOtherHand = stored.showOtherHand;
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
      this.storage().setItem(this.key, JSON.stringify({ version: SETTINGS_VERSION, ...next }));
    } catch {
      // Private mode or a full disk: the settings still apply until the page closes.
    }
    return next;
  }
}
