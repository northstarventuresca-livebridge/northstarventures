# Polaris Context-Aware Assistant — Product Blueprint

## Goal
The user wants a relational, low-noise Jarvis-like personal assistant that understands context across NorthStar projects and daily life. This is **not** a default daily reminder calendar. It should follow up once when something is genuinely unresolved, learn from explicit answers, and avoid confidently claiming inferred facts.

## Example intents
- While visiting a previously named storage unit: "You're here—anything you needed to pick up for the church or Monica's House?"
- For a shopping context: "You mentioned looking for a vanity on sale. You're at RONA now; still worth checking?"
- After a bring list and no confirmed completion: "Did you manage to bring the mop and bulbs? Done or another day?"
- For a calendar commitment: "Staff meeting starts at 5. You're still at home; want a leaving reminder?" Calendar source and travel assumptions must be verified before stating a deadline.
- For a stalled project or security test: "We haven't checked back on the HOH security test. Table it or schedule a follow-up?"
- For an opt-in home camera: Detect a carried mini fridge (object detection), then *ask* about it, never claim its purpose.

## Evidence and permission model
1. Verified user action or connected-data status: eligible for factual language ("marked complete").
2. Current calendar event or geofence: eligible for cautious prompts ("it looks like you're at...").
3. Inferred behaviour, incomplete chat thread, or object detection: questions only; never assert that a task was forgotten or completed.
4. Do not retain raw SMS chats, health data, location trails, camera video, or faces without explicit, separately revocable scope.
5. Allow a one-tap **Pause proactive prompts** and a way to inspect and delete stored personal context.
6. For shared-home cameras, require explicit camera selection, visible collection status, time/zone limits and appropriate consent of people who may appear. Prefer local inference, discard raw frames and transmit only approved event metadata.

## Current status (v0.2 test)
- Authenticated Polaris Memory and scoped Android pairing: deployed.
- On-device saved Home, jobsite, store and storage locations; geofencing: built.
- Quiet hours, daily prompt budget, storage-unit weekly check-ins, and one incomplete-list follow-up: built into APK beta.
- Defer reminder three days through authenticated server API: deployed.
- Default morning reminders off; only time-specific "bring" items qualify if opted in.
- Notifications speak *after tapping*, not unsolicited in the room.
- Users must explicitly mark saved locations; this version does not yet autonomously identify unknown businesses or activities.

## Next capabilities (independent opt-ins, not yet built)
- **Known places from recurring stops:** low-frequency on-device significant movement; cluster repeated stops, ask user to name them; no automatic business labeling absent a places-data provider. Must control battery usage and privacy.
- **Calendar commitments:** connect the correct user calendars, distinguish recurring events from actual attendance, check conflict/departure context and travel-time estimates, then present only timely reminders.
- **Health Connect sleep/wake cues:** permission-gated, local coarse awake window; do not ingest medical metrics or infer health diagnoses.
- **Selected message reminders:** optional notification listener for user-approved message apps/conversations; never silently collect every message; opt-out and short retention.
- **Project continuity:** verified GitHub and Cloudflare action history, unresolved tests and user's requested follow-ups; ask if they want to table/resume, not auto-schedule every task.
- **Opt-in camera event adapter:** local object recognition and human-in-the-loop event approval; privacy controls; no constant stream to Polaris.
- **Learning reminder style:** per-topic suppression, preferred timing, 'done', 'not yet', 'check in a few days'; learn from feedback rather than maximizing notification volume.

## Hard limits
Android geofences may arrive minutes late or fail under battery restrictions/force-stop. Without wake/sleep or calendar integrations, Polaris cannot know when the user wakes or whether they are about to leave. Without a camera signal it cannot see objects entering a room. Without explicit app permissions it cannot read texts/fitness data.
