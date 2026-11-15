import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, headersFile, redirectsFile } from '../scripts/headers.mjs';
import { epianoUrls, salamanderUrls } from './audio/tone';

describe('production headers', () => {
  const csp = contentSecurityPolicy({ supabaseUrl: 'https://abc.supabase.co' });

  it('allows only this site for scripts, with no eval or inline code', () => {
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/unsafe-(eval|inline)/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('lets the app reach its Supabase project, including Realtime', () => {
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
    expect(contentSecurityPolicy({ supabaseUrl: 'http://127.0.0.1:54321' })).toContain('ws://127.0.0.1:54321');
  });

  it('adds sample hosts only when samples are not self-hosted', () => {
    expect(csp).not.toContain('tonejs.github.io');
    const remote = contentSecurityPolicy({
      supabaseUrl: 'https://abc.supabase.co',
      sampleUrls: ['https://tonejs.github.io/audio/salamander/', '/samples/epiano/v1/'],
    });
    const connect = remote.split('; ').find((d) => d.startsWith('connect-src')) ?? '';
    expect(connect).toContain('https://tonejs.github.io');
  });

  it('sets the security headers, caching and the SPA fallback', () => {
    const file = headersFile({ supabaseUrl: 'https://abc.supabase.co' });
    expect(file).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    expect(file).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(file).toContain('Permissions-Policy: midi=(self)');
    expect(file).toContain('X-Content-Type-Options: nosniff');
    expect(file).toMatch(/\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
    expect(file).toMatch(/\/index\.html\n {2}Cache-Control: no-cache/);
    expect(redirectsFile()).toBe('/*  /index.html  200\n');
  });

  it('has no inline script in index.html for the CSP to block', async () => {
    const html = await readFile('index.html', 'utf8');
    expect(html).not.toMatch(/<script>(?!\s*<\/script>)/);
    expect(html).toContain('<script src="/theme-init.js"></script>');
  });
});

describe('self-hosted samples', () => {
  it('locks exactly the files the instruments ask for', async () => {
    const lock = JSON.parse(await readFile('samples.lock.json', 'utf8')) as {
      sets: Record<string, { files: Record<string, { size: number; sha256: string }>; licence: string }>;
    };
    expect(Object.keys(lock.sets.piano?.files ?? {}).sort()).toEqual(Object.values(salamanderUrls()).sort());
    expect(Object.keys(lock.sets.epiano?.files ?? {}).sort()).toEqual(Object.values(epianoUrls()).sort());
    for (const set of Object.values(lock.sets)) {
      expect(set.licence).toContain('CC BY 3.0');
      for (const file of Object.values(set.files)) expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
