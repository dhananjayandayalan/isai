import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Probes for the lint guards behind CLAUDE.md rules 4 (MIDI only through src/midi/) and
// 6 (no wall clock or timers). Each probe is linted as if it lived at the given path,
// relative to web/ (ESLint's cwd when `pnpm test` runs).

const eslint = new ESLint();
const GUARDS = new Set(['no-restricted-syntax', 'no-restricted-globals', 'no-restricted-imports']);

async function guardHits(code: string, file: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath: file });
  return (result?.messages ?? []).filter((m) => m.ruleId && GUARDS.has(m.ruleId)).length;
}

const MIDI_PROBES = [
  'navigator.requestMIDIAccess();',
  'window.navigator.requestMIDIAccess();',
  "navigator['requestMIDIAccess']();",
  'export const { requestMIDIAccess } = navigator;',
  "export { WebMidi } from 'webmidi';",
  "export * from 'webmidi/dist/esm/webmidi.esm.js';",
];

const CLOCK_PROBES = [
  'export const t = Date.now();',
  'export const t = performance.now();',
  'export const t = window.performance.now();',
  'export const t = globalThis.performance.now();',
  'setTimeout(() => undefined, 10);',
  'setInterval(() => undefined, 10);',
  'window.setTimeout(() => undefined, 10);',
  'globalThis.setInterval(() => undefined, 10);',
  "window['setTimeout'](() => undefined, 10);",
  'export const { setTimeout: later } = window;',
];

describe('rule 4 guard: Web MIDI only in src/midi/', () => {
  it.each(MIDI_PROBES)('flags %s outside src/midi/', async (code) => {
    expect(await guardHits(code, 'src/engine/probe.ts')).toBeGreaterThan(0);
  });

  it.each(MIDI_PROBES)('allows %s inside src/midi/', async (code) => {
    expect(await guardHits(code, 'src/midi/probe.ts')).toBe(0);
  });
});

describe('rule 6 guard: no wall clock or timers in app code', () => {
  it.each(CLOCK_PROBES)('flags %s in src/', async (code) => {
    expect(await guardHits(code, 'src/piano/probe.ts')).toBeGreaterThan(0);
  });

  it.each(CLOCK_PROBES)('flags %s in src/midi/ too', async (code) => {
    expect(await guardHits(code, 'src/midi/probe.ts')).toBeGreaterThan(0);
  });

  it.each(CLOCK_PROBES)('allows %s in tests', async (code) => {
    expect(await guardHits(code, 'src/piano/probe.test.ts')).toBe(0);
  });

  it('allows requestAnimationFrame, which rule 5 requires', async () => {
    expect(await guardHits('requestAnimationFrame(() => undefined);', 'src/piano/probe.ts')).toBe(0);
  });
});
