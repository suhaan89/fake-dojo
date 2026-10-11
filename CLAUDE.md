# Fake Dojo (Banana Hacks 2026)

Source of truth: `docs/BUILD_BRIEF.md`. Decisions: `docs/DECISIONS.md`. Next.js notes: `AGENTS.md`.

## Hard rules
- Deadline: Mon Oct 12 2026, 03:59 UTC. All code is committed inside the hacking window (opened Oct 10, 00:00 UTC).
- Commit small and often, conventional commits, push regularly.
- Never rewrite history: no squash, no rebase of pushed commits, no force push, no changed dates.
- Public repo. Never commit secrets. `.env*` is ignored except `.env.example`.
- Never ask for the API key in chat. The human edits `.env.local` himself.
- Credit every library, API, model and photo source in README.md.
- AI disclosure in README.md and DEVPOST.md (Claude Code wrote most code under Suhan's direction, Seed 2.0 Lite and Seedream 4.0 on BytePlus ModelArk at runtime, Gemini optional).
- No accounts, no database, no auth. No placeholders: no TODO comments, dead buttons, lorem ipsum or fake data.
- People are never edited. Sensitive documents are refused. No download of live forgeries.
- Talk to the human in German, short, no em-dashes. Code, comments, UI copy and docs in English.

## Stack
- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, `src/` dir, alias `@/*`.
- `@google/genai` (Interactions API), `zod` v4, `sharp` (server only), `vitest`, `tsx`.
- No UI kits, chart libraries, state libraries or databases.
- Next 16 differs from older versions. Read `node_modules/next/dist/docs/` before using an unfamiliar API.

## Commands
- `npm run dev`, `npm run build`, `npm run start`, `npm run lint`
- `npm run typecheck`, `npm test` (vitest run)
- `npm run smoke -- <photo>` runs plan, render, verify from Node into `tmp/smoke/`
- `npm run seed` builds `public/deck` from `seed/photos/*` (flags `--limit`, `--dry-run`)
- Gate after every milestone: typecheck, test, build all green, then commit and push.

## Conventions
- Model ids are read only in `src/lib/server/env.ts`. `IMAGE_PROVIDER=seedream` plus `ARK_API_KEY` moves the edit step to Seedream on BytePlus (`src/lib/ai/seedream.ts`). `VISION_PROVIDER=ark` moves plan and verify to a ModelArk vision model (`src/lib/ai/ark-vision.ts`, verified live with `seed-2-0-lite-260428`).
- Route handlers: `export const runtime = "nodejs"` and `export const maxDuration = 60`.
- API errors: `{ error: { code, message } }` with codes RATE_LIMITED, LIVE_DISABLED, UPSTREAM, TIMEOUT, UNSAFE, NO_CANDIDATE, BAD_INPUT.
- Image math is pure TypeScript on `{ width, height, data: Uint8ClampedArray }` RGBA in `src/lib/cv` and `src/lib/forensics`. Server uses sharp for decode and encode, browser uses canvas.
- Import sharp only in server modules that need it (`src/lib/server/*`, scripts).
- The forge loop lives in `src/lib/forge/run.ts` and runs against a transport (HTTP in the browser, direct in scripts).
- Render and verify need the signed ticket from the plan route (`src/lib/server/ticket.ts`).
- Game logic in `src/lib/game` is pure and unit-tested. Profile lives in localStorage `fakedojo.profile.v1`, always in try/catch.
- Design: paper #F6F4EF, ink #121212, hairline #D9D5CC, red #E5484D for edited, green #1F7A5A for real. Geist Sans and Geist Mono. No gradients, glows, glass, emoji, sparkle icons, "+50" badges or dot separators.
- Tests sit next to the code as `*.test.ts`.

## Milestones
- [x] M0 Scaffold, M1 Core logic, M2 AI layer (mock verified), M3 Forge UI, M4 Deck modes, M5 Profile and polish, M6 Docs
- [x] Real smoke test: works with Seedream for the edit and `seed-2-0-lite-260428` on ModelArk for vision (about 40 to 90 s per forge).
- [x] Real deck: 44 cards (34 forged, 10 real), own photos plus 12 CC0 photos from Wikimedia Commons (`seed/photos/web-*.jpg`, credited in README), each checked by eye. Weak cards are removed from deck.json and their folder; `npm run seed` then retries them.
- [ ] Open items in `docs/QA.md`, then stretch goals (brief section 19) only if everything else is done.

Current state: feature complete, real deck committed, live forging runs on the Ark key alone (`VISION_PROVIDER=ark`, `IMAGE_PROVIDER=seedream`).

## Waiting on the human (brief section 18)
- Vercel deploy with `ARK_API_KEY`, `VISION_PROVIDER=ark`, `ARK_VISION_MODEL`, `IMAGE_PROVIDER=seedream`
- `docs/screenshot.png`, live URL and video link in README.md and DEVPOST.md, demo video, submission
