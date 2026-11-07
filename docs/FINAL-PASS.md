# Final refinement pass (November 2026)

Branch `review`. Production (`main`, https://lunar-landing-site-navigator-six.vercel.app) is
unchanged.

## What changed

| Area | Change |
|---|---|
| Opening | *Enter mission* plays a quiet chime of about 2.6 s (synthesised with Web Audio: a low chord and two soft tones). It fades out fully, then the welcome begins with captions: "Welcome to Lunar Navigator. Explore the south pole. …". The words "Mission briefing" are not used. Skip intro, Mute/Unmute and Explore without sound all work; there is a hard limit of 20 s. |
| Mission guide | Visible by default after the opening, and kept in focus mode. It offers Explain this view, a 12-step Full tour and Browse topics. The player has Play/Pause, Replay, Stop, speed, Mute and captions, and labels the source honestly. On phones it sits in the control column; on Analysis it sits in the page header. |
| Tour | Twelve steps. Each waits for its view to be ready: the first frame of a scene, the lazily loaded page, or the element it describes. Pause never advances. Next, Back, Replay and Exit cancel older callbacks. |
| Narration | Text is in American English. The device voice is used only when it is `en-US`; otherwise captions are shown and the reason is stated. Sentence splitting keeps decimals intact. Fallback happens only once. Manifest and recordings have time limits. Mute keeps playing silently. The ElevenLabs script checks the voice accent, resumes after an interruption, and skips unchanged clips. |
| Scenario controls | A theme-consistent dropdown (listbox) on desktop, and the native picker on touch devices. Date, duration presets and *More durations* line up in both cards. Dates remain in UTC and are clamped to the ephemeris coverage. |
| Incomplete intervals | When a longest interval touches the start or end of the period (including a tie), it is a lower bound (≥). No winner is declared in the cards, the table shows n/a, the text explains why, and the CSV header records it. |
| Degree readings | The value-change background flash is removed: there is no remount and no animation. Digits are tabular, so widths stay stable. |
| Scrollbars | Dark track and rounded thumb, with no arrow buttons. Firefox uses the standard properties. Forced-colors mode is respected. |
| Stars | A restrained brightness and size increase, with additive blending and size matched to the real pixel ratio. Catalogue positions are unchanged. |
| Logo and favicon | The header and loading screen use the original first-release mark again. `public/favicon.svg` is the same artwork; the old generic data-URI icon is removed. |
| Loading | Core data is fetched once (StrictMode-safe). The validation record loads when the browser is idle. Failed terrain fetches are forgotten so a retry works. URL sync and its timer are cleaned up. Fonts are Latin subsets only. |
| Recovery | The terrain worker falls back to the main thread if it times out or fails. Terrain errors offer Retry, and a stalled Surface View gets a notice after 25 s. A real GPU context loss rebuilds the view; if it fails repeatedly, the app explains and offers Reload. |

## Testing

| Check | How | Result |
|---|---|---|
| TypeScript (`tsc -b`) | local | pass |
| Production bundle (`vite build`) | local, without public data (disk) | pass |
| Interval logic (6 cases, including ties at both ends) | esbuild + node | 6/6 pass |
| Sentence splitting (decimals, trailing fragment) | esbuild + node | 4/4 pass |
| Chime, then voice, with no overlap | browser pane, instrumented | Chime at 0.42 s; first sentence at 3.30 s; AudioContext closed |
| Skip during the chime | browser pane | No speech; interface restored |
| Mute/Unmute during the voice | browser pane | Continues silently; resumes at the current sentence |
| Pause/Resume/Replay/Stop | browser pane | pass |
| No American voice | browser pane, en-US voices hidden | Captions only, with the reason stated; nothing spoken |
| Broken recording | browser pane, fake manifest | Exactly one fallback |
| Stale calculated reading | browser pane | Stops on a time or region change |
| Tour: pause holds; rapid Next | headless Edge | pass |
| Tour: Surface and Analysis readiness | headless Edge | pass after a fix (see below) |
| Dropdown: keyboard, Escape, outside click, focus | headless Edge | pass |
| Phone 390×844 and 375×667, tablet 820×1180 | headless Edge with touch emulation | No overlaps; no horizontal scroll |

### Regressions found and fixed during testing

1. Leaving a view releases its WebGL context on purpose. The first version of the recovery
   code mistook this for a GPU failure and rebuilt the scene, which kept Surface View black.
   It now reacts only to the canvas on screen.
2. The dropdown did not move focus into its list, because the list had not yet been
   positioned. Fixed.
3. The guide covered the time controls on phones and the Analysis text on desktop. It now
   sits in the layout flow.

## Deployment state

| Where | State |
|---|---|
| Local | Matches the commit below. |
| GitHub | Branch `review`, commit `8de50d2` (pushed). |
| Preview | https://lunar-landing-site-navigator-e4yensxel-nexora-5cbe.vercel.app (Ready; behind Vercel login). Vercel's build passed (`tsc -b && vite build`, 118 modules). |
| Production | Unchanged. `main`; `/favicon.svg` returns 404 there, as expected. |

**Checked on the deployed preview over HTTP** (`vercel curl`):

- The JS and CSS hashes match the local build.
- The deployed bundle contains the new welcome text and no "Mission briefing".
- The flash animation is gone from the CSS; the scrollbar, dropdown and guide styles are present.
- The favicon link is present, and `favicon.svg` is byte-identical to the original artwork.
- The data files return 200.
- `audio/narration/manifest.json` returns 404, as expected, since no recordings exist yet.

**Not yet checked in a browser on the deployed preview:** WebGL, the opening timeline,
the guide and tour, the dropdowns and the layouts. These were tested on the local dev
server, which runs the identical code. The interactive checks on the preview need a Vercel
login in the in-app browser.

## Not verified

- No physical phone or tablet: only emulation.
- No audible listening. Audio was verified by instrumentation: timings, AudioContext state
  and speech calls.
- No real-GPU frame rates or stars on a calibrated display. Headless runs use SwiftShader;
  the browser pane had a real GPU but lost its WebGL context under memory pressure on this
  machine.
- Safari and Firefox were not run.
- **Recorded ElevenLabs narration does not exist yet.** It needs your API key and an American
  voice ID (see `docs/NARRATION.md`). Until then the guide uses an `en-US` device voice or
  captions, and says so.
