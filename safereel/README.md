# SafeReel

SafeReel is an isolated NorthStar Ventures family video player prototype.

## Current preview

- Plays a video selected from the current device using a local object URL. The video file is not uploaded.
- Lets the viewer create review flags, approve them, and verify mute/blackout behavior.
- Stores no video or user data on the Worker.
- Does not claim to perform AI analysis yet. The protected AI scanning pipeline is the next implementation stage.

## Files

- `index.html` — browser UI and local playback/filter prototype.
- `worker.js` — bundled Cloudflare Worker deployment entrypoint.
- `build_worker.py` — regenerates the Worker HTML bundle from `index.html`.

Regenerate before deployment with `python safereel/build_worker.py`.
