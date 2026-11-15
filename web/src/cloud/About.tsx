import { useState } from 'react';
import type { OpsClient } from '../api/types';

interface AboutProps {
  ops: OpsClient;
  version: string;
  onDeleted: () => void;
}

/** Credits, what Isai keeps about you, the version, and deleting your account. */
export function About({ ops, version, onDeleted }: AboutProps) {
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<'idle' | 'deleting' | 'failed'>('idle');

  async function remove() {
    setState('deleting');
    try {
      await ops.deleteAccount();
      onDeleted();
    } catch (error) {
      console.error('Isai: the account could not be deleted.', error);
      setState('failed');
    }
  }

  return (
    <main className="app-main">
      <div className="app-content stack-6">
        <h1 className="t-page-title">About Isai</h1>

        <section className="card stack-2" aria-labelledby="privacy-title">
          <h2 className="t-section" id="privacy-title">
            What Isai keeps
          </h2>
          <p>
            The audio you upload is deleted as soon as its analysis finishes, whether it worked or not. Anything a
            crash leaves behind is deleted within a day. Isai keeps the Song JSON and MIDI it wrote, your practice
            sessions (what you chose and how it went, not what you played note by note), your notation choices, and
            your email address for signing in.
          </p>
          <p>
            Your songs are private unless you share one with the group. Your practice history is never shared.
            Keyboard, sound and latency settings stay on each device.
          </p>
        </section>

        <section className="card stack-2" aria-labelledby="credits-title">
          <h2 className="t-section" id="credits-title">
            Credits
          </h2>
          <p>
            Piano sound: Salamander Grand Piano by Alexander Holm, CC BY 3.0. Electric piano: Wurlitzer EP200 samples
            by Greg Sullivan, CC BY 3.0. Built with Tone.js, React and Supabase.
          </p>
          <p className="t-faint t-mono">Version {version}</p>
        </section>

        <section className="card stack-3" aria-labelledby="delete-title">
          <h2 className="t-section" id="delete-title">
            Delete your account
          </h2>
          <p className="t-secondary">
            This deletes your songs, their files, your practice history and your account. Songs you shared disappear
            for everyone. It can't be undone.
          </p>
          {state === 'failed' && (
            <p className="alert" role="alert">
              Isai couldn't delete your account just now. Try again, or ask the owner.
            </p>
          )}
          {confirming ? (
            <div className="row" role="alertdialog" aria-label="Delete your account">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={state === 'deleting'}
                onClick={() => setConfirming(false)}
              >
                Keep my account
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={state === 'deleting'}
                aria-busy={state === 'deleting'}
                onClick={() => void remove()}
              >
                {state === 'deleting' ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          ) : (
            <div>
              <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
                Delete my account
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
