import { useEffect, useRef, useState } from 'react';
import type { LoadedAudio } from './audio/types';
import type { MidiInput } from './midi/MidiInput';
import { formatMs } from './resultText';
import { runCalibration, type Measurement } from './settings/calibration';

export interface LatencyCardProps {
  midi: MidiInput;
  /** The connected keyboard, or null when there is none to calibrate. */
  deviceId: string | null;
  /** The offset in use for that keyboard, in seconds. */
  offset: number;
  onOffsetChange: (seconds: number) => void;
  /** Loads audio on first use. Must be called straight from a click. */
  ensureAudio: () => Promise<LoadedAudio | null>;
  /** True while a song is playing: the clicks need the transport to themselves. */
  busy: boolean;
  /** Told when the clicks start and stop, so the song can't start meanwhile. */
  onRunningChange: (running: boolean) => void;
}

type Phase = 'idle' | 'calibrating' | 'testing';
type Outcome = { kind: 'set'; taps: number; offset: number } | { kind: 'unclear' } | null;

/**
 * Latency: "Calibrate" (tap along to 16 clicks) and "Play any key to test". React state
 * holds which of the two is running and how the last calibration ended. Each tap's offset
 * is written through a ref (rule 5).
 */
export function LatencyCard(props: LatencyCardProps) {
  const { midi, deviceId, offset, onOffsetChange, ensureAudio, busy, onRunningChange } = props;
  const [phase, setPhase] = useState<Phase>('idle');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const cancel = useRef<(() => void) | null>(null);
  const tapRef = useRef<HTMLElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancel.current?.();
      cancel.current = null;
    };
  }, []);

  const finish = () => {
    cancel.current = null;
    setPhase('idle');
    onRunningChange(false);
  };

  async function start(mode: 'calibrate' | 'test') {
    setOutcome(null);
    const audio = await ensureAudio();
    if (!audio || !alive.current || cancel.current) return;
    setPhase(mode === 'calibrate' ? 'calibrating' : 'testing');
    onRunningChange(true);
    cancel.current = runCalibration(
      { transport: audio.transport, metronome: audio.metronome, clock: audio.clock, midi },
      {
        mode,
        userOffset: offset,
        onTap: (tap) => {
          if (tapRef.current) tapRef.current.textContent = formatMs(tap);
        },
        onDone: (measured: Measurement | null) => {
          finish();
          if (mode !== 'calibrate') return;
          if (!measured) {
            setOutcome({ kind: 'unclear' });
            return;
          }
          onOffsetChange(measured.offset);
          setOutcome({ kind: 'set', taps: measured.taps, offset: measured.offset });
        },
      },
    );
  }

  function stop() {
    cancel.current?.();
    finish();
  }

  const unavailable = deviceId === null || busy;

  return (
    <section className="card stack-4" aria-labelledby="latency-title">
      <div className="stack-2">
        <h2 className="t-card-title" id="latency-title">
          Latency
        </h2>
        <p className="t-secondary">
          Tap any key along with the clicks. Isai shifts its timing so performance scores are fair on your setup.
        </p>
      </div>
      <div className="row-between">
        <span className="stack-1">
          <span className="t-overline">Current offset</span>
          <b className="t-stat t-mono" data-readout="offset">
            {formatMs(offset)}
          </b>
        </span>
        {phase === 'idle' ? (
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={unavailable} onClick={() => void start('calibrate')}>
              Calibrate
            </button>
            <button type="button" className="btn btn-secondary" disabled={unavailable} onClick={() => void start('test')}>
              Play any key to test
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={stop}>
            Stop the clicks
          </button>
        )}
      </div>

      {deviceId === null && <p className="t-muted">Connect your keyboard above to calibrate it.</p>}
      {phase === 'calibrating' && (
        <p className="row t-secondary" role="status">
          <span className="spinner" aria-hidden="true" />
          Tap any key in time with the clicks. The first four are a lead-in.
        </p>
      )}
      {phase === 'testing' && (
        <p className="t-secondary" role="status">
          Tap along with the clicks. Your last tap:{' '}
          <b className="t-mono" ref={tapRef} data-readout="tap" aria-live="off">
            –
          </b>
        </p>
      )}
      {outcome?.kind === 'set' && (
        <p className="t-secondary" role="status">
          {`Set to ${formatMs(outcome.offset)}, from ${outcome.taps} taps.`}
        </p>
      )}
      {outcome?.kind === 'unclear' && (
        <div className="alert alert-quiet" role="alert">
          Isai couldn't hear enough steady taps. Tap once on every click, then calibrate again.
        </div>
      )}
    </section>
  );
}
