import { useEffect, useRef } from 'react';
import type { NoteIndex } from '../engine/activeNotes';
import type { MidiInput } from '../midi/MidiInput';
import { readPianoColors } from './KeyboardRenderer';
import type { KeyRange } from './layout';
import { PianoController, type FrameScheduler, type PositionSource } from './PianoController';

export interface KeyboardProps {
  index: NoteIndex | null;
  source: PositionSource | null;
  range: KeyRange;
  midi: MidiInput | null;
  /** Called every frame with the song position; update readouts through refs. */
  onFrame?: (seconds: number) => void;
  /** For tests; defaults to requestAnimationFrame. */
  frames?: FrameScheduler;
}

/** Piano tokens never theme (STYLE_GUIDE rule 6), so reading them once is enough. */
function rootColors() {
  return readPianoColors(getComputedStyle(document.documentElement));
}

/**
 * The on-screen piano. React renders the canvas once; a PianoController draws every frame
 * (rule 5). Props change only when the song, size or MIDI input changes, never per note.
 */
export function Keyboard(props: KeyboardProps) {
  const { index, source, range, midi, onFrame, frames } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<PianoController | null>(null);
  // The latest props, so a controller created later (a new `frames`) starts from all of
  // them, not only the ones whose own effect happens to run again.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const now = latest.current;
    const options = {
      canvas,
      colors: rootColors(),
      range: now.range,
      pixelRatio: window.devicePixelRatio || 1,
      onFrame: (seconds: number) => latest.current.onFrame?.(seconds),
    };
    const controller = new PianoController(frames ? { ...options, frames } : options);
    controller.setSong(now.index, now.source);
    controller.attachMidi(now.midi);
    controllerRef.current = controller;
    if (!document.hidden) controller.start();

    // Pause drawing while the tab is hidden.
    const onVisibility = () => {
      if (document.hidden) controller.stop();
      else controller.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      controller.dispose();
      controllerRef.current = null;
    };
  }, [frames]);

  useEffect(() => {
    controllerRef.current?.setSong(index, source);
  }, [index, source]);

  useEffect(() => {
    controllerRef.current?.setRange(range);
  }, [range]);

  useEffect(() => {
    controllerRef.current?.attachMidi(midi);
  }, [midi]);

  // `onFrame` is read through `latest` every frame, so it needs no effect of its own.
  void onFrame;

  return (
    <div className="piano">
      <canvas ref={canvasRef} className="piano-canvas" role="img" aria-label="Piano keyboard" />
    </div>
  );
}
