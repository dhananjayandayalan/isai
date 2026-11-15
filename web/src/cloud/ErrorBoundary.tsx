import { Component, type ReactNode } from 'react';
import type { ErrorReporter } from './errorReporter';

interface Props {
  reporter: ErrorReporter;
  children: ReactNode;
}

/** A page that crashed says so (and is reported) instead of going blank. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.reporter.report('render', error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-main">
        <div className="app-content stack-6">
          <div className="state state-error" role="alert">
            <h1 className="t-state-title">Something on this page broke</h1>
            <p className="t-secondary">Isai has noted it. Reload the page to carry on.</p>
          </div>
        </div>
      </main>
    );
  }
}
