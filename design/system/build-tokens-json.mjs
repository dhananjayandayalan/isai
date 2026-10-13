#!/usr/bin/env node
// Regenerates tokens.json from tokens.css. Run after editing tokens.css:
//   node design/system/build-tokens-json.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Collect custom properties per selector block.
const blocks = [];
const re = /([^{}]+)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const selector = m[1].replace(/@media[^{]*$/, '').trim();
  const props = {};
  for (const [, name, value] of m[2].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) props[name] = value.trim();
  blocks.push({ selector, props });
}
const find = (test) => blocks.find((b) => test(b.selector))?.props ?? {};
const base = find((s) => s === ':root');
const dark = find((s) => s.includes('[data-theme="dark"]'));
const light = find((s) => s === '[data-theme="light"]');
const shadow = find((s) => s.includes('[data-theme]') && !s.includes('='));

const groupOf = {
  font: 'fontFamily', text: 'fontSize', weight: 'fontWeight', leading: 'lineHeight', tracking: 'letterSpacing',
  space: 'space', radius: 'radius', border: 'borderWidth', control: 'controlSize', icon: 'iconSize',
  dur: 'duration', ease: 'easing', focus: 'focus', piano: 'piano',
};
const groups = {};
for (const [k, v] of Object.entries(base)) {
  const g = groupOf[k.split('-')[0]] ?? 'layout';
  (groups[g] ??= {})[k] = v;
}

const out = {
  $description: 'Isai design tokens. Generated from tokens.css by build-tokens-json.mjs — do not edit by hand.',
  themes: { dark, light },
  shadow,
  ...groups,
};
writeFileSync(join(here, 'tokens.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`tokens.json written: ${Object.keys(dark).length} theme colours, ${Object.keys(base).length} base tokens.`);
