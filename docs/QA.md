# QA checklist

Status on Oct 10, 2026. "Mock" means checked with the MockProvider; items that need the real key or the real deck are listed at the end and are still open.

## Checked

- [x] `npm run typecheck`, `npm run lint`, `npm test` (146 tests), `npm run build` are green.
- [x] Forge end to end in the browser (mock): upload, timeline, hunt with one miss and one hit, reveal, points stored in the profile.
- [x] Agent timeline: durations shown, plan redacted during forging and hunt, unredacted after the reveal. Before the reveal the secret text is not in the DOM.
- [x] Reveal: heatmap overlay toggle, change box, before and after slider, ELA, noise and edge lenses computed through the worker and cached.
- [x] Daily Dojo (mock deck, removed afterwards): Real and Edited calls, hunt after a correct Edited call, reveal after a wrong Real call, real-photo result, summary with per-type table and "Train this in Forge".
- [x] Classroom (mock deck): countdown, automatic reveal, tell in large type, header hidden.
- [x] Landing hero (mock deck) with `?demo=1`: pick, heatmap reveal, another pair. Without a deck the hero falls back to the tagline and the Forge button.
- [x] Empty deck: Dojo and Classroom show a clear message and a way into Forge.
- [x] 375 px width: no horizontal scrolling on `/`, `/forge`, `/dojo`, `/classroom`, `/profile`, `/how-it-works`; interactive targets are at least 44 px high.
- [x] No-key mode: development falls back to the mock and shows the "Mock mode" label; production without a key reports `liveForge: false` and the routes answer `LIVE_DISABLED` (route tests).
- [x] Kill switch `LIVE_FORGE_ENABLED=false`: status pill shows "Live forge resting, try the Daily Dojo", routes answer 503 (route tests).
- [x] Rate-limit message: per-IP and daily cap both answer 429 with a friendly message before any model call (route tests); the error state in the UI offers "Play a pre-forged card instead" (simulated in the browser).
- [x] Upstream failure (simulated in the browser and in tests): attempts are retried, the failed attempts appear in the log, the error state offers the deck and a retry.
- [x] Guardrails (tests): sensitive documents and refused plans answer `UNSAFE` with the friendly message; photos that are mostly a person are refused; candidates near a person are dropped; `people_altered` rejects as a safety matter and that image is never shown.
- [x] Ticket: render with a forged ticket or a changed instruction answers 400 (route tests).
- [x] Registration: a model output shifted by 4 and 2 px is registered back exactly (pipeline test).
- [x] Storage failure: profile load, save and reset never throw (unit tests); the forge page tells the player when progress cannot be saved.
- [x] `prefers-reduced-motion` disables animations and transitions globally.
- [x] No TODO comments, no placeholder text, no dead buttons. No `console.*` in client code.
- [x] No secrets in the repository; `.env*` is ignored except `.env.example`.

## Open, needs the human or the real key

- [ ] Seedream edit path (`IMAGE_PROVIDER=seedream`): the request (endpoint, field names, size rule, base64 response) is written from the publicly known shape of the ModelArk images endpoint and is covered by tests with a fake server. The docs pages could not be read while building it, and it has never run against the real API. Expect to adjust it on the first real call.
- [ ] `npm run smoke -- <photo>` with the real key: confirms the Interactions API request shape, the PNG output and the timings (target: median under 45 s).
- [ ] `npm run seed` with 15 to 25 own photos, then commit `public/deck` (at least 15 cards, under 25 MB).
- [ ] Keyboard hunt on a real forgery: arrow keys move the crosshair, Enter guesses.
- [ ] Pinch zoom, tap and loupe on a real phone.
- [ ] Slow network: forge loading states on a throttled connection.
- [ ] Classroom on a 1920 px screen with the real deck, in fullscreen.
- [ ] Real guardrail check: upload a selfie and a receipt and confirm the refusal message.
- [ ] `docs/screenshot.png`, live URL and video link in README.md and DEVPOST.md.
