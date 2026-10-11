# Pitch Q&A

Short answers to likely judge questions.

### 1. Isn't this a fake generator?

It generates one small, harmless edit in a scene and then immediately shows you where it is. It never edits people, refuses documents and IDs, offers no download for live forgeries and stores nothing. It is the image equivalent of a phishing simulation: a controlled fake whose only purpose is the lesson that follows.

### 2. Why not just build a detector?

Detectors lose the arms race and nobody has one at hand when a photo arrives in a group chat. The reveal makes that point itself: at difficulty 4 and 5 a little noise and re-compression silence the forensic lenses. A trained eye and a habit of doubt go everywhere with you. Fake Dojo trains the human, and uses detection methods as teaching tools.

### 3. How do you know exactly where the edit is?

We never show the raw model output. We take only the planned region from it and blend it into the untouched original with a feathered mask, after registering it and matching its tone. Everything outside the mask is the original pixel. The difference between original and result is therefore the ground truth, not an estimate. It scores taps and draws the heatmap.

### 4. What does it cost to run?

One forge is one image output, 0.03 USD on Seedream 4.0, plus two cheap vision calls on Seed 2.0 Lite. Retries are capped at three image calls. Daily Dojo, Classroom and the landing page cost nothing because they run from a pre-forged deck. There is a per-IP hourly limit, a daily cap and a kill switch.

### 5. What happens to my photos?

They are cropped, resized and stripped of EXIF and GPS in your browser. The prepared image is sent to our server and to BytePlus ModelArk for the forge, held in memory for that request and never written to disk or a database. Server logs contain timings and status codes only. Your score lives in your browser's local storage.

### 6. How is this more than an API wrapper?

The models are two steps of seven. Ours are: server-side plan validation with geometry checks against people, shift-search registration, ring-based tone matching, masked compositing, the change map with morphology, difficulty-dependent trace hiding, three forensic lenses from scratch in a Web Worker, a Beta-distribution skill model, a self-correcting retry loop, and signed tickets that stop the API from being used as an open image editor. 159 tests cover it.

### 7. Who will use it after the weekend?

My school's AI club first: students from grade 8, weekly sessions. Classroom mode needs a projector and nothing else, no accounts and no data. After that, any teacher who covers media literacy, and anyone curious enough to test themselves on their own photos.

### 8. What was the hardest technical problem?

Image models repaint the whole picture. Colors drift a little, the frame moves by a few pixels. Paste that back naively and you get a visible seam, and a diff that lights up everywhere. Registration, tone matching from a ring around the region, and a feathered composite solved it, and gave us the exact answer key as a bonus.

### 9. How do you stop misuse?

Three layers for people: the planner is told never to touch them, the server rejects any region within 5% of the image width of a detected person, and a verifier discards results where a person changed. Sensitive documents are refused before any edit. Text edits are limited to neutral content. The render route only accepts instructions the server validated and signed. And there is no download button.

### 10. What would you build next?

Teacher dashboards that show a class's weak spots without student accounts. C2PA content credentials next to the lenses. A browser extension that turns any image into a training round. And a small localization model trained on the dataset the deck generates, benchmarked against ELA.

### 11. Why would the forgeries be good enough to learn from?

A verifier model rates every forgery for plausibility and visible artifacts, and sloppy attempts are rejected and redone. Difficulty controls the size and subtlety of the edit and whether forensic traces are left in or hidden. Easy levels are meant to be findable. That is how training works.

### 12. Does the adaptivity really do anything?

Yes, and you can see it. Each manipulation type has a skill estimate, the mean of a Beta distribution over your hits and misses. The planner receives the normalized weaknesses as weights and prefers those types when the photo allows it. Two hits in a row raise the difficulty, a miss lowers it. The profile page shows all of it.

### 13. What did AI write and what did you do?

Claude Code wrote most of the code under my direction: I defined the product, the pipeline, the rules and the design, reviewed the result, took the photos and tested it with real forgeries. At runtime Seed 2.0 Lite plans and verifies and Seedream 4.0 edits, both through BytePlus ModelArk. Gemini is an optional provider. This is disclosed in the README and here.
