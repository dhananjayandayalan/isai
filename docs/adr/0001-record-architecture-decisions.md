---
id: adr-0001
title: Record architecture decisions
status: accepted
date: 2026-10-13
phase: P0
supersedes: null
---

# 0001 — Record architecture decisions

## Context

Isai is built by one owner with Claude Code doing much of the implementation across many
sessions. Decisions made in one session (a model choice, a contract shape, a platform
constraint) are easily lost or quietly undone in the next. Session memory is not a reliable
place for them, and commit messages are too scattered to read as a whole.

## Options considered

1. **No formal record.** Cheapest. Decisions live in chat history and commit messages, and
   get re-litigated or silently contradicted.
2. **A single `DECISIONS.md`.** Easy to read, but grows into a wall of text, hard to
   supersede one entry cleanly, and merge-conflict prone.
3. **One short ADR per decision in `docs/adr/`** (Nygard style). Each decision has its own
   file, status and history; superseding is explicit.

## Decision

Use option 3. ADRs live in `docs/adr/NNNN-kebab-title.md` with frontmatter (`id`, `title`,
`status`, `date`, `phase`, `supersedes`) and sections Context, Options considered, Decision,
Consequences. New ADRs start as `proposed`; the owner accepts them. `/adr-new` drafts one.

Accepted ADRs are binding (CLAUDE.md hard rule 3). Going against one needs a new ADR that
supersedes it, never a workaround.

## Consequences

- Architectural changes start by reading `docs/adr/`.
- A little writing overhead per decision, kept small by the one-page limit.
- Superseded ADRs stay in the repo, linked both ways, so the history is readable.
