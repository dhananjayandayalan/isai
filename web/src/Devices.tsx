import { useEffect, useRef, type ReactNode } from 'react';
import { applyVelocityCurve } from './audio/velocity';
import type { MidiInput } from './midi/MidiInput';
import { KEYBOARD_RANGES, KEYBOARD_SIZES, type KeyboardSize } from './piano/layout';
import { NOTATION_OPTIONS } from './notationOptions';
import { LOOKAHEAD_RANGE, type AppSettings } from './settings/store';
import { midiToName } from './theory/pitch';

export interface DevicesProps {
  midi: MidiInput;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  /** The keyboard panel (it stays mounted across pages, so the app owns it). */
  panel: ReactNode;
  /** The latency card from P6. */
  latency: ReactNode;
  onDone: () => void;
  /** What Done goes back to, for its label. */
  doneLabel: string;
}

interface Option<T> {
  id: T;
  label: string;
}

const SOUNDS: Option<AppSettings['appSound']>[] = [
  { id: 'grand', label: 'Grand piano' },
  { id: 'electric', label: 'Electric piano' },
  { id: 'off', label: 'Off (use my keyboard)' },
];

const CURVES: Option<AppSettings['velocityCurve']>[] = [
  { id: 'soft', label: 'Soft' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

const LOOKAHEADS = Array.from({ length: LOOKAHEAD_RANGE.max - LOOKAHEAD_RANGE.min + 1 }, (_, i) => LOOKAHEAD_RANGE.min + i);

function Segmented<T extends string | number>(props: {
  label: string;
  options: Option<T>[];
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={String(option.id)}
          type="button"
          className="seg-btn"
          aria-pressed={props.value === option.id}
          onClick={() => props.onPick(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Check(props: { label: string; checked: boolean; onToggle: (checked: boolean) => void }) {
  return (
    <label className="choice">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onToggle(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

function rangeText(size: KeyboardSize): string {
  const range = KEYBOARD_RANGES[size];
  return `${midiToName(range.low)}–${midiToName(range.high)}`;
}

/**
 * The Devices screen (design/prototype/Devices.dc.html): the keyboard, the sound, latency
 * and practice defaults. Every choice is saved through the settings store. The "play any
 * key" readouts follow your keys through refs, never through React state (rule 5).
 */
export function Devices({ midi, settings, onChange, panel, latency, onDone, doneLabel }: DevicesProps) {
  const lastRef = useRef<HTMLElement>(null);
  const velocityRef = useRef<HTMLElement>(null);
  const pedalRef = useRef<HTMLElement>(null);
  // Read on every key, so the readout follows a curve change at once.
  const curveRef = useRef(settings.velocityCurve);
  useEffect(() => {
    curveRef.current = settings.velocityCurve;
  }, [settings.velocityCurve]);

  useEffect(() => {
    const recent: string[] = [];
    const offOn = midi.onNoteOn((e) => {
      recent.push(midiToName(e.note));
      if (recent.length > 3) recent.shift();
      if (lastRef.current) lastRef.current.textContent = recent.join(' ');
      // The key's velocity, and what the curve makes of it ("40 → 61").
      const shaped = applyVelocityCurve(e.velocity, curveRef.current);
      if (velocityRef.current) velocityRef.current.textContent = shaped === e.velocity ? String(e.velocity) : `${e.velocity} → ${shaped}`;
    });
    const offPedal = midi.onPedal((e) => {
      if (pedalRef.current) pedalRef.current.textContent = e.down ? 'down' : 'up';
    });
    return () => {
      offOn();
      offPedal();
    };
  }, [midi]);

  return (
    <section className="stack-6" aria-labelledby="devices-title">
      <div className="row-between">
        <div className="stack-2">
          <h1 className="t-page-title" id="devices-title">
            MIDI & keyboard
          </h1>
          <p className="t-secondary">The on-screen piano is drawn to match the keyboard you play.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {doneLabel}
        </button>
      </div>
      <div className="alert alert-quiet">
        MIDI input works in Chrome and Edge. Safari and iPhone or iPad browsers can&apos;t read a MIDI keyboard yet, so
        open Isai in a Chromium browser on this computer.
      </div>

      {panel}

      <section className="card stack-4" aria-labelledby="keyboard-title">
        <h2 className="t-card-title" id="keyboard-title">
          Keyboard
        </h2>
        <div className="stack-2">
          <span className="label">Keyboard size</span>
          <Segmented
            label="Keyboard size"
            options={KEYBOARD_SIZES.map((size) => ({ id: size, label: `${size} keys` }))}
            value={settings.keyboardSize}
            onPick={(keyboardSize) => onChange({ keyboardSize })}
          />
          <span className="t-muted">{`Range ${rangeText(settings.keyboardSize)} · arrangements stay inside it`}</span>
        </div>
        <div className="row" aria-label="Play any key to test">
          <span className="t-secondary">Play any key to test.</span>
          <span className="stack-1">
            <span className="t-overline">Last</span>
            <b className="t-mono" ref={lastRef} data-readout="last-notes" aria-live="off">
              –
            </b>
          </span>
          <span className="stack-1">
            <span className="t-overline">Velocity</span>
            <b className="t-mono" ref={velocityRef} data-readout="velocity" aria-live="off">
              –
            </b>
          </span>
          <span className="stack-1">
            <span className="t-overline">Sustain pedal</span>
            <b className="t-mono" ref={pedalRef} data-readout="pedal" aria-live="off">
              up
            </b>
          </span>
        </div>
      </section>

      <section className="card stack-4" aria-labelledby="sound-title">
        <h2 className="t-card-title" id="sound-title">
          Sound
        </h2>
        <div className="stack-2">
          <span className="label">App sound</span>
          <Segmented label="App sound" options={SOUNDS} value={settings.appSound} onPick={(appSound) => onChange({ appSound })} />
          <span className="t-muted">
            {settings.appSound === 'off'
              ? 'Your keyboard makes its own sound. Isai still plays its parts on the grand piano.'
              : 'Isai plays your notes and its own parts on this sound.'}
          </span>
        </div>
        <div className="stack-2">
          <span className="label">Velocity</span>
          <Segmented label="Velocity" options={CURVES} value={settings.velocityCurve} onPick={(velocityCurve) => onChange({ velocityCurve })} />
          <span className="t-muted">Soft makes a light touch louder; hard needs a firmer one.</span>
        </div>
      </section>

      {latency}

      <section className="card stack-4" aria-labelledby="defaults-title">
        <h2 className="t-card-title" id="defaults-title">
          Practice defaults
        </h2>
        <div className="stack-2">
          <span className="label">Note names</span>
          <Segmented label="Note names" options={[...NOTATION_OPTIONS]} value={settings.notation} onPick={(notation) => onChange({ notation })} />
        </div>
        {settings.notation === 'letters' && (
          <Check label="Show octave numbers (C4)" checked={settings.octaves} onToggle={(octaves) => onChange({ octaves })} />
        )}
        {settings.notation === 'swaras' && (
          <Segmented
            label="Swara names"
            options={[
              { id: 'short', label: 'Short (S R G)' },
              { id: 'detailed', label: 'Detailed (S R2 G3)' },
            ]}
            value={settings.swaraDetail}
            onPick={(swaraDetail) => onChange({ swaraDetail })}
          />
        )}
        {settings.notation === 'solfege' && (
          <Segmented
            label="Minor keys"
            options={[
              { id: 'do', label: 'Do-based minor' },
              { id: 'la', label: 'La-based minor' },
            ]}
            value={settings.minorSolfege}
            onPick={(minorSolfege) => onChange({ minorSolfege })}
          />
        )}
        <label className="row">
          <span className="label">Falling notes look ahead</span>
          <select
            className="select"
            aria-label="Falling notes look ahead"
            value={settings.lookahead}
            onChange={(e) => onChange({ lookahead: Number(e.target.value) })}
          >
            {LOOKAHEADS.map((seconds) => (
              <option key={seconds} value={seconds}>{`${seconds} seconds`}</option>
            ))}
          </select>
        </label>
        <Check label="Metronome click while practising" checked={settings.metronome} onToggle={(metronome) => onChange({ metronome })} />
        <Check
          label="Show the arranged hand I'm not playing"
          checked={settings.showOtherHand}
          onToggle={(showOtherHand) => onChange({ showOtherHand })}
        />
      </section>
    </section>
  );
}
