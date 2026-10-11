# Demo script

Target length 2:45 to 2:50. Hard limit 3:00. Record at 1920 x 1080, browser zoom 100%, bookmarks bar hidden.

## Before recording

- Deck is seeded and deployed. `/api/health` reports `"liveForge": true, "mock": false`.
- Open three tabs: `/?demo=1`, `/forge`, `/classroom?seed=demo`.
- On `/profile` press "Reset profile", then play two forge rounds badly on purpose (miss two text edits) so the radar has a visible weak spot. Leave the profile like that.
- Have one own photo ready on the desktop: a scene with several objects and a sign with text, no people.
- Do one full dry run. A forge takes 40 to 90 s; the waiting part is cut in the edit (marked below).
- Know where the edit is on the hero card and on the first classroom card.

## Script

### 0:00 to 0:15 Hook

Screen: `/?demo=1`, the two photos.

> "One of these photos was edited by AI ten seconds ago. Which one?"

Pause one second. Click the wrong photo on purpose.

> "Wrong. It was this one."

The heatmap fades in. Hover over the red area.

> "And this is exactly what changed. Every pixel."

### 0:15 to 0:35 Problem

Screen: stay on the reveal, slowly scroll to the three mode cards.

> "Anyone can edit any photo in seconds now. We still teach media literacy with a few static examples that people memorize. Companies train employees with simulated phishing mails. Nobody trains people with simulated image fakes. Fake Dojo does. Personal, and adaptive."

### 0:35 to 1:35 Live forge

Click "Forge your photo" (tab 2). Click "Upload a photo", choose the prepared photo.

> "This is my own photo. I upload it, and an agent goes to work."

The agent timeline fills. Point at the black bars.

> "It reads the scene, plans one edit and forges it. The plan is redacted so it does not spoil the answer."

If a rejected attempt appears, point at the red line.

> "Here the verifier rejected the first attempt, so the agent tried again."

_Cut here: remove the waiting time, keep about 6 seconds of timeline._

The hunt appears. Zoom in with the wheel, switch on the loupe, tap a wrong spot.

> "Now I only see the forged photo. Two guesses. That was a miss."

Tap the right spot. The reveal appears.

> "Found it. The reveal shows the ground-truth heatmap."

Drag the before and after slider twice.

> "Before, after."

Point at "The tell".

> "It tells me how I could have caught it."

Click ELA, then Noise.

> "And these are forensic lenses, written from scratch: error level analysis and noise residual. The edit glows."

Scroll to the agent log. The bars have slid away.

> "After the reveal the agent log is unredacted: what it planned, what it rejected, how long each step took."

### 1:35 to 2:00 Adaptive training

Click "Profile".

> "Fake Dojo tracks six kinds of manipulation. I am weak at altered text."

Point at the radar, then at the belt.

> "So the next forgery targets exactly that, and the difficulty goes up when I hit twice in a row."

### 2:00 to 2:20 Classroom

Switch to tab 3, press F for fullscreen. The countdown runs.

> "I lead my school's AI club. This is Classroom mode: the class votes by raising hands."

The reveal appears.

> "Edited. We will train with this next week."

### 2:20 to 2:40 How it works

Press F to leave fullscreen, open "How it works", show the pipeline diagram.

> "Seed 2.0 Lite reads and plans. Seedream 4.0 forges. Our own compositing makes the answer key pixel-exact. The forensics are written from scratch. And people are never edited: that is enforced in code, three times."

### 2:40 to 2:50 Close

Back to the landing page headline.

> "When AI can image everything, train your eye. Fake Dojo."

## If something goes wrong while recording

- Live forge fails: the page offers "Play a pre-forged card instead". Use it and record the forge segment again later.
- Rate limit reached: wait for the hour to pass or raise `LIVE_FORGE_PER_IP_PER_HOUR` for the recording.
- The edit is too obvious or too hard: set the difficulty by hand to 3 on the forge page before uploading.
