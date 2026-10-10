# Decisions

One line per non-obvious decision, newest at the bottom.

- M0: The brief was delivered as `Downloads/BUILD_BRIEF.md`; copied unchanged to `docs/BUILD_BRIEF.md` as the target structure expects.
- M0: Scaffolded with create-next-app 16.4 into a temp folder and moved the files up, because the repo already held `.git`.
- M0: Removed `cacheComponents` and `partialPrefetching` from the generated `next.config.ts`. The app is client-heavy and has no cached data, so the classic rendering model is simpler and less risky for a weekend build.
- M0: `@types/node` raised to 22 because vitest 5 requires it as a peer. Runtime target stays Node 20 or newer.
- M0: `sharp` is listed in `serverExternalPackages` so its native binary is never bundled.
- M0: The remote already held a one-commit stub of `docs/BUILD_BRIEF.md`. Joined both histories with a merge commit (no rebase, no force push) and kept the full brief.
- M0: Without a key, development uses the MockProvider automatically; production without a key reports live forging as unavailable instead of faking results.
- M1: Tone matching estimates the model's global color drift from the ring (where both images should be identical) and applies that correction inside the mask. Matching the edit's own statistics to the ring would recolor the edit itself.
- M1: "Two iterations of opening" is implemented as two erosions followed by two dilations (a 5x5 element); a 3x3 opening cannot remove a speck that the 3x3 box blur has already widened.
- M1: Alignment compares ring luma with the mean removed, so a global brightness drift is not mistaken for a shift. "Still poor" means above 20/255 after the search.
- M2: The model schema is always sent without `$schema` and `additionalProperties` instead of trying the full schema first; one code path, no wasted call.
- M2: The plan route issues a signed, stateless forge ticket bound to the photo and the validated candidates. Render and verify require it, so the image model cannot be driven with arbitrary instructions through our API.
- M2: Render retries are orchestrated by the client loop (`src/lib/forge/run.ts`), not inside the route: each request stays under 60 s and every rejected attempt shows up in the agent timeline. At most 3 image calls per forge.
- M2: The verifier's verdict is turned into accept or reject by `judge()`: safety flags always reject; visible artifacts are tolerated only at difficulty 1 and 2.
- M2: If the image model rejects PNG output with HTTP 400, the edit is retried once asking for JPEG (the SDK types list JPEG only, the docs list both).
- M2: A blur fast path computes only the bounding box of non-zero input; masks and change maps are sparse and this cut compositing time by about 5x.
