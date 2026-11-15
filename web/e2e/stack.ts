/// <reference types="node" />
// Reads the local stack's URL and keys (`supabase status`) into the environment for the
// end-to-end tests, and fails early with a clear message if the stack isn't running.

import { execSync } from 'node:child_process';

export default function setup(): void {
  let out: string;
  try {
    out = execSync('pnpm exec supabase status --workdir .. -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('The local Supabase stack is not running: start it with `pnpm db:start`.');
  }
  for (const line of out.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) process.env[`E2E_${match[1]}`] = match[2];
  }
  if (!process.env.E2E_ANON_KEY || !process.env.E2E_SERVICE_ROLE_KEY || !process.env.E2E_API_URL) {
    throw new Error('supabase status did not report API_URL, ANON_KEY and SERVICE_ROLE_KEY.');
  }
}
