---
id: adr-0005
title: One practice engine with training and performance policies
status: proposed
date: 2026-11-12
phase: P2
supersedes: null
---

# 0005 — One practice engine with training and performance policies

## Context

P2 adds training mode: playback holds at the next notes until the learner plays them. P6
adds performance mode: playback never holds and the same notes are scored by timing. Both
need the same things from a song (which notes to expect and when), from the transport
(speed, loop, count-in, metronome) and from the MIDI input (what was played and when).
Rules 5 and 6 still apply: no React render per note, and the audio clock is the only clock.

## Options considered

1. **Two engines**, one per mode. Simple to start, but steps, speed, loop and metronome
   would be written twice and drift apart.
2. **One engine, pluggable policy.** Steps, matcher and scheduling are shared. A policy
   says whether playback holds, whether steps are tracked and which hand Isai sounds.
3. **Hooks on the P1 player.** Smallest diff, but the P1 player schedules a whole song
   once at song time. Speed, loop and count-in all need a second timeline, so most of it
   would be rewritten anyway.

## Decision

Option 2. The engine lives in `web/src/engine/practice/` and replaces the P1 player.

- **Steps.** The practised hand's notes are grouped into steps: onsets within 35 ms
  (song time) of the first onset form one step. A step lists its expected MIDI pitches and
  the hand of each. Notes that are silent (velocity 0), outside the learner's keyboard, or
  on a key that hand is already holding are not expected.
- **Matching.** Exact MIDI pitch (a pitch-class option exists, with no UI until P7). When
  a step becomes current, a pitch counts if its key is already down, or was pressed up to
  150 ms earlier, or is pressed afterwards. Wrong notes are recorded and never block.
  Windows are real time, so a slowed song is no easier to time.
- **Policies.** `listen` (no holds, no tracking, Isai sounds everything), `training`
  (holds, tracking, Isai sounds only the other hand, or nothing if it is muted). P6 adds
  `performance` (no holds, tracking, a scorer listening to step events).
- **Speed is a rate.** Transport time = song time ÷ rate. The transport stays the clock
  (ADR 0004); nothing is re-pitched because the piano is synthesised from samples.
- **Timeline.** Each start, seek or speed change re-anchors the song at transport time 0.
  Loop passes follow one another on the transport, each with an optional one-bar
  count-in, so a loop is seamless and needs no jump. Only the next two seconds are
  scheduled at a time; a refill event schedules more.
- **Holds.** A hold is a transport event 1 ms before the step. If the step is already
  satisfied, nothing pauses. Otherwise the transport pauses at that event's audio time.
  Notes already sounding ring on. When the last expected key arrives, the transport
  resumes at a position that makes the song continue from the learner's note, not from
  the moment the transport restarts: the engine skips the transport's start-up lookahead
  and fires the skipped events itself at their correct audio times.

## Consequences

- P6 adds a policy and a scorer; steps, matcher, speed, loop and metronome don't change.
- `Transport` gains `pause(time)`, `stop(time)` and `lookahead`; `LoadedAudio` gains a
  metronome `Instrument`. `engine/player.ts` is removed.
- Every scheduled callback must be safe to run twice or not at all around a pause, because
  a lookahead transport delivers events slightly early. The engine marks events done and
  ignores them while holding.
- Bars come from beats with the first beat as a downbeat, so a song with a pickup bar
  loops one beat off until P3 adds downbeats.
- A hold is announced (keys lit, "Waiting for …") one lookahead, about 100 ms, before the
  sound stops, because the transport hands out events ahead of the audio clock. A key
  pressed in that window counts as on time and nothing pauses audibly.
- State the learner sees (holding, counting in) comes from what the engine has performed,
  not from the transport position, which runs behind the engine by that lookahead.
- Measured in Chrome with the real transport: after a hold, Isai's other-hand note is
  scheduled at the audio time of the learner's key, so it sounds as soon as the browser
  can play it. How that feels through real speakers and a real keyboard's latency can
  only be judged by hand.
- A resume skips at most 0.3 s of the transport to catch up with the learner's note. An
  output with more latency than that (some Bluetooth speakers) hears Isai come back in a
  little late after each hold.
- The learner's keys and Isai's notes sound through one piano. The engine only stops the
  notes it started, and each of the two plays through its own part of the instrument
  (`audio/parts.ts`), so neither can cut the other's note, even on the same key.
