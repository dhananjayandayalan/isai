// PostToolUse hook: lint and format the file Claude just edited.
// Only problems that can't be auto-fixed are sent back (exit code 2).
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const abs = path.resolve(root, filePath);
const rel = path.relative(root, abs).split(path.sep).join("/");

function run(cmd, cwd) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", timeout: 50_000 });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

const problems = [];

// Skip a package until it is set up (pyproject synced / node_modules installed).
const pipelineReady = existsSync(path.join(root, "pipeline", ".venv"));
const webReady = existsSync(path.join(root, "web", "node_modules"));

if (pipelineReady && rel.startsWith("pipeline/") && rel.endsWith(".py")) {
  const cwd = path.join(root, "pipeline");
  const file = JSON.stringify(path.relative(cwd, abs));
  run(`uv run ruff format ${file}`, cwd);
  const lint = run(`uv run ruff check --fix ${file}`, cwd);
  if (!lint.ok) problems.push(lint.out);
}

if (webReady && rel.startsWith("web/") && /\.(ts|tsx|js|jsx)$/.test(rel) && !rel.startsWith("web/src/generated/")) {
  const cwd = path.join(root, "web");
  const file = JSON.stringify(path.relative(cwd, abs));
  const lint = run(`pnpm exec eslint --fix ${file}`, cwd);
  if (!lint.ok) problems.push(lint.out);
}

if (problems.length) {
  const text = problems.join("\n").split("\n").slice(-40).join("\n");
  process.stderr.write(`Lint problems in ${rel} that need a manual fix:\n${text}\n`);
  process.exit(2);
}
process.exit(0);
