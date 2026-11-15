# Public launch readiness

What has to be settled before Isai opens sign-up beyond people the owner knows (tier T3
in [scaling-roadmap.md](scaling-roadmap.md), and some of it already at T2). Most of it
isn't infrastructure. Several items can block a launch on their own.

This is a checklist of questions to resolve, not legal advice. Get a lawyer's review
for the copyright, terms and privacy items in the countries you plan to serve.

## 1. Copyright

Isai's core flow is: a user uploads a recording (usually someone else's copyrighted
song) → Isai analyses it → Isai produces an arrangement (a derivative of the
composition). With friends, that's private practice. As a public service it's a legal
question.

Questions to answer with a lawyer:

- Does processing user-uploaded recordings for the user's own practice fall under an
  exception in your jurisdictions (personal use, fair use or fair dealing, education)?
  Does it change if Isai is paid?
- Is a generated arrangement a reproduction or adaptation of the composition, and who is
  responsible: the user who uploaded it, or the service that produced it?
- What changes if arrangements can be **shared** between users or published, or if one
  analysis is **reused** across users with the same recording (the dedupe idea in the
  scaling roadmap)?

Design choices that lower exposure (some are already true):

- **No audio retained** (rule 8). Isai never stores or redistributes the recording.
- **Private by default.** Arrangements are visible only to the uploader (and the opt-in
  friends group). No public links or public song catalogue of copyrighted material
  without licences.
- **The user warrants they have the right to upload** (terms of service), with a clear
  upload notice.
- **A takedown process:** a contact address and a documented procedure to remove content
  on a valid notice (DMCA-style in the US; India's IT Rules 2021 expect a grievance
  officer and response timelines for intermediaries).
- **Licensed or public-domain catalogue:** if Isai ever offers a ready-made song library,
  use public-domain compositions (many Carnatic kritis and Western classical pieces) or
  licensed ones. Don't build a catalogue from user uploads.

## 2. Model and asset licences

Every model, weight file, dataset-derived artefact and sample set used in production must
allow the intended use. Check this when the ADRs are written (P3–P5, P7) and again before
any paid or public launch.

| Asset                                                   | What to check                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Beat, separation, transcription, pitch and chord models | the code licence **and** the weights licence (they differ often); non-commercial or research-only weights block a paid launch               |
| Training data behind those weights                      | some licences pass on dataset restrictions                                                                                                  |
| Piano and electric piano samples                        | Salamander is CC-BY 3.0: attribution is required (About page, P9). Check the second instrument's licence the same way                       |
| Libraries                                               | copyleft licences (GPL, AGPL) in the worker or web bundle. AGPL in a network service has obligations; avoid it unless the code will be open |
| Fonts, icons, design assets                             | licences for web embedding                                                                                                                  |

Keep a `THIRD_PARTY_LICENSES` file (or generated report) for web and pipeline, generated
in CI, from T2.

## 3. Legal pages and consent

- **Terms of service:** acceptable use, the user's upload warranty, no guarantee of
  accuracy, account termination, liability limits, governing law.
- **Privacy policy:** see [data-security-privacy.md](data-security-privacy.md) §6.
  Plain language first: what's stored, what's deleted and when, who processes it, how
  to export and delete.
- **Age and parental consent:** decide between adults only, or managed child profiles
  with parental consent, before opening sign-up (data-security-privacy.md §6).
- **Cookie and storage notice:** Isai uses local storage and IndexedDB for settings and
  auth. If analytics are added, check whether consent is needed where you serve.
- **Grievance or contact officer:** required in some jurisdictions (India's IT Rules and
  DPDP Act).

## 4. Pricing, quotas and billing

GPU time is the main variable cost (capacity-planning.md, "Cost per upload"). Practice
costs nearly nothing. A sustainable model charges for analysis, not practice.

Options to evaluate:

- **Free tier with an upload quota** (e.g. N songs a month) plus a paid plan with a higher
  quota and faster queue priority.
- **Teacher plans:** a teacher uploads; students practise for free. That fits the "cost is
  in uploads" shape.
- **One-off credits** for occasional users.

Engineering requirements once billing exists:

- Quotas enforced server-side (RLS or RPC checks before a job is queued), not just in the
  UI.
- A payment provider that fits the market. For India, UPI support matters (Razorpay and
  others). Stripe covers many other countries. Use webhooks into a `subscriptions` table,
  and only the server decides entitlements.
- No refunds needed for failed analyses: a failed job doesn't use quota (user errors such
  as `too_long` are rejected before queueing).
- Taxes and invoicing (GST in India) handled by the provider or an accountant.

## 5. Product readiness

- **Browsers and devices:**
  - Chrome, Edge and Firefox with Web MIDI.
  - Safari and iOS can play songs but can't use MIDI. Say so clearly before a user
    connects a keyboard, and plan the native-shell phase (scaling roadmap).
  - Test on at least one low-end Android tablet and one iPad.
- **Onboarding:** connect a keyboard → calibrate latency → practise a built-in
  public-domain example → upload your first song. A first-time user should reach sound
  and lit keys in under a minute.
- **Built-in example songs:** public-domain pieces arranged by Isai and checked by a
  musician. They give new users something to practise before they upload anything.
- **Accessibility:** a WCAG 2.2 AA audit of non-canvas UI; keyboard navigation (P7);
  colour-vision-safe hand colours (P7); screen-reader labels for controls. Canvas
  displays (keyboard, falling notes, staff) get a text alternative for the current step
  ("Waiting for G4 and B4").
- **Localisation:**
  - English and Tamil UI. Add an i18n layer before strings multiply.
  - Rule 9 applies to product and feature names: English or Tamil, never Sanskrit.
    Musical terms (raga, swara, shruti, tala) stay as they are.
  - Swara and raga names in Tamil script as well as Latin.
- **Quality bar:** golden-set targets met for each source type offered publicly. A source
  type that isn't good enough yet can be labelled "beta" or held back. The full-mix path
  is the hardest; set expectations in the UI ("chords and melody are a best guess; you
  can correct them").

## 6. Operations readiness

From [operations.md](operations.md): T2+ objectives and alerts in place; a status page;
an on-call rota or a clear statement of support hours; restore drill done in the last
quarter; a penetration test completed and its findings fixed; abuse controls
(data-security-privacy.md §5) live.

## 7. Launch checklist

- [ ] Copyright position reviewed by a lawyer; terms, privacy policy and takedown process published
- [ ] Every production model, weight file and sample set licensed for the intended use; licence report generated in CI
- [ ] Age policy decided and implemented (age gate, or parental-consent flow)
- [ ] Quotas enforced server-side; billing live if the plan needs it
- [ ] Data export and account deletion self-service
- [ ] Safari and iOS limitation explained in the UI; native-shell phase planned
- [ ] Public-domain example songs and onboarding flow shipped
- [ ] Accessibility audit done; Tamil and English UI
- [ ] Golden targets met for each public source type, or the type is labelled beta
- [ ] T2 objectives, alerts, status page, on-call, restore drill, penetration test
- [ ] Capacity sized from measured `g` and peak upload rates, with a cost alert and a quota lever ready for a spike
