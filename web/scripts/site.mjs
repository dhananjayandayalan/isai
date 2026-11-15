// `pnpm build:site`: the production build (P9). Needs VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY (the anon key only; never the service-role key).
//
// 1. vite build with the version (git SHA) and the self-hosted sample paths
// 2. dist/_headers (CSP and the rest) and dist/_redirects (SPA fallback)
// 3. the samples, fetched and checked against samples.lock.json (skip with --no-samples)

import { execFileSync, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headersFile, redirectsFile } from './headers.mjs';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(web, 'dist');
const skipSamples = process.argv.includes('--no-samples');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
if (!supabaseUrl || !process.env.VITE_SUPABASE_ANON_KEY) {
  console.error('build:site: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const env = {
  ...process.env,
  VITE_APP_VERSION: process.env.VITE_APP_VERSION || gitSha(),
  // Self-hosted unless the build says otherwise.
  VITE_PIANO_SAMPLES_URL: skipSamples ? process.env.VITE_PIANO_SAMPLES_URL ?? '' : '/samples/piano/v1/',
  VITE_EPIANO_SAMPLES_URL: skipSamples ? process.env.VITE_EPIANO_SAMPLES_URL ?? '' : '/samples/epiano/v1/',
};

const build = spawnSync('pnpm exec vite build', { cwd: web, env, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

const sampleUrls = skipSamples
  ? [
      env.VITE_PIANO_SAMPLES_URL || 'https://tonejs.github.io/audio/salamander/',
      env.VITE_EPIANO_SAMPLES_URL || 'https://cdn.jsdelivr.net/',
    ]
  : [];
await writeFile(join(dist, '_headers'), headersFile({ supabaseUrl, sampleUrls }));
await writeFile(join(dist, '_redirects'), redirectsFile());
console.log(`build:site: version ${env.VITE_APP_VERSION}; wrote _headers and _redirects`);

if (!skipSamples) {
  const samples = spawnSync(`node "${join(web, 'scripts', 'samples.mjs')}" "${dist}"`, { stdio: 'inherit', shell: true });
  if (samples.status !== 0) process.exit(samples.status ?? 1);
}
