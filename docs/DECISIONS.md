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
- M3: Hunt markers are plain rings with a dot, not numbered badges, to follow the design rule against circled-number badges.
- M3: Forensic lenses run in a Web Worker (ELA re-encodes through OffscreenCanvas) with the same functions as a main-thread fallback; results are cached per image as object URLs.
- M4: The landing hero shows the original and the forged version of the same deck card side by side. Same scene, one difference, and the heatmap reveal needs no API call.
- M4: Deck cards carry a `photo` id and a session never shows two cards of the same photo while the deck is large enough, because seeing a scene twice gives the answer away.
- M4: The seed script refuses to build a deck with the mock provider unless `--allow-mock` is passed (UI testing only). A mock deck would be fake data presented as real.
- M4: Deck images are served without a burned-in label because a visible label would give away the Real or Edited call. The app offers no way to save or share a card; the deck consists of Suhan's own harmless scenes.
- M4: Classroom reveals automatically when the 10 second countdown ends; Space reveals early and Right arrow reveals or moves on.
- M4: An empty `public/deck/deck.json` is committed until the photos arrive, so the deck modes show a clear empty state instead of a 404.
- Post M6: Added Seedream 4.0 on BytePlus ModelArk as an optional image editor (`IMAGE_PROVIDER=seedream`) because Suhan wants to use its free quota. Gemini still reads, plans and verifies. The edit is requested at 1.5x size (Seedream minimum is 1280x720 pixels) and scaled back by the existing resize step. SynthID statements in the UI now appear only when Gemini makes the image.
