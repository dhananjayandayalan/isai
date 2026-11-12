# Isai style system

This folder is the single source of truth for how Isai looks. The design canvas
("Isai Playful Screens & States") is the picture; these files are the code.
Follow this guide exactly when building any UI in `web/`.

| File | What it is |
|---|---|
| `tokens.css` | Every colour, font, size, space, radius, shadow and duration, as CSS custom properties. Light, dark and system themes. |
| `components.css` | Ready-made classes (buttons, inputs, cards, loaders, toasts, piano pieces) built only from tokens. |
| `tokens.json` | The same tokens as JSON, for TypeScript or tooling. Generated from `tokens.css`; never edit by hand. |
| `check-tokens.mjs` | Fails if UI code hard-codes a colour, radius, font or shadow. |
| `preview.html` | Every component on one page, with a theme switch. Open it to see what a class looks like. |

---

## 1. Hard rules

1. **Only tokens.** Never write a hex colour, `rgb()`, a px border-radius, a font name, a box-shadow or an animation duration in a component. Use `var(--token)`. If a value is missing, add a token to `tokens.css` first, then use it.
2. **Classes before inline styles.** Build screens by composing classes from `components.css`. Inline `style` is allowed only for layout numbers that are data (a note's position, a progress width).
3. **Greys only.** There is no brand hue. Emphasis comes from lightness: `--accent` (strongest), then `--text`, `--text-2`, `--text-3`, `--text-4`. Never add a colour to show status; use the state tags, icons and wording instead.
4. **One primary button per area.** A card, form or dialog gets at most one `.btn-primary`. Everything else is `.btn-secondary`, `.btn-ghost` or `.btn-quiet`.
5. **Small radii.** Buttons, inputs and segmented controls use `--radius-md` (6px). Cards use `--radius-lg` (10px). Use `--radius-full` only for dots, round icon buttons and progress tracks. Never make a pill-shaped button.
6. **Piano keys never theme.** White keys are `--piano-white` and black keys `--piano-black` in both themes. Everything around the piano does theme.
7. **Every async part has three states.** Anything that waits on the network, audio or MIDI must render a loading state, an empty state (if it can be empty) and an error state with a next step. See section 6.
8. **Accessible by default.** Real `<button>`, `<a href>`, `<input>` + `<label>`. Every control is at least `--control-md` (44px) tall. Icon-only buttons need `aria-label`. Toggle buttons use `aria-pressed`. Loading regions use `role="status"` and errors `role="alert"`.
9. **Respect reduced motion.** `components.css` already turns animations off for `prefers-reduced-motion`. Don't add animations outside it.
10. **Run the check.** `node design/system/check-tokens.mjs` must pass before every commit that touches UI.

## 2. Setup in the web app

```ts
// web/src/main.tsx — import once, before any component CSS
import '../../design/system/tokens.css';
import '../../design/system/components.css';
```

Vite must be allowed to read the folder. In `web/vite.config.ts` add `'../design'` next to `'../schema'` in `server.fs.allow`.

Fonts go in `web/index.html` `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+Tamil:wght@500;700&display=swap">
```

### Theme (light / dark / system)

The theme is the `data-theme` attribute on `<html>`: `"light"`, `"dark"` or `"system"`. `"system"` follows the OS and switches live. The choice is saved in `localStorage` under **`isai-theme`**.

Put this in `web/index.html` `<head>`, before any CSS, so there is no flash of the wrong theme:

```html
<script>
  try { document.documentElement.dataset.theme = localStorage.getItem('isai-theme') || 'system'; }
  catch (e) { document.documentElement.dataset.theme = 'system'; }
</script>
```

The hook every theme switch uses:

```ts
// web/src/theme/useTheme.ts
import { useState } from 'react';
export type Theme = 'light' | 'dark' | 'system';
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) || 'system',
  );
  function setTheme(next: Theme) {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('isai-theme', next); } catch { /* private mode */ }
    setThemeState(next);
  }
  return { theme, setTheme };
}
```

The theme switch appears in three places: the sidebar (icons only, `.seg.seg-fill`), the practice top bar (icons only), and Settings → Appearance (three choice cards with previews). All three use the hook above.

## 3. Token reference

### Colour (changes with theme)

| Token | Use for |
|---|---|
| `--bg` | Page background |
| `--bg-deep` | Practice screen background |
| `--sidebar` | App sidebar |
| `--surface` | Cards, panels, dialogs |
| `--surface-sunken` | Wells inside cards, drop zones, inputs, the falling-notes stage |
| `--surface-raised` | Rows inside cards, list items |
| `--fill` | Chips, quiet buttons, hover |
| `--fill-strong` | Progress tracks, skeleton highlight |
| `--border` | Card and section borders |
| `--border-strong` | Inputs, outlined buttons, dashed empty states |
| `--text` | Headings, body, icons |
| `--text-2` | Secondary sentences |
| `--text-3` | Captions, meta, overlines |
| `--text-4` | Least important labels only (never paragraphs) |
| `--accent` / `--on-accent` / `--on-accent-muted` | Primary button, selected nav item, selected segment, hero tiles, error alerts |
| `--accent-shadow` / `--soft-shadow` | The 3px "press" shadow; use via `--shadow-press*` |
| `--data-1` … `--data-4` | Charts and cover art, strongest to weakest; `--on-data-1` for text on `--data-1` |
| `--hand-right*`, `--hand-left*` | Notes on the stage and piano roll |
| `--grid`, `--grid-strong` | Beat and bar lines on the stage |
| `--inverse`, `--on-inverse`, `--on-inverse-muted`, `--inverse-border` | The brand panel on Log in / Join |

### Fixed (same in every theme)

`--piano-frame`, `--piano-white`, `--piano-white-hint`, `--piano-white-active`, `--piano-black`, `--piano-black-active`, `--piano-label`, `--piano-pill-right`, `--piano-pill-left`, `--piano-pill-edge`, `--piano-correct`, `--piano-wrong`.

On the practice keyboard: a key to press now is `--piano-white-active` / `--piano-black-active` with a pill in its hand's colour; the step after is the same pill outlined; the hand you aren't practising is `--piano-white-hint` with a faint pill; a key you played right gets a `--piano-correct` disc and one that isn't in the step a `--piano-wrong` disc with a cross. Right and wrong differ by shape, not hue (rule 3).

### Type

| Token | Size | Class that uses it |
|---|---|---|
| `--text-5xl` | 46 | `.t-page-title` (one per page) |
| `--text-4xl` | 40 | `.t-state-title` (loading / error screens) |
| `--text-3xl` | 30 | `.t-stat` |
| `--text-2xl` | 24 | `.t-section` |
| `--text-xl` | 20 | `.t-card-title` |
| `--text-md` | 15 | body, buttons |
| `--text-sm` | 13 | `.t-muted`, chips, segmented buttons |
| `--text-xs` / `--text-2xs` | 12 / 11 | `.t-overline`, `.t-faint`, tags |

Fonts: `--font-display` for headings, big numbers and chord names; `--font-body` for everything else; `--font-mono` for times, tempos, file sizes and note names; `--font-tamil` for Tamil text (always add `lang="ta"`).

### Space, radius, sizes

- Space: `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-7` 28 · `-8` 32 · `-10` 40 · `-12` 48 · `-14` 56. Use them for every padding, margin and gap.
- Radius: `--radius-xs` 2 · `-sm` 4 · `-md` 6 · `-lg` 10 · `-xl` 14 · `-full`.
- Controls: `--control-md` 44 (default), `--control-lg` 52 (main call to action), `--control-sm` 36 (only inside `.seg`).
- Layout: `--sidebar-width` 220, `--content-max` 1120, `--page-pad-x` 40, `--page-pad-y` 36.
- Motion: `--dur-fast` 150ms, `--dur-base` 250ms, `--ease-out`, `--ease-pop`.

## 4. Component recipes

Copy these shapes. Change the words, not the classes.

**App shell** (every screen except sign-in, practice and full-page errors)

```html
<div class="app-shell">
  <aside class="app-sidebar">
    <div class="brand"><span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span><span class="brand-name">Isai</span><span class="brand-tamil" lang="ta">இசை</span></div>
    <nav class="nav" aria-label="Main">
      <a class="nav-item" href="/" aria-current="page">Songbook</a>
      <a class="nav-item" href="/analyse">Analyse a song</a>
      <a class="nav-item" href="/practice">Practice</a>
      <a class="nav-item" href="/settings">Settings</a>
    </nav>
    <!-- bottom: keyboard status card + theme switch (.seg.seg-fill, icon buttons with aria-label) -->
  </aside>
  <main class="app-main"><div class="app-content"> … </div></main>
</div>
```

**Buttons**: `<button class="btn btn-primary">`, `.btn-secondary`, `.btn-ghost`, `.btn-quiet`; add `.btn-lg` for the main action on a page; `.btn-icon` + `aria-label` for icon-only; `.btn-play` for play/pause. Busy: `disabled aria-busy="true"` and a `.spinner` before the label, and change the label ("Saving…").

**Segmented control**: `<div class="seg" role="group" aria-label="Hands"><button class="seg-btn" aria-pressed="true">Both</button>…</div>`.

**Filters**: `<button class="filter" aria-pressed="false">Carnatic <span class="t-mono">1</span></button>`.

**Range** (seek bars): `<input type="range" class="range" aria-label="Position">`.

**Field**: `<div class="field"><label class="label" for="x">Email</label><input class="input" id="x" aria-invalid="true" aria-describedby="x-err"><span class="field-error" id="x-err">…</span></div>`.

**Choice card**: `<label class="choice"><input type="radio" name="source"><span class="stack-1"><b>Just piano</b><span class="t-muted">…</span></span></label>`.

**Cards**: `.card` (default), `.card-sunken` (dashed well), `.card-row` (row inside a card), `.card-accent` (hero number, one per screen), `.card-lift` (clickable song card hover).

**Chips and tags**: `.chip` for facts (key, tempo, length); `.chip-mono` for numbers; `.tag-loading|empty|error|warning` only on design-state labels.

**Loaders**: `.skeleton` with a height; `.progress > span[style=width]`; `.progress-lg.progress-striped` for uploads; `.loader-eq` (3–5 spans) for "Isai is listening"; `.spinner` for actions under a second; `.loader-keys` (8 spans) only for the practice start-up.

**Feedback**: `.alert` (inverted, blocking problem in a form), `.alert-quiet` (inline hint); `.toast-success|info|warning|error`; `.state.state-empty|state-error` for whole-panel states with a `.state-icon`.

**Music**: `.stage` (falling notes) with `.note-right`, `.note-left`, `.note-ghost` (hand not being practised); `.piano`, `.piano-key-white`, `.piano-key-black`, `.piano-canvas` (a full-width `<canvas>` inside `.piano`); `.chord-now`, `.chord-next`. The animation itself runs on canvas/`requestAnimationFrame` (CLAUDE.md rule 5): read the token values once with `getComputedStyle(document.documentElement).getPropertyValue('--hand-left')` and re-read when the theme changes.

## 5. Screens and what they use

| Screen (canvas artboard) | Main pieces |
|---|---|
| Log in, Join | Split layout: `--inverse` brand panel + form; `.field`, `.input-lg`, `.btn-primary.btn-lg`, `.alert`, theme `.seg` |
| Songbook (`Main`) | App shell; `.card` continue panel; `.filter` row; `.grid-cards` of `.card.card-lift`; skeleton grid while loading |
| Analyse a song (`Upload`) | `.dropzone`; `.choice` grid; `.progress-lg.progress-striped`; pipeline list of `.card-row` with `.loader-eq` on the active step |
| Song overview (`Song`) | Stat `.card`s with `.progress`; chord map tiles (`--data-*`); `.seg` for note names; piano roll on `.stage` colours |
| Practice | `--bg-deep`; `.chord-now`/`.chord-next`; `.stage` + notes; `.piano`; `.seg` for mode, hands, note names; `.btn-play` |
| Results | `.card-accent` score; histogram bars `--data-1` (in time) and `--data-3` (outside); section `.progress` bars |
| Settings (`Devices`) | Appearance choice cards; device `.choice` list; keyboard size `.seg`; latency card |
| Loading & errors page | One sheet per area; each state uses `.state`, `.skeleton`, loaders and `.toast` exactly as drawn |

## 6. States checklist (every async component)

| Component | Loading | Empty | Error |
|---|---|---|---|
| Song list | Skeleton cards + "Flipping through your songbook…" | First visit; no search results | Couldn't load + Try again |
| Upload | Striped progress + Cancel | – | Wrong type, too long, too big, many files, connection dropped (Resume) |
| Pipeline job | Active step with `.loader-eq`; queued | – | Failed step with reason and fix; worker offline |
| Song details | Skeleton page | No chords (melody only) | Old/invalid Song JSON; download failed toast; low-confidence key prompt |
| Practice start | `.loader-keys` + 3 steps | – | Piano sound failed; keyboard unplugged; tab paused |
| MIDI | Waiting for permission; scanning | No keyboards | Blocked; unsupported browser; device busy |
| Results | "Counting every note…" | Too short to score | Save failed (kept on this computer, retrying) |
| Whole app | – | – | 404 page; offline page with countdown |

## 7. Words

Friendly, short, musical, never cute at the cost of clarity. Say what happened and what to do next in plain words: "We couldn't fetch your songs. Try again." Use "you" and "Isai". No exclamation marks in errors. No technical codes in the main sentence; put them in `.t-faint` underneath if useful.

## 8. Before you commit

1. `node design/system/check-tokens.mjs` passes.
2. The screen works in Light, Dark and System (switch with the sidebar control).
3. Every async piece shows loading, empty and error states.
4. Tab through the screen: every control is reachable and shows the focus ring.
5. Compare with the canvas artboard of the same name.

## Changing the system

Edit `tokens.css` → regenerate `tokens.json` → update `components.css` if a recipe changes → open `preview.html` in both themes → update this guide. Never fork values into components.
