// PreToolUse hook: blocks edits that break the hard rules in CLAUDE.md.
// Exit code 2 stops the edit and shows the message to Claude.
import { readFileSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join("/");

const rules = [
  {
    test: (p) => p.startsWith("web/src/generated/") || p.startsWith("pipeline/src/isai/generated/"),
    msg: "Generated code is never edited by hand. Change schema/song.schema.json and run /schema-sync.",
  },
  {
    test: (p) => /\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i.test(p),
    msg: "Song audio must not be written into the repo. Keep audio outside git (see rule 8).",
  },
  {
    test: (p) => /(^|\/)\.env(\..*)?$/.test(p) && !p.endsWith(".env.example"),
    msg: "Do not write secrets files. Update .env.example and tell the owner which values to set.",
  },
];

for (const rule of rules) {
  if (rule.test(rel)) {
    process.stderr.write(`Blocked edit to ${rel}: ${rule.msg}\n`);
    process.exit(2);
  }
}
process.exit(0);
