import { describe, expect, it } from 'vitest';
import tokens from '../../../design/system/tokens.json';

// The two hand colours must stay apart for learners with the common colour-vision
// deficiencies (P7 accessibility). Each colour is passed through a simulation of
// protanopia, deuteranopia and tritanopia (Machado, Oliveira and Fernandes 2009, full
// severity) and the WCAG contrast ratio is checked: 3:1 is the bar for graphics.

type Theme = Record<string, string>;
const themes = tokens.themes as unknown as Record<'dark' | 'light', Theme>;

const SIMULATIONS: Record<string, number[][]> = {
  none: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** A token's colour, following var(--…) references within the theme. */
function resolve(theme: Theme, name: string): string {
  let value = theme[name] ?? '';
  for (let hops = 0; hops < 5; hops++) {
    const ref = /^var\(--([\w-]+)\)$/.exec(value);
    if (!ref?.[1]) break;
    value = theme[ref[1]] ?? '';
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`${name} is not a colour: ${value}`);
  return value;
}

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance of a colour as seen through a simulation. */
function luminance(hex: string, matrix: number[][]): number {
  const rgb = [1, 3, 5].map((i) => linear(Number.parseInt(hex.slice(i, i + 2), 16)));
  const seen = matrix.map((row) => Math.min(1, Math.max(0, row.reduce((sum, m, i) => sum + m * (rgb[i] ?? 0), 0))));
  return 0.2126 * (seen[0] ?? 0) + 0.7152 * (seen[1] ?? 0) + 0.0722 * (seen[2] ?? 0);
}

function contrast(a: string, b: string, matrix: number[][]): number {
  const [hi, lo] = [luminance(a, matrix), luminance(b, matrix)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('hand colours', () => {
  for (const themeName of ['dark', 'light'] as const) {
    const theme = themes[themeName];
    for (const [simulation, matrix] of Object.entries(SIMULATIONS)) {
      it(`${themeName} theme, ${simulation}: the hands differ from each other and stand out from the stage`, () => {
        const right = resolve(theme, 'hand-right');
        const left = resolve(theme, 'hand-left');
        const stage = resolve(theme, 'surface-sunken');
        expect(contrast(right, left, matrix)).toBeGreaterThanOrEqual(3);
        for (const hand of ['right', 'left'] as const) {
          // A bar is its fill with a border: one of the two must stand out from the stage.
          const fill = resolve(theme, `hand-${hand}`);
          const border = resolve(theme, `hand-${hand}-border`);
          const best = Math.max(contrast(fill, stage, matrix), contrast(border, stage, matrix));
          expect(best, `${hand} hand on the stage`).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }

  it('follows var() references and rejects a token that is not a colour', () => {
    expect(resolve({ a: 'var(--b)', b: '#123456' }, 'a')).toBe('#123456');
    expect(() => resolve({ a: 'red' }, 'a')).toThrow('not a colour');
  });
});
