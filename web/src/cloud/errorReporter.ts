// Web errors to the client_errors table (ADR 0016): what kind, a scrubbed message, the
// route pattern and the build. Never names, emails, song titles or ids. At most a handful
// per page load (the database allows 30 an hour per user).

import type { ErrorKind, ErrorReport, OpsClient } from '../api/types';

/** /songs/1b2c…/practice → /songs/:id/practice. */
export function routePattern(pathname: string): string {
  return pathname
    .split('/')
    .map((part, i, parts) => (i > 0 && (parts[i - 1] === 'songs' || parts[i - 1] === 'jobs') ? ':id' : part))
    .join('/');
}

/** Drop what could identify someone or something private. */
export function scrub(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\bhttps?:\/\/\S+/g, '<url>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : 'unknown error';
}

export class ErrorReporter {
  private sent = 0;
  private readonly ops: OpsClient;
  private readonly version: string;
  private readonly pathname: () => string;
  private readonly limit: number;

  constructor(ops: OpsClient, version: string, pathname: () => string, limit = 10) {
    this.ops = ops;
    this.version = version;
    this.pathname = pathname;
    this.limit = limit;
  }

  report(kind: ErrorKind, error: unknown): void {
    if (this.sent >= this.limit) return;
    this.sent += 1;
    const report: ErrorReport = {
      kind,
      message: scrub(describe(error)),
      page: routePattern(this.pathname()),
      version: this.version,
    };
    // Reporting must never cause another error report.
    this.ops.reportError(report).catch(() => undefined);
  }

  /** Report uncaught errors and rejections; returns the way to stop. */
  install(target: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void {
    const onError = (event: ErrorEvent) => this.report('other', event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => this.report('other', event.reason);
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);
    return () => {
      target.removeEventListener('error', onError);
      target.removeEventListener('unhandledrejection', onRejection);
    };
  }
}
