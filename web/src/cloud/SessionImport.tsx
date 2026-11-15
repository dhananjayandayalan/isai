import { useEffect, useState } from 'react';
import type { AccountSessionStore } from '../api/types';
import type { NewSession, Session } from '../sessions/types';

/** This device's sessions from before signing in (IndexedDB, P6). */
export interface LocalSessions {
  all(): Promise<Session[]>;
  /** Where the answer to the offer is remembered, per account. */
  flags: () => Pick<Storage, 'getItem' | 'setItem'>;
}

function withoutId(session: Session): NewSession {
  const copy: Partial<Session> = { ...session };
  delete copy.id;
  return copy as NewSession;
}

const flagKey = (userId: string) => `isai-sessions-imported-${userId}`;

function asked(local: LocalSessions, userId: string): boolean {
  try {
    return local.flags().getItem(flagKey(userId)) !== null;
  } catch {
    return false;
  }
}

function remember(local: LocalSessions, userId: string, answer: 'imported' | 'declined'): void {
  try {
    local.flags().setItem(flagKey(userId), answer);
  } catch {
    // Without storage the offer comes back next visit; importing twice adds nothing twice.
  }
}

/** Offered once per account: add the practice kept on this device to the account. */
export function SessionImport({
  userId,
  local,
  sessions,
}: {
  userId: string;
  local: LocalSessions;
  sessions: AccountSessionStore;
}) {
  const [found, setFound] = useState<Session[] | null>(null);
  const [state, setState] = useState<'offer' | 'working' | 'done' | 'failed' | 'hidden'>('offer');

  useEffect(() => {
    if (asked(local, userId)) return undefined;
    let current = true;
    local.all().then(
      (list) => current && setFound(list),
      () => current && setFound([]),
    );
    return () => {
      current = false;
    };
  }, [local, userId]);

  if (state === 'hidden' || found === null || found.length === 0) return null;

  async function importAll() {
    setState('working');
    try {
      const records: NewSession[] = (found ?? []).map(withoutId);
      await sessions.addMany(records);
      remember(local, userId, 'imported');
      setState('done');
    } catch (error) {
      console.error('Isai: practice sessions could not be imported.', error);
      setState('failed');
    }
  }

  if (state === 'done') {
    return (
      <p className="toast toast-success" role="status">
        Your practice from this device is in your account now.
      </p>
    );
  }

  const count = found.length;
  return (
    <section className="card stack-3" aria-label="Practice on this device">
      <span className="t-card-title">
        You have {count} practice {count === 1 ? 'session' : 'sessions'} saved on this device
      </span>
      <p className="t-secondary">Add them to your account to see them on every device.</p>
      {state === 'failed' && (
        <p className="alert-quiet" role="alert">
          Isai couldn't add them just now. They're still on this device; try again.
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={state === 'working'}
          aria-busy={state === 'working'}
          onClick={() => void importAll()}
        >
          {state === 'working' ? 'Adding…' : 'Add to my account'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            remember(local, userId, 'declined');
            setState('hidden');
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
