// Generate TypeScript types from schema/song.schema.json into src/generated/ (ADR 0002).
// Run with `pnpm gen:types`. Never edit the output by hand.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../../schema/song.schema.json');
const outPath = resolve(here, '../src/generated/song.ts');

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const ts = await compile(schema, 'Song', {
  additionalProperties: false,
  bannerComment:
    '/* Generated from schema/song.schema.json by `pnpm gen:types`. Do not edit by hand. */',
  cwd: dirname(schemaPath),
  style: { singleQuote: true, semi: true, printWidth: 100 },
  unreachableDefinitions: false,
});

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, ts.replace(/\r\n/g, '\n'));
console.log(`Wrote ${outPath}`);
