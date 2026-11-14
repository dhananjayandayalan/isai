import { useEffect, useRef } from 'react';
import type { NoteIndex } from '../engine/activeNotes';
import type { PracticeView } from '../engine/practice/view';
import type { MidiInput } from '../midi/MidiInput';
import { readStageColors } from '../notation/stage';
import type { NoteLabel } from '../theory/labels';
import { readPianoColors } from './KeyboardRenderer';
import type { KeyRange } from './layout';
import { PianoController, type FrameScheduler, type PositionSource, type StageSetup } from './PianoController';

/** What the stage shows; the colours and reduced motion come from the page. */
export type StageProps = Omit<StageSetup, 'colors' | 'reducedMotion'>;

export interface KeyboardProps {
  index: NoteIndex | null;
  source: PositionSource | null;
  range: KeyRange;
  midi: MidiInput | null;
  /** The practice engine's per-key arrays, read every frame; null when there is none. */
  practice?: PracticeView | null;
  /** Names for every key in the chosen notation; null for C4-style C keys. */
  names?: readonly NoteLabel[] | null;
  /** Falling notes or the staff above the keys; null for none. */
  stage?: StageProps | null;
  /** Called every frame with the song position; update readouts through refs. */
  onFrame?: (seconds: number) => void;
  /** For tests; defaults to requestAnimationFrame. */
  frames?: FrameScheduler;
}

/** Piano tokens never theme (STYLE_GUIDE rule 6), so reading them once is enough. */
function rootColors() {
  return readPianoColors(getComputedStyle(document.documentElement));
}

/** Stage tokens follow the theme and the learner's font size: read them when either may change. */
function stageColors() {
  const style = getComputedStyle(document.documentElement);
  return readStageColors(style, Number.parseFloat(style.fontSize));
}

function media(query: string): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

/**
 * The on-screen piano and the stage above it. React renders the canvases once; a
 * PianoController draws every frame (rule 5). Props change only when the song, size,
 * MIDI input or a display setting changes, never per note.
 */
export function Keyboard(props: KeyboardProps) {
  const { index, source, range, midi, practice = null, names = null, stage = null, onFrame, frames } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<PianoController | null>(null);
  // The latest props, so a controller created later (a new `frames`) starts from all of
  // them, not only the ones whose own effect happens to run again.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  /** Re-applies the stage with fresh colours and motion preference. */
  const applyStage = useRef(() => undefined as void);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const now = latest.current;
    const options = {
      canvas,
      ...(stageRef.current ? { stageCanvas: stageRef.current } : {}),
      colors: rootColors(),
      range: now.range,
      pixelRatio: window.devicePixelRatio || 1,
      onFrame: (seconds: number) => latest.current.onFrame?.(seconds),
    };
    const controller = new PianoController(frames ? { ...options, frames } : options);
    controller.setSong(now.index, now.source);
    controller.setPractice(now.practice ?? null);
    controller.setNames(now.names ?? null);
    controller.attachMidi(now.midi);
    controllerRef.current = controller;

    const motion = media('(prefers-reduced-motion: reduce)');
    const scheme = media('(prefers-color-scheme: dark)');
    applyStage.current = () => {
      const wanted = latest.current.stage;
      controller.setStage(wanted ? { ...wanted, colors: stageColors(), reducedMotion: motion?.matches ?? false } : null);
    };
    applyStage.current();
    const refresh = () => applyStage.current();
    motion?.addEventListener('change', refresh);
    scheme?.addEventListener('change', refresh);
    if (!document.hidden) controller.start();

    // Pause drawing while the tab is hidden.
    const onVisibility = () => {
      if (document.hidden) controller.stop();
      else controller.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      motion?.removeEventListener('change', refresh);
      scheme?.removeEventListener('change', refresh);
      controller.dispose();
      controllerRef.current = null;
    };
  }, [frames]);

  useEffect(() => {
    controllerRef.current?.setSong(index, source);
  }, [index, source]);

  useEffect(() => {
    controllerRef.current?.setPractice(practice);
  }, [practice]);

  useEffect(() => {
    controllerRef.current?.setRange(range);
  }, [range]);

  useEffect(() => {
    controllerRef.current?.attachMidi(midi);
  }, [midi]);

  useEffect(() => {
    controllerRef.current?.setNames(names);
  }, [names]);

  useEffect(() => {
    applyStage.current();
  }, [stage]);

  // `onFrame` is read through `latest` every frame, so it needs no effect of its own.
  void onFrame;

  return (
    <div>
      {/* Always mounted (the controller holds its canvas); hidden when there is no stage. */}
      <div className="stage" hidden={!stage}>
        <canvas
          ref={stageRef}
          className="stage-canvas"
          role="img"
          aria-label={stage?.mode === 'staff' ? 'Scrolling staff' : 'Falling notes'}
        />
      </div>
      <div className="piano">
        <canvas ref={canvasRef} className="piano-canvas" role="img" aria-label="Piano keyboard" />
      </div>
    </div>
  );
}
