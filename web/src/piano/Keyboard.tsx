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

function rootColors() {
  return readPianoColors(getComputedStyle(document.documentElement));
}

/**
 * The on-screen piano. React renders the canvas once; a PianoController draws every frame
 * (rule 5). Props change only when the song, size or MIDI input changes, never per note.
 */
export function Keyboard({ index, source, range, midi, onFrame, frames }: KeyboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<PianoController | null>(null);
  const onFrameRef = useRef(onFrame);
  const rangeRef = useRef(range);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const options = {
      canvas,
      colors: rootColors(),
      range: rangeRef.current,
      pixelRatio: window.devicePixelRatio || 1,
      onFrame: (seconds: number) => onFrameRef.current?.(seconds),
    };
    const controller = new PianoController(frames ? { ...options, frames } : options);
    controllerRef.current = controller;
    controller.start();

    // Pause drawing while the tab is hidden.
    const onVisibility = () => {
      if (document.hidden) controller.stop();
      else controller.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Hand colours follow the theme (STYLE_GUIDE §4 Music): re-read on a theme change.
    const recolour = () => controller.setColors(rootColors());
    const themeObserver = new MutationObserver(recolour);
    themeObserver.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    const scheme =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    scheme?.addEventListener('change', recolour);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      themeObserver.disconnect();
      scheme?.removeEventListener('change', recolour);
      controller.dispose();
      controllerRef.current = null;
    };
  }, [frames]);

  useEffect(() => {
    controllerRef.current?.setSong(index, source);
  }, [index, source]);

  useEffect(() => {
    rangeRef.current = range;
    controllerRef.current?.setRange(range);
  }, [range]);

  useEffect(() => {
    controllerRef.current?.attachMidi(midi);
  }, [midi]);

  return (
    <div className="piano">
      <canvas ref={canvasRef} className="piano-canvas" role="img" aria-label="Piano keyboard" />
    </div>
  );
}
