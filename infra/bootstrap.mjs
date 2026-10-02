#!/usr/bin/env node
// Idempotent Cloudflare bootstrap for one environment (ADR-021).
// Usage: node infra/bootstrap.mjs --env staging|production [--skip-deploy]
// Requires `pnpm wrangler login` (local) or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (CI).
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EDGE = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "edge");
const CONFIG = join(EDGE, "wrangler.jsonc");
const RESOURCES = {
  staging: { database: "isai-staging", bucket: "isai-models-staging" },
  production: { database: "isai-prod", bucket: "isai-models" },
};

const args = process.argv.slice(2);
const envName = args[args.indexOf("--env") + 1];
const skipDeploy = args.includes("--skip-deploy");
if (!RESOURCES[envName]) {
  console.error("Usage: node infra/bootstrap.mjs --env staging|production [--skip-deploy]");
  process.exit(1);
}
const { database, bucket } = RESOURCES[envName];

function wrangler(cmd, { input, allowFail = false } = {}) {
  try {
    return execSync(`pnpm exec wrangler ${cmd}`, {
      cwd: EDGE,
      input,
      encoding: "utf8",
      stdio: [input === undefined ? "inherit" : "pipe", "pipe", "pipe"],
    });
  } catch (err) {
    if (allowFail) return `${err.stdout ?? ""}${err.stderr ?? ""}`;
    console.error(`wrangler ${cmd} failed:\n${err.stdout ?? ""}${err.stderr ?? ""}`);
    process.exit(1);
  }
}

const step = (msg) => console.log(`\n▸ ${msg}`);

step("Checking Cloudflare authentication");
const who = wrangler("whoami", { allowFail: true });
if (/not authenticated|You are not logged in/i.test(who)) {
  console.error("Not logged in. Run `pnpm --filter @isai/edge exec wrangler login` first.");
  process.exit(1);
}

step(`D1 database ${database}`);
const findDb = () => JSON.parse(wrangler("d1 list --json")).find((d) => d.name === database);
let db = findDb();
if (!db) {
  wrangler(`d1 create ${database}`);
  db = findDb();
  console.log(`  created ${db.uuid}`);
} else {
  console.log(`  exists ${db.uuid}`);
}

step("Writing database_id into wrangler.jsonc");
const config = readFileSync(CONFIG, "utf8");
const pattern = new RegExp(`("database_name": "${database}", "database_id": ")[^"]*(")`);
if (!pattern.test(config)) {
  console.error(`Could not find the ${database} entry in wrangler.jsonc`);
  process.exit(1);
}
const updated = config.replace(pattern, `$1${db.uuid}$2`);
if (updated !== config) {
  writeFileSync(CONFIG, updated);
  console.log("  updated — commit apps/edge/wrangler.jsonc");
} else {
  console.log("  already up to date");
}

step(`R2 bucket ${bucket}`);
const r2 = wrangler(`r2 bucket create ${bucket}`, { allowFail: true });
if (/already exists|already own/i.test(r2)) console.log("  exists");
else if (/Created bucket|created/i.test(r2)) console.log("  created");
else {
  console.error(`  could not create bucket. Is R2 enabled on the account?\n${r2}`);
  process.exit(1);
}

step("Applying D1 migrations (remote)");
wrangler(`d1 migrations apply DB --env ${envName} --remote`, { input: "y\n" });

if (skipDeploy) {
  console.log("\nSkipping deploy and secrets (--skip-deploy).");
  process.exit(0);
}

step("Deploying the Worker");
console.log(wrangler(`deploy --env ${envName}`).trim().split("\n").slice(-4).join("\n"));

step("Secret IP_SALT");
const secrets = wrangler(`secret list --env ${envName}`, { allowFail: true });
if (secrets.includes("IP_SALT")) {
  console.log("  already set");
} else {
  wrangler(`secret put IP_SALT --env ${envName}`, { input: randomBytes(32).toString("hex") });
  console.log("  set (random, never printed)");
}

console.log(`\n✓ ${envName} ready. Provider keys (Phase 2): pnpm --filter @isai/edge exec wrangler secret put GROQ_API_KEY --env ${envName}`);
