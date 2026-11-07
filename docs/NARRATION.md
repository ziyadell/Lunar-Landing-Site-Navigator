# Narration: welcome, Audio Guide and guided tour

All narration is **optional** and **off by default**:

- Nothing plays without a click.
- Nothing audio-related loads at startup.
- No paid API is ever called from the browser.

## How it works

| Piece | File | Notes |
|---|---|---|
| Scripts (single source of truth) | `src/audio/narration.json` | The same text feeds the transcripts and the generated clips, so they cannot drift apart. |
| Engine | `src/audio/engine.ts` | One narration at a time. Picks the narrator clip if it exists, otherwise the browser's own voice, otherwise transcript only. |
| Interface | `src/audio/ui.tsx` | Listen buttons, the floating player and the welcome. |
| Guided tour | `src/audio/tour.ts` | Five steps, each a real camera or mode action plus its narration. |
| Settings | Settings drawer | Audio Guide on/off, voice (Narrator / Browser voice), speed (1×, 1.25×, 1.5×), transcripts, start tour, replay welcome. Saved in `localStorage`. |
| Clip generation | `scripts/generate-narration.mjs` | Run once at development time. |

**The player:**

- Play/pause, replay, progress, speed, mute and a transcript (CC).
- In the tour it also shows the step number and Next/Finish.
- Starting a new narration stops the previous one.
- A region narration stops when another region is selected; the tour is the exception.

**Calculated readings ("Conditions now"):**

- Built from the live, validated app state at the moment you press listen.
- Labelled *Calculated now* and always read by the browser voice. They are never
  pre-recorded, because the values change with time.
- They end by stating that Earth line of sight is not a guaranteed communication link.

**Welcome:**

- On a first visit, a small *Enter mission* card sits over the already-rendered Moon.
- Choosing it does three things:
  - the camera makes a slow approach (none under reduced motion);
  - the greeting plays;
  - the interface reappears after the greeting, after 7 s at most, or at once on any click or key.
- *Skip* and *Mute* are always visible.
- *Explore without sound* dismisses it.
- It never replays unless *Replay welcome* is chosen in Settings.

## Generating the narrator clips (ElevenLabs)

This build ships **without** narrator clips, because no ElevenLabs credentials were
available. Until clips exist, the same scripts are read by the browser's own voice
(Settings → Voice; with no clips, the *Narrator* setting falls back to it). The welcome
then shows its caption with the browser voice, or text only where speech synthesis is
unavailable.

**To add the narrator:**

1. Choose a voice you are licensed to use commercially: an ElevenLabs library voice under
   your plan's terms, or a voice you created yourself.
   - Do not clone a real person without written consent.
   - Do not imitate a NASA announcer.
   - Suggested direction: calm, cinematic, slightly deep, warm, natural English
     pronunciation, no effects.
2. In a terminal (the key stays in your environment; never commit it or put it in `.env`
   files that are deployed):

   ```bash
   ELEVENLABS_API_KEY=your_key ELEVENLABS_VOICE_ID=your_voice_id node scripts/generate-narration.mjs
   ```

   - `--dry-run` lists what would be generated.
   - `--only welcome,orbit-intro` limits the run.
   - `--force` regenerates everything.
   - Unchanged clips are skipped (hash of voice, model and text).
3. The script writes `public/audio/narration/<id>.mp3` (mono, 22 kHz, 32 kbps) and
   `manifest.json`. Commit both and redeploy. The app uses the clips automatically.

**Size and cost:**

- 24 clips, 7,150 characters in total, which is a small one-off credit cost on any paid
  plan.
- At 32 kbps the whole set is roughly 0.9 MB. The welcome is about 15 KB.
- Clips download only when played and are then cached by the browser.

**Licensing note for the record:**

- Keep a copy of the ElevenLabs terms in force when you generate, and the voice's licence.
- The scripts are original text written for this project.

## Scripts and sources

The full text is in `src/audio/narration.json`.

**Facts and their sources:**

| Fact used in narration | Source |
|---|---|
| Nine Artemis III candidate regions, names | NASA release, 28 Oct 2024; George et al., LPSC 2026 #1901 |
| Region outlines, sizes, "closest to the pole" | NASA's official region map, digitised here (docs/REVIEW.md §1) |
| Some south-polar crater floors never receive direct sunlight and can hold water ice | NASA LRO and LCROSS results (NASA Science, *Moon's south pole*) |
| LCROSS struck Cabeus in October 2009 and detected water | NASA LCROSS mission results (Colaprete et al., *Science* 330, 2010) |
| Crater and mountain sizes (Cabeus B 59.6 km, Haworth 51.4 km, Mons Malapert 67 km, Mons Mouton 130 km, Nobile 79.3 km, de Gerlache 32.7 km, Slater 25.1 km) | IAU Gazetteer of Planetary Nomenclature; Slater from secondary sources (see sites.json) |
| Name origins: Charles Malapert; Melba Roy Mouton (NASA mathematician); Umberto Nobile; Adrien de Gerlache; David C. Slater (SwRI) | IAU Gazetteer feature descriptions; SwRI release (2015) for Slater |
| Haworth floor permanently shadowed | LRO / LOLA illumination studies of the south pole |
| Sunlight shares per region (for example "about 63 percent of 2027") | **This app's calculation** at its observation point (LOLA skyline, JPL Horizons). Stated as such in each script. |
| "Highest" and "lowest" share among the nine | This app's calculation (Mons Mouton 66.8 %, Nobile Rim 2 50.6 %) |

**Claims deliberately not made:**

- No landing-site recommendation.
- No communication availability; Earth is always described as *line of sight*.
- No crater depths or ages.
- No continents on Earth.
- Nothing about cancelled missions.

**If an observation point changes:** if `preprocess/process_dem.py` is re-run with new
points, the percentages in the region scripts must be updated and the clips regenerated.
