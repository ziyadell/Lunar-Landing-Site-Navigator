# Narration: opening, Mission guide and guided tour

Nothing plays without a click. No paid speech API is ever called from the browser.

## How it works

| Piece | File | Notes |
|---|---|---|
| Scripts (single source of truth) | `src/audio/narration.json` | 31 items, written in American English. The same text feeds the captions and the generated clips. |
| Engine | `src/audio/engine.ts` | One narration at a time. Recorded clip, then an American English device voice, then captions only. |
| Interface | `src/audio/ui.tsx` | Mission guide (launcher, menu and player), listen buttons, and the opening. |
| Guided tour | `src/audio/tour.ts` | Twelve steps. Each step performs an app action, waits until that view is ready, then narrates. |
| Settings | Settings drawer | Listen buttons on/off, voice (Recorded / Device voice / Captions), speed, captions, tour, replay the opening. |
| Clip generation | `scripts/generate-narration.mjs` | Run once at development time, with your own ElevenLabs key. |

### Opening (Enter mission)

1. *Enter mission* (a click) starts a quiet chime of about 2.6 s. It is synthesised in the
   browser with the Web Audio API: a low A-major chord that swells and fades, plus two soft
   communication tones. There is no audio file, so no licence is needed.
2. The chime fades out completely. About 0.25 s later the welcome narration starts, with
   captions:

   > Welcome to Lunar Navigator. Explore the south pole. Follow the sunlight. Find a view of
   > Earth. Your mission begins now.
3. *Mute/Unmute* applies to both the chime and the voice. *Skip intro*, or any click or key
   elsewhere, ends the opening at once: timers, chime and narration are all cancelled.
4. A hard limit of 20 s ensures the opening can never block the app. *Explore without sound*
   skips it entirely. Under reduced motion, the camera approach is skipped.

### Mission guide

After the opening, a *Mission guide* button is always visible: bottom right in Orbit and
Surface (also in focus mode), and at the end of the page in Mission Analysis. It offers:

- *Explain this view*: the narration for the current view.
- *Full tour*: twelve steps covering:
  1. the Moon;
  2. navigation;
  3. the south pole;
  4. a region;
  5. time and playback;
  6. Sun and Earth readings;
  7. Surface View;
  8. surface controls and layers;
  9. Mission Analysis;
  10. comparing scenarios;
  11. CSV export;
  12. data sources and limits.
- *Browse topics*: views, the nine regions, and terms.

The player has Play/Pause, Replay, Stop, speed (1×, 1.25×, 1.5×), Mute and captions (CC).
It always says which source is in use:

- *Recorded narrator*;
- *Device voice · US English*;
- *Captions only*.

When a preferred source is missing, it also gives the reason, for example "Recorded narration
not installed" or "No American English voice on this device".

### Rules the engine enforces

- **No silent substitution.** Only `en-US` device voices are used. When none is available,
  captions are shown, timed to reading speed, and the reason is stated.
- **Stale callbacks.** Every callback carries the token of the narration that created it. A
  newer narration, Stop, Next, Replay or Exit invalidates all older ones.
- **Single fallback.** When a recording fails, the error event and the rejected `play()`
  can both fire; the engine falls back only once.
- **Time limits.** The manifest times out after 4 s and a recording after 8 s.
- **Speech that never ends.** Device speech runs one sentence at a time, each with its own
  watchdog.
- **Sentence splitting.** Text splits only at `.`, `!` or `?` followed by a space, so
  decimals such as 2.31 and a final fragment without punctuation stay intact.
- **Pause and Mute.** Pause stops at the current sentence and Play continues from there.
  Mute never pauses: the narration continues silently, and Unmute resumes speaking at the
  current sentence.
- **Tour pacing.** Pausing the tour never advances it. A region or time change stops a
  calculated reading or a region narration that no longer matches the screen (the tour is
  exempt).

### Calculated readings

*Conditions now* is built from the live, validated app state. It is labelled *Calculated
now*, read by the device voice, and never pre-recorded.

## Generating the recorded narrator (ElevenLabs)

**This build ships without recorded clips**, because no ElevenLabs credentials were
available. Until they exist, the guide uses an American English device voice or captions,
and says so.

1. Choose an **American English** voice you are licensed to use: an ElevenLabs library voice
   or your own.
   - Do not clone a real person without consent.
   - Do not imitate a NASA announcer.
2. Check the voice. The script reads its labels and refuses a voice not labelled
   American:

   ```bash
   ELEVENLABS_API_KEY=your_key ELEVENLABS_VOICE_ID=your_voice_id node scripts/generate-narration.mjs --check-voice
   ```

   If ElevenLabs has no accent label for the voice, listen to it, and only then add
   `--accept-voice`.
3. Generate the clips:

   ```bash
   ELEVENLABS_API_KEY=your_key ELEVENLABS_VOICE_ID=your_voice_id node scripts/generate-narration.mjs
   ```

   - Only missing or changed clips are generated. The hash covers the text, voice, model,
     format and settings.
   - Progress is saved after every clip, with atomic writes, so an interrupted run resumes.
   - `--dry-run` lists the work: 31 clips, 9,421 characters.
   - `--only id1,id2` limits the run; `--force` regenerates everything.
4. Commit `public/audio/narration/*.mp3` and `manifest.json`, then redeploy. The key stays in
   your shell environment. Never put it in code or in deployed `.env` files.
