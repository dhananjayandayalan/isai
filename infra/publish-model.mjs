#!/usr/bin/env node
// Publishes one immutable model file to R2 and records it in models/manifest.json (ADR-017).
// Usage: node infra/publish-model.mjs --env staging|production --name beat-this --version 0.1.0 --file path/to/model.onnx
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EDGE = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "edge");
const BUCKETS = { staging: "isai-models-staging", production: "isai-models" };
const SEGMENT = /^[A-Za-z0-9._-]{1,64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const env = arg("env");
const name = arg("name");
const version = arg("version");
const file = arg("file");
if (!BUCKETS[env] || !SEGMENT.test(name ?? "") || !SEMVER.test(version ?? "") || !file) {
  console.error("Usage: node infra/publish-model.mjs --env staging|production --name <name> --version <x.y.z> --file <path>");
  process.exit(1);
}

const bucket = BUCKETS[env];
const fileName = basename(file);
const key = `models/${name}/${version}/${fileName}`;
const tmp = mkdtempSync(join(tmpdir(), "isai-model-"));

const wrangler = (cmd, allowFail = false) => {
  try {
    return execSync(`pnpm exec wrangler ${cmd}`, { cwd: EDGE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    if (allowFail) return null;
    console.error(`wrangler ${cmd} failed:\n${err.stdout ?? ""}${err.stderr ?? ""}`);
    process.exit(1);
  }
};

// Versions are immutable: refuse to overwrite an existing object.
if (wrangler(`r2 object get "${bucket}/${key}" --remote --file "${join(tmp, "existing")}"`, true) !== null) {
  console.error(`${key} already exists in ${bucket}. Publish a new version instead.`);
  process.exit(1);
}

const bytes = readFileSync(file);
const sha256 = createHash("sha256").update(bytes).digest("hex");
wrangler(`r2 object put "${bucket}/${key}" --remote --file "${file}" --content-type application/octet-stream`);
console.log(`uploaded ${key} (${bytes.length} bytes, sha256 ${sha256})`);

const manifestPath = join(tmp, "manifest.json");
const manifest =
  wrangler(`r2 object get "${bucket}/models/manifest.json" --remote --file "${manifestPath}"`, true) !== null
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : { schema: 1, models: [] };

manifest.models = manifest.models.filter((m) => !(m.name === name && m.version === version && m.file === fileName));
manifest.models.push({ name, version, file: fileName, path: `/models/${name}/${version}/${fileName}`, sha256, bytes: bytes.length });
manifest.models.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
manifest.updated_at = new Date().toISOString();

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
wrangler(`r2 object put "${bucket}/models/manifest.json" --remote --file "${manifestPath}" --content-type application/json`);
console.log(`manifest updated: ${manifest.models.length} model file(s)`);
