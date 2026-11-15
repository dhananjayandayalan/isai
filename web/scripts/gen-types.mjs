// Generate code from schema/song.schema.json into src/generated/ (ADR 0002):
// - song.ts: TypeScript types (json-schema-to-typescript)
// - song.validate.js + .d.ts: the Song validator, precompiled with ajv standalone so the
//   app never compiles code at runtime (no `new Function`, works under a strict CSP).
// Run with `pnpm gen:types`. Never edit the output by hand.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const require = createRequire(import.meta.url);
const { _ } = require('ajv');
const Ajv2020 = require('ajv/dist/2020').default;
const standaloneCode = require('ajv/dist/standalone').default;
const addFormats = require('ajv-formats').default;
const ucs2length = require('ajv/dist/runtime/ucs2length').default;

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../../schema/song.schema.json');
const outDir = resolve(here, '../src/generated');
const BANNER = 'Generated from schema/song.schema.json by `pnpm gen:types`. Do not edit by hand.';

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
await mkdir(outDir, { recursive: true });

async function write(name, text) {
  const path = resolve(outDir, name);
  await writeFile(path, text.replace(/\r\n/g, '\n'));
  console.log(`Wrote ${path}`);
}

// Types
const ts = await compile(schema, 'Song', {
  additionalProperties: false,
  bannerComment: `/* ${BANNER} */`,
  cwd: dirname(schemaPath),
  style: { singleQuote: true, semi: true, printWidth: 100 },
  unreachableDefinitions: false,
});
await write('song.ts', ts);

// Validator. ajv's ESM standalone output still uses `require()` for runtime helpers, and
// CJS default-export interop differs between Node (tests) and Vite (build). So each
// helper is replaced explicitly, and any helper we don't know about fails generation.
const ajv = new Ajv2020({
  allErrors: true,
  code: { source: true, esm: true, lines: true, formats: _`require("ajv-formats/dist/formats").fullFormats` },
});
addFormats(ajv);
let code = standaloneCode(ajv, ajv.compile(schema));

const imports = new Set();
const helpers = new Set();
const rewrites = [
  {
    // A named export resolves the same way in Node and Vite.
    from: 'require("ajv-formats/dist/formats").fullFormats',
    to: 'fullFormats',
    add: () => imports.add('import { fullFormats } from "ajv-formats/dist/formats";'),
  },
  {
    // A small pure function with no closure, so its source can be inlined.
    from: 'require("ajv/dist/runtime/ucs2length").default',
    to: 'ucs2length',
    add: () => helpers.add(`const ucs2length = ${ucs2length.toString()};`),
  },
];
for (const r of rewrites) {
  if (code.includes(r.from)) {
    code = code.split(r.from).join(r.to);
    r.add();
  }
}
const leftover = code.match(/require\([^)]*\)/g);
if (leftover) {
  throw new Error(`Unhandled ajv runtime helper(s): ${[...new Set(leftover)].join(', ')}. ` +
    'Add a rewrite in scripts/gen-types.mjs.');
}
if (/new Function|\beval\(/.test(code)) throw new Error('Precompiled validator uses eval');

code = code.replace(/^"use strict";\n?/, '');
await write(
  'song.validate.js',
  [`/* eslint-disable */\n/* ${BANNER} */`, ...imports, ...helpers, code].join('\n') + '\n',
);
await write(
  'song.validate.d.ts',
  `/* ${BANNER} */
import type { ErrorObject } from 'ajv';
import type { Song } from './song';

export interface SongValidateFunction {
  (data: unknown): data is Song;
  errors?: ErrorObject[] | null;
}

export declare const validate: SongValidateFunction;
export default validate;
`,
);
