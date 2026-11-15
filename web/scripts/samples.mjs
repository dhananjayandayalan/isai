// Self-hosted instrument samples (P9, ADR 0004 follow-up).
//
//   node scripts/samples.mjs --lock      record today's upstream files in samples.lock.json
//   node scripts/samples.mjs [outDir]    fetch every file, check it against the lock, and write
//                                        them to <outDir>/samples/<set>/v1/ (default dist/)
//
// The audio never goes into git: only the lock (names, sizes, sha256) does. The licence
// note travels with the files.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCK = join(here, '..', 'samples.lock.json');
const TONE = join(here, '..', 'src', 'audio', 'tone.ts');

/** The file names the app asks for, read from src/audio/tone.ts so the two can't drift. */
export async function wantedFiles() {
  const source = await readFile(TONE, 'utf8');
  const piano = ['A0.mp3', 'C8.mp3'];
  for (let octave = 1; octave <= 7; octave++) {
    piano.push(`C${octave}.mp3`, `Ds${octave}.mp3`, `Fs${octave}.mp3`, `A${octave}.mp3`);
  }
  const block = source.slice(source.indexOf('export function epianoUrls'), source.indexOf('export function salamanderUrls'));
  const epiano = [...block.matchAll(/'([^']+\.m4a)'/g)].map((m) => m[1]);
  const base = (name) => {
    const m = new RegExp(`export const ${name} =\\s*'([^']+)'`).exec(source);
    if (!m) throw new Error(`${name} not found in tone.ts`);
    return m[1];
  };
  return [
    {
      set: 'piano',
      from: base('DEFAULT_SAMPLES_URL'),
      files: piano.sort(),
      licence: 'Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0 (https://archive.org/details/SalamanderGrandPianoV3), via Tone.js.',
    },
    {
      set: 'epiano',
      from: base('DEFAULT_EPIANO_URL'),
      files: epiano.sort(),
      licence: 'Wurlitzer EP200 samples by Greg Sullivan, CC BY 3.0 (https://github.com/sfzinstruments/GregSullivan.E-Pianos).',
    },
  ];
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function lock() {
  const sets = await wantedFiles();
  const out = { version: 1, sets: {} };
  for (const { set, from, files, licence } of sets) {
    const entries = {};
    for (const file of files) {
      const bytes = await fetchBytes(from + file);
      entries[file] = { size: bytes.length, sha256: sha256(bytes) };
    }
    out.sets[set] = { from, path: `samples/${set}/v1/`, licence, files: entries };
  }
  await writeFile(LOCK, JSON.stringify(out, null, 2) + '\n');
  console.log(`Locked ${sets.map((s) => `${s.files.length} ${s.set}`).join(' and ')} files in samples.lock.json`);
}

async function install(outDir) {
  const locked = JSON.parse(await readFile(LOCK, 'utf8'));
  for (const [set, entry] of Object.entries(locked.sets)) {
    const dest = join(outDir, entry.path);
    await mkdir(dest, { recursive: true });
    for (const [file, { size, sha256: expected }] of Object.entries(entry.files)) {
      const bytes = await fetchBytes(entry.from + file);
      if (bytes.length !== size || sha256(bytes) !== expected) {
        throw new Error(`${set}/${file} doesn't match samples.lock.json: refusing to deploy it`);
      }
      await writeFile(join(dest, file), bytes);
    }
    await writeFile(join(dest, 'LICENCE.txt'), entry.licence + '\n');
    console.log(`${set}: ${Object.keys(entry.files).length} files checked into ${entry.path}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  (arg === '--lock' ? lock() : install(arg ?? join(here, '..', 'dist'))).catch((error) => {
    console.error(`samples: ${error.message}`);
    process.exit(1);
  });
}
