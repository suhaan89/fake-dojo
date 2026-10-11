# Fake Dojo

**Tagline:** Train your eye for AI fakes. On your own photos.

**GitHub:** https://github.com/suhaan89/fake-dojo
**Live URL:** https://fake-dojo.vercel.app
**Video:** _to be filled in by Suhan_

## Description (one paragraph)

Fake Dojo is a training gym for the AI image era. An AI agent hides one subtle, realistic edit in a real photo, yours or one from the deck. You hunt for it. Then a forensic reveal shows the exact changed pixels, the tell you could have spotted, and what forensic lenses show. The dojo learns which manipulations fool you and targets them next. A projector mode lets a whole class train together.

## Write-up

### Inspiration

I lead the AI club at my high school in Germany. We talk about using AI wisely, and the hardest lesson to teach is doubt. Companies train staff with simulated phishing mails. Nobody trains people with simulated image fakes. Static examples get memorized, so I wanted fakes that are personal and never repeat.

### What it does

You bring a photo. An agent reads the scene, plans one small edit, forges it and checks its own work. You see only the forged image and get two taps to find the edit. The reveal shows a pixel-exact heatmap, a before and after slider, the tell, and three forensic lenses. Points, belts and a skill radar track six manipulation types, and the next forgery leans toward your weakest one. Daily Dojo and Classroom mode run from a pre-forged deck with zero API calls. In Classroom the camera counts raised hands on the device, so a whole class can vote Real or Edited without touching anything.

### How we built it

Next.js, TypeScript and BytePlus ModelArk. Seed 2.0 Lite plans and verifies with JSON answers that the server validates. Seedream 4.0 performs the edit. Gemini is an optional provider. The core is our own computer vision in pure TypeScript: the model output is registered to the original by shift search, tone-matched from a ring around the region, and blended through a feathered mask. Because we composite ourselves, the difference to the original is an exact answer key. ELA, noise residual and Sobel lenses are written from scratch and run in a Web Worker.

### Challenges

Image models repaint the whole picture, so a naive diff lights up everywhere. Registration, tone matching and masked compositing fixed that. Keeping people out of every edit needed three layers: prompt rules, server-side geometry checks and a verifier flag. Stopping the render route from becoming an open image editor needed signed tickets.

### Accomplishments

A self-correcting agent loop whose rejected attempts are visible. A redacted agent log that un-redacts on reveal. 138 tests. A labeled forgery-localization dataset as a by-product of the deck.

### What we learned

Forensic tools are clues, not proof: at high difficulty a little noise silences them. Training the eye matters more.

### What's next

Teacher dashboards, C2PA provenance, a browser extension, more manipulation types, and a localization model trained on the generated dataset.

## Built with

Next.js, React, TypeScript, Tailwind CSS, BytePlus ModelArk, Seed 2.0 Lite, Seedream 4.0, Google Gen AI SDK (optional Gemini provider), zod, sharp, Vitest, Web Workers, Canvas API, Vercel

## AI disclosure

Claude Code wrote most of the code under Suhan's direction. At runtime Seed 2.0 Lite plans and verifies and Seedream 4.0 performs the edits, both through BytePlus ModelArk. Gemini is an optional provider. All code was written during the hacking window.
