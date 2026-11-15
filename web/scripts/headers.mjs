// The production site's headers and routing (P9, ADR 0016), in the `_headers` and
// `_redirects` formats Cloudflare Pages and Netlify both read.

/** The origin of a URL, or null for a relative one (served from this site). */
function originOf(url) {
  if (!url || url.startsWith('/')) return null;
  return new URL(url).origin;
}

/**
 * Content-Security-Policy for the built app. No inline scripts and no eval (the Song
 * validator is precompiled). Tone.js runs its clock in a blob: worker.
 */
export function contentSecurityPolicy({ supabaseUrl, sampleUrls = [] }) {
  const supabase = new URL(supabaseUrl);
  const realtime = `${supabase.protocol === 'https:' ? 'wss:' : 'ws:'}//${supabase.host}`;
  const samples = [...new Set(sampleUrls.map(originOf).filter(Boolean))];
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'blob:'],
    'media-src': ["'self'", 'blob:', ...samples],
    'connect-src': ["'self'", supabase.origin, realtime, ...samples],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

export function headersFile(options) {
  return [
    '/*',
    `  Content-Security-Policy: ${contentSecurityPolicy(options)}`,
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: midi=(self), camera=(), microphone=(), geolocation=(), payment=()',
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/samples/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/index.html',
    '  Cache-Control: no-cache',
    '/',
    '  Cache-Control: no-cache',
    '',
  ].join('\n');
}

/** Every address the app routes itself (library, songs, jobs...) serves index.html. */
export function redirectsFile() {
  return '/*  /index.html  200\n';
}
