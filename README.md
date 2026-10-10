# Fake Dojo

Train your eye for AI fakes. On your own photos.

Built during Banana Hacks 2026 (Oct 10 to 11, 2026) by Suhan Nawaz.

An AI agent forges one subtle, realistic edit into a real photo. You hunt for it. Then a forensic reveal shows exactly which pixels changed, how a careful eye could have caught it, and what forensic tools would have shown.

## Run locally

```
npm install && npm run dev
```

Mock mode works without an API key. For live forging, copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`.

## AI disclosure

Claude Code wrote most of the code under Suhan's direction. Gemini models run at runtime.

The full write-up (pipeline, forensic methods, safety, credits) is added as the build progresses during the hackathon.
