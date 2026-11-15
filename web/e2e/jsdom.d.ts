// The one piece of jsdom the end-to-end test uses (no @types/jsdom dependency for it).
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string });
    readonly window: Window & typeof globalThis;
  }
}
