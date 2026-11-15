// Colours and fonts for the stage above the keyboard (falling notes, the staff, the chord
// lane). Unlike the piano keys these follow the theme, so they are read again when it
// changes. Text sizes follow the learner's font size: the tokens are in px for a 16 px
// root, and they are scaled by the root font size the browser actually uses.

export interface StageColors {
  background: string;
  /** Note bars and noteheads, per hand, with their border and the text on them. */
  right: string;
  rightBorder: string;
  onRight: string;
  left: string;
  leftBorder: string;
  onLeft: string;
  /** Beat and bar lines. */
  grid: string;
  gridStrong: string;
  /** Staff lines, clefs, key signature, chord names. */
  ink: string;
  inkMuted: string;
  /** CSS font for names on notes and in the chord lane. */
  noteFont: string;
  laneFont: string;
  /** CSS font size of `noteFont` in px, for fitting text. */
  noteSize: number;
  laneSize: number;
}

/** The root font size the tokens were written for. */
const TOKEN_ROOT = 16;

/** Read the stage tokens. `rootFontSize` is the document's computed font size in px. */
export function readStageColors(
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
  rootFontSize: number = TOKEN_ROOT,
): StageColors {
  const v = (name: string) => style.getPropertyValue(name).trim();
  const scale = Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize / TOKEN_ROOT : 1;
  const px = (name: string, fallback: number) => Math.round((Number.parseFloat(v(name)) || fallback) * scale);
  const noteSize = px('--text-2xs', 11);
  const laneSize = px('--text-sm', 13);
  const mono = v('--font-mono') || 'monospace';
  return {
    background: v('--surface-sunken'),
    right: v('--hand-right'),
    rightBorder: v('--hand-right-border'),
    onRight: v('--on-hand-right'),
    left: v('--hand-left'),
    leftBorder: v('--hand-left-border'),
    onLeft: v('--on-hand-left'),
    grid: v('--grid'),
    gridStrong: v('--grid-strong'),
    ink: v('--text-2'),
    inkMuted: v('--text-3'),
    noteFont: `${v('--weight-medium') || 500} ${noteSize}px ${mono}`,
    laneFont: `${v('--weight-semibold') || 600} ${laneSize}px ${mono}`,
    noteSize,
    laneSize,
  };
}
