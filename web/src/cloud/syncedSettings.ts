// Signed in, notation choices follow the learner to every device (profiles.preferences);
// everything else (keyboard, latency, sound) stays on this device, where it was measured.

import type { PreferencesStore, SyncedPreferences } from '../api/types';
import type { AppSettings, SettingsStore } from '../settings/store';

const SYNCED = ['notation', 'octaves', 'swaraDetail', 'minorSolfege'] as const;

function pick(source: Partial<AppSettings> | SyncedPreferences): Partial<AppSettings> {
  const out: Record<string, unknown> = {};
  for (const key of SYNCED) {
    if (key in source && source[key] !== undefined) out[key] = source[key];
  }
  return out as Partial<AppSettings>;
}

export class SyncedSettingsStore implements SettingsStore {
  private readonly local: SettingsStore;
  private readonly remote: PreferencesStore;

  constructor(local: SettingsStore, remote: PreferencesStore) {
    this.local = local;
    this.remote = remote;
  }

  load(): AppSettings {
    return this.local.load();
  }

  save(patch: Partial<AppSettings>): AppSettings {
    const next = this.local.save(patch);
    const synced = pick(patch);
    if (Object.keys(synced).length > 0) {
      this.remote.save(synced as SyncedPreferences).catch((error: unknown) => {
        // Still saved on this device; the next change tries again.
        console.error('Isai: notation preferences could not be saved to your account.', error);
      });
    }
    return next;
  }

  /** Take the account's notation choices onto this device (at sign-in). */
  async pull(): Promise<AppSettings> {
    const prefs = await this.remote.load();
    // readSettings() in the local store drops anything invalid.
    return this.local.save(pick(prefs));
  }
}
