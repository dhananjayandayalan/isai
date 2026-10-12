---
description: Draft a new architecture decision record in docs/adr
argument-hint: <decision title, e.g. "Use midir for native MIDI in Tauri">
---

Draft an ADR for: **$ARGUMENTS**

1. List `docs/adr/` and take the next number (`NNNN`, zero-padded). Create
   `docs/adr/NNNN-<kebab-case-title>.md`.
2. Read related ADRs and the spec chunks this decision affects. If this replaces an older
   ADR, mark that one `Superseded by NNNN` and link both ways.
3. Use this structure:
   - Frontmatter: `id`, `title`, `status: proposed`, `date` (today), `phase`, `supersedes`
   - **Context:** the problem and constraints (Claude Pro budget, free hosting, laptop GPU,
     MIDI support across browsers and platforms, as relevant)
   - **Options considered:** at least two, each with pros and cons
   - **Decision:** what we choose and why
   - **Consequences:** what gets easier, what gets harder, follow-up work
4. Keep it under one page. Leave `status: proposed` and ask me to accept it. Do not change
   code in this command.
