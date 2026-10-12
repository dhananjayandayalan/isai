// Stop hook: before Claude finishes, run the fast tests for any package with
// uncommitted changes. If they fail, Claude is told to keep going (exit code 2).
// It only pushes back once per stop, so it can't loop forever.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
if (input.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

function run(cmd, cwd, timeout = 280_000) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", timeout });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

const status = run("git status --porcelain", root, 10_000);
if (!status.ok) process.exit(0); // not a git repo yet

const changed = status.out.split("\n").map((l) => l.slice(3).trim());
const touches = (dir) => changed.some((f) => f.startsWith(dir));

const failures = [];

if (touches("pipeline/") && existsSync(`${root}/pipeline/.venv`)) {
  const r = run('uv run pytest -m "not slow" -q -x', `${root}/pipeline`);
  if (!r.ok) failures.push(`pipeline tests failed:\n${r.out.split("\n").slice(-30).join("\n")}`);
}

if (touches("web/") && existsSync(`${root}/web/node_modules`)) {
  const tc = run("pnpm typecheck", `${root}/web`);
  if (!tc.ok) failures.push(`web typecheck failed:\n${tc.out.split("\n").slice(-30).join("\n")}`);
  const t = run("pnpm test --run", `${root}/web`);
  if (!t.ok) failures.push(`web tests failed:\n${t.out.split("\n").slice(-30).join("\n")}`);
}

if (failures.length) {
  process.stderr.write(
    `Checks are failing on your changes. Fix them before finishing, or explain why they ` +
      `can't be fixed in this phase.\n\n${failures.join("\n\n")}\n`,
  );
  process.exit(2);
}
process.exit(0);
