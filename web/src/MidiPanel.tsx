import { useState } from 'react';
import type { MidiDevice, MidiInput } from './midi/MidiInput';
import { MidiError } from './midi/WebMidiInput';

type ErrorKind = MidiError['kind'];

type Status =
  | { kind: 'idle' }
  | { kind: 'scanning'; firstTime: boolean }
  | { kind: 'ready' }
  | { kind: 'error'; error: ErrorKind; device?: string };

export interface MidiPanelProps {
  midi: MidiInput;
  /** Called when you pick a keyboard, so audio can start in the same click. */
  onConnect: () => void;
  /** Called with the connected device's id, or null once nothing is connected. */
  onConnectionChange?: (deviceId: string | null) => void;
  monitor: boolean;
  onMonitorChange: (monitor: boolean) => void;
}

const ERROR_TEXT: Record<ErrorKind, { title: string; next: string; retry: string | null }> = {
  unsupported: {
    title: "This browser can't use MIDI keyboards",
    next: 'Open Isai in Chrome, Edge or Firefox to play along. You can still listen to songs here.',
    retry: null,
  },
  blocked: {
    title: 'MIDI is blocked for this site',
    next: "Allow MIDI devices in your browser's site settings, then try again.",
    retry: 'Try again',
  },
  busy: {
    title: 'Your keyboard is in use by another app',
    next: 'Close the other app that uses your keyboard, then connect again.',
    retry: 'Scan again',
  },
  'unknown-device': {
    title: 'That keyboard is no longer connected',
    next: 'Plug it back in, then scan again.',
    retry: 'Scan again',
  },
  failed: {
    title: "We couldn't start MIDI",
    next: 'Unplug your keyboard, plug it back in, then try again.',
    retry: 'Try again',
  },
};

function errorKind(e: unknown): ErrorKind {
  return e instanceof MidiError ? e.kind : 'failed';
}

/**
 * Find and connect a MIDI keyboard. React state holds only the device list and status;
 * notes never pass through here (rule 5).
 */
export function MidiPanel(props: MidiPanelProps) {
  const { midi, onConnect, onConnectionChange, monitor, onMonitorChange } = props;
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [connected, setConnectedId] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const setConnected = (deviceId: string | null) => {
    setConnectedId(deviceId);
    onConnectionChange?.(deviceId);
  };

  async function scan() {
    setStatus({ kind: 'scanning', firstTime: !scanned });
    try {
      const list = await midi.listDevices();
      setDevices(list);
      setScanned(true);
      if (connected && !list.some((d) => d.id === connected)) {
        // Unplugged since we connected: drop the stale connection. Closing a port that
        // is already gone can fail; the connection is dropped either way.
        setConnected(null);
        await midi.disconnect().catch(() => undefined);
      }
      setStatus({ kind: 'ready' });
    } catch (e) {
      setStatus({ kind: 'error', error: errorKind(e) });
    }
  }

  async function connect(device: MidiDevice) {
    onConnect();
    try {
      await midi.connect(device.id);
      setConnected(device.id);
      setStatus({ kind: 'ready' });
    } catch (e) {
      setConnected(null);
      setStatus({ kind: 'error', error: errorKind(e), device: device.name });
    }
  }

  async function disconnect() {
    try {
      await midi.disconnect();
      setConnected(null);
    } catch (e) {
      // The port didn't close cleanly. Either way we are no longer listening to it.
      setConnected(null);
      setStatus({ kind: 'error', error: errorKind(e) });
    }
  }

  return (
    <section className="card stack-4" aria-labelledby="midi-title">
      <div className="row-between">
        <h2 className="t-card-title" id="midi-title">
          Your keyboard
        </h2>
        <div className="seg" role="group" aria-label="Play my notes through Isai">
          <button
            type="button"
            className="seg-btn"
            aria-pressed={monitor}
            onClick={() => onMonitorChange(true)}
          >
            Isai plays my notes
          </button>
          <button
            type="button"
            className="seg-btn"
            aria-pressed={!monitor}
            onClick={() => onMonitorChange(false)}
          >
            My keyboard's sound
          </button>
        </div>
      </div>
      <MidiBody
        status={status}
        devices={devices}
        connected={connected}
        onScan={() => void scan()}
        onConnect={(d) => void connect(d)}
        onDisconnect={() => void disconnect()}
      />
    </section>
  );
}

interface MidiBodyProps {
  status: Status;
  devices: MidiDevice[];
  connected: string | null;
  onScan: () => void;
  onConnect: (device: MidiDevice) => void;
  onDisconnect: () => void;
}

function MidiBody({ status, devices, connected, onScan, onConnect, onDisconnect }: MidiBodyProps) {
  if (status.kind === 'idle') {
    return (
      <div className="stack-3">
        <p className="t-secondary">Connect a MIDI keyboard to see your notes on the piano.</p>
        <div>
          <button type="button" className="btn btn-primary" onClick={onScan}>
            Find my keyboard
          </button>
        </div>
      </div>
    );
  }
  if (status.kind === 'scanning') {
    return (
      <p className="row t-secondary" role="status">
        <span className="spinner" aria-hidden="true" />
        {status.firstTime ? 'Waiting for permission to use MIDI…' : 'Looking for keyboards…'}
      </p>
    );
  }
  if (status.kind === 'error') {
    const text = ERROR_TEXT[status.error];
    return (
      <div className="state state-error" role="alert">
        <h3 className="t-section">
          {status.error === 'busy' && status.device ? `${status.device} is in use by another app` : text.title}
        </h3>
        <p className="t-secondary">{text.next}</p>
        {text.retry && (
          <button type="button" className="btn btn-secondary" onClick={onScan}>
            {text.retry}
          </button>
        )}
      </div>
    );
  }
  if (devices.length === 0) {
    return (
      <div className="state state-empty">
        <h3 className="t-section">No keyboards found</h3>
        <p className="t-secondary">Plug in your keyboard over USB, then scan again.</p>
        <button type="button" className="btn btn-secondary" onClick={onScan}>
          Scan again
        </button>
      </div>
    );
  }
  return (
    <div className="stack-3">
      <div className="stack-2" role="radiogroup" aria-label="MIDI keyboards">
        {devices.map((device) => (
          <label className="choice" key={device.id}>
            <input
              type="radio"
              name="midi-device"
              checked={connected === device.id}
              onChange={() => onConnect(device)}
            />
            <span className="stack-1">
              <b>{device.name}</b>
              <span className="t-muted">
                {connected === device.id
                  ? 'Connected · play a key to see it light up'
                  : (device.manufacturer ?? 'MIDI keyboard')}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={onScan}>
          Scan again
        </button>
        {connected && (
          <button type="button" className="btn btn-ghost" onClick={onDisconnect}>
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
