# Decisions

One line per non-obvious decision, newest at the bottom.

- M0: The brief was delivered as `Downloads/BUILD_BRIEF.md`; copied unchanged to `docs/BUILD_BRIEF.md` as the target structure expects.
- M0: Scaffolded with create-next-app 16.4 into a temp folder and moved the files up, because the repo already held `.git`.
- M0: Removed `cacheComponents` and `partialPrefetching` from the generated `next.config.ts`. The app is client-heavy and has no cached data, so the classic rendering model is simpler and less risky for a weekend build.
- M0: `@types/node` raised to 22 because vitest 5 requires it as a peer. Runtime target stays Node 20 or newer.
- M0: `sharp` is listed in `serverExternalPackages` so its native binary is never bundled.
- M0: Without a key, development uses the MockProvider automatically; production without a key reports live forging as unavailable instead of faking results.
