import { useState, type FormEvent } from 'react';
import { SignInError, type AuthClient, type SignInProblem } from '../api/types';

const PROBLEM: Record<SignInProblem, string> = {
  'not-invited': "That email isn't on Isai's invite list. Ask the owner to invite you, then try again.",
  'rate-limited': 'Isai has sent several links to that email already. Wait a minute, then try again.',
  network: "Isai couldn't reach the server. Check your connection and try again.",
  unknown: "Isai couldn't send the link. Try again in a moment.",
};

interface SignInProps {
  auth: AuthClient;
  /** Where the emailed link brings the learner back. */
  redirectTo: string;
  expired: boolean;
}

export function SignIn({ auth, redirectTo, expired }: SignInProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [problem, setProblem] = useState<SignInProblem | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    setState('sending');
    setProblem(null);
    try {
      await auth.sendMagicLink(address, redirectTo);
      setState('sent');
    } catch (error) {
      setProblem(error instanceof SignInError ? error.problem : 'unknown');
      setState('idle');
    }
  }

  return (
    <main className="app-main">
      <div className="app-content stack-6" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">Isai</span>
          <span className="brand-tamil" lang="ta">
            இசை
          </span>
        </div>
        {state === 'sent' ? (
          <section className="stack-4" aria-labelledby="check-title">
            <h1 className="t-page-title" id="check-title">
              Check your email
            </h1>
            <p className="t-secondary">
              Isai sent a sign-in link to <b>{email.trim()}</b>. Open it on this device to sign in. It works once,
              for an hour.
            </p>
            <div>
              <button type="button" className="btn btn-ghost" onClick={() => setState('idle')}>
                Use a different email
              </button>
            </div>
          </section>
        ) : (
          <form className="stack-4" onSubmit={(e) => void submit(e)} aria-labelledby="sign-in-title">
            <h1 className="t-page-title" id="sign-in-title">
              Sign in
            </h1>
            <p className="t-secondary">Isai is invite-only. Enter the email you were invited with.</p>
            {expired && problem === null && (
              <p className="alert" role="alert">
                That sign-in link has expired or was already used. Ask for a new one below.
              </p>
            )}
            <div className="field">
              <label className="label" htmlFor="sign-in-email">
                Email
              </label>
              <input
                className="input input-lg"
                id="sign-in-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                aria-invalid={problem === 'not-invited'}
                aria-describedby={problem ? 'sign-in-error' : undefined}
                onChange={(e) => setEmail(e.target.value)}
              />
              {problem && (
                <span className="field-error" id="sign-in-error" role="alert">
                  {PROBLEM[problem]}
                </span>
              )}
            </div>
            <div>
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={state === 'sending'}
                aria-busy={state === 'sending'}
              >
                {state === 'sending' && <span className="spinner" aria-hidden="true" />}
                {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
