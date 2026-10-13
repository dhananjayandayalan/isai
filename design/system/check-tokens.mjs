#!/usr/bin/env node
// Isai token guard: fails when UI code hard-codes a value that must come from tokens.css.
//
// Usage (from the repo root):
//   node design/system/check-tokens.mjs            # scans web/src
//   node design/system/check-tokens.mjs some/dir   # scans another folder
//
// Flags in .ts/.tsx/.js/.jsx/.css/.html files:
//   - hex colours (#fff, #1a1a1a) and rgb()/rgba()/hsl() colours
//   - border-radius / borderRadius not written with var(--radius-…) (0 and 50% are allowed)
//   - font-family / fontFamily not written with var(--font-…)
//   - box-shadow / boxShadow not written with var(--shadow-…) or "none"
// Files under design/system/ and generated/ are skipped.
// To allow one line on purpose, end it with:  /* token-ok: reason */  or  // token-ok: reason

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const root = process.argv[2] || 'web/src';
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html']);
const skip = [/design[\\/]system/, /[\\/]generated[\\/]/, /node_modules/, /[\\/]dist[\\/]/];

const rules = [
  { name: 'hex colour', re: /(?<![&\w])#(?:[0-9a-fA-F]{3}){1,2}\b(?![-\w])/ },
  { name: 'rgb/hsl colour', re: /\b(?:rgba?|hsla?)\(/ },
  { name: 'radius without token', re: /border-?radius\s*[:=](?!\s*['"`{]?\s*(?:var\(--radius|0(?![.\d])|0px|50%|inherit))/i },
  { name: 'font without token', re: /font-?family\s*[:=](?!\s*['"`{]?\s*(?:var\(--font|inherit))/i },
  { name: 'shadow without token', re: /box-?shadow\s*[:=](?!\s*['"`{]?\s*(?:var\(--shadow|none))/i },
];

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    if (skip.some((r) => r.test(p))) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (exts.has(extname(p))) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(root, [])) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/token-ok:/.test(line)) return;
    for (const rule of rules) {
      if (rule.re.test(line)) problems.push(`${relative('.', file)}:${i + 1}  ${rule.name}  →  ${line.trim().slice(0, 120)}`);
    }
  });
}

if (problems.length) {
  console.error(`Token check failed: ${problems.length} hard-coded value(s). Use tokens from design/system/tokens.css.\n`);
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Token check passed (${root}).`);
