# Reference — scaling Isai beyond the friends group

These documents describe how Isai grows from the current audience (the owner and ≤ 10
invited friends, as built through P9) to hundreds, thousands and more users. They are
reference material for planning, not specs. Nothing here is built until a phase spec in
[`docs/spec/`](../spec/README.md) asks for it (CLAUDE.md rule 2), and any change to an
accepted ADR still needs a new ADR (rule 3).

| Document | Read it when |
|---|---|
| [scaling-roadmap.md](scaling-roadmap.md) | Deciding whether to open Isai to more people, and what has to change first |
| [capacity-planning.md](capacity-planning.md) | Estimating workers, storage, bandwidth and monthly cost for a user count |
| [data-security-privacy.md](data-security-privacy.md) | Adding users you don't know personally; handling personal data, minors, deletion |
| [operations.md](operations.md) | Moving from "the owner notices" to SLOs, alerts, on-call and safe releases |
| [public-launch.md](public-launch.md) | Opening sign-up to the public: copyright, licences, legal pages, billing, i18n |

## The one idea to keep in mind

Isai has two very different kinds of load:

1. **Practice** runs entirely in the learner's browser: MIDI, audio, the piano and
   scoring. A learner practising for an hour costs the server a few small database
   writes. It scales like a static website.
2. **Analysis** runs on a GPU worker. Every upload costs minutes of compute. It scales
   with *uploads*, not with users or practice time.

So growth is mostly about analysis throughput and cost, data safety and legal exposure.
Web serving is rarely the problem. Most of the work in these documents follows from that.

## How to use these documents

1. Find the current tier in `scaling-roadmap.md` and check the trigger metrics for the
   next one.
2. Put real measurements (GPU seconds per audio minute, uploads per user) into
   `capacity-planning.md` to size the next tier.
3. Turn the tier's changes into a new phase spec (`docs/spec/p11-…`) with ADRs for the
   decisions, the same way as every other phase.

Numbers in these documents are illustrative unless marked as measured. Replace them with
numbers from the job timings recorded since P8, and check vendor pricing pages at the time
of the decision. Prices and plans change.
