# SafeReel

SafeReel is an isolated NorthStar Ventures family video player prototype.

## Current preview

- Plays a video selected from the current device using a local object URL. The full video file is not uploaded.
- Accepts a matching `.srt` subtitle file, analyzes time-coded captions with surrounding dialogue, and groups findings by category.
- Without subtitles, captures short audio chunks for time-coded transcription. Both paths check a custom vocabulary list.
- Samples video frames for possible sexual/nudity flags, then shows reviewable time ranges.
- Requires an access password. During scanning, only caption text or audio chunks and sampled frames are sent through the Worker to OpenAI.
- Every finding starts in review state. The viewer chooses which entries to filter; approved entries mute dialogue or black out the scene.
- Does not store videos or scan results on the Worker.

## Files

- `index.html` — browser UI and local playback/filter prototype.
- `worker.js` — bundled Cloudflare Worker deployment entrypoint.
- `worker.template.js` — authenticated API, transcription, and moderation routes.
- `build_worker.py` — regenerates the Worker HTML bundle from `index.html`.

Regenerate before deployment with `python safereel/build_worker.py`.
