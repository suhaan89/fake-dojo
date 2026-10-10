# Fake Dojo (Banana Hacks 2026)

Source of truth: `docs/BUILD_BRIEF.md`. Decisions: `docs/DECISIONS.md`. Next.js notes: `AGENTS.md`.

## Hard rules
- Deadline: Mon Oct 12 2026, 03:59 UTC. All code is committed inside the hacking window (opened Oct 10, 00:00 UTC).
- Commit small and often, conventional commits, push regularly.
- Never rewrite history: no squash, no rebase of pushed commits, no force push, no changed dates.
- Public repo. Never commit secrets. `.env*` is ignored except `.env.example`.
- Never ask for the API key in chat. The human edits `.env.local` himself.
- Credit every library, API, model and photo source in README.md.
- AI disclosure in README.md and DEVPOST.md (Claude Code wrote most code under Suhan's direction, Gemini at runtime).
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
- Model ids are read only in `src/lib/server/env.ts`.
- Route handlers: `export const runtime = "nodejs"` and `export const maxDuration = 60`.
- API errors: `{ error: { code, message } }` with codes RATE_LIMITED, LIVE_DISABLED, UPSTREAM, TIMEOUT, UNSAFE, NO_CANDIDATE, BAD_INPUT.
- Image math is pure TypeScript on `{ width, height, data: Uint8ClampedArray }` RGBA in `src/lib/cv` and `src/lib/forensics`. Server uses sharp for decode and encode, browser uses canvas.
- Import sharp only in server modules that need it (`src/lib/server/*`, scripts).
- Game logic in `src/lib/game` is pure and unit-tested. Profile lives in localStorage `fakedojo.profile.v1`, always in try/catch.
- Design: paper #F6F4EF, ink #121212, hairline #D9D5CC, red #E5484D for edited, green #1F7A5A for real. Geist Sans and Geist Mono. No gradients, glows, glass, emoji, sparkle icons, "+50" badges or dot separators.
- Tests sit next to the code as `*.test.ts`.

## Milestones
- [x] M0 Scaffold
- [ ] M1 Core logic: cv, forensics, game modules with tests
- [ ] M2 AI layer: providers, schemas, prompts, routes, rate limiting, smoke script
- [ ] M3 Forge UI end to end
- [ ] M4 Deck: seed script, Daily Dojo, Classroom, landing hero
- [ ] M5 Progression, profile, How it works, polish, accessibility
- [ ] M6 Docs and release

Current milestone: M1.

## Waiting on the human (brief section 18)
- `GEMINI_API_KEY` with billing in `.env.local`
- 15 to 25 own photos in `seed/photos/`
- Vercel deploy, demo video, submission
