# Narration review (voice generation pass)

All scripts live in `src/audio/narration.json`. Captions use the same text, so audio and captions stay in sync. Filenames are unchanged (`<id>.mp3`).

## Verified against project data

These were checked against `public/data/sites.json`, `validation.json`, `ephemeris.json` and the app code:
- **Sun share of 2027 (all 9 regions):** 57.9, 55.9, 63.1, 55.4, 66.8 (highest), 64.2, 50.6 (lowest), 58.0 and 62.4%. All match the scripts.
- **Crater and mountain sizes:** Haworth 51 km, Mons Malapert 67 km, Nobile 79 km, de Gerlache 33 km, Slater 25 km.
- **Outline sizes:** Mons Mouton Plateau 78 x 58 km; Haworth about 30 km.
- **Observation point:** 2 m above the ground; skyline traced to 150 km.
- **Sampling:** every 15 minutes, or every hour beyond 60 days; ten metrics.
- **Playback speeds:** 1 h/s, 6 h/s and 1 d/s.
- **Geometry:** Nobile Rim 1 lies west of Nobile; Rim 2 lies north of it.

## Flagged: removed because the project data does not support them

Add these back only with a cited source:
- Some crater floors never receive sunlight and are cold enough to hold water ice (orbit-intro, tour-pole, Nobile Rim 1).
- LCROSS struck Cabeus in 2009 and detected water (Peak near Cabeus B).
- Haworth crater floor is permanently shadowed (Haworth).
- Name origins: Charles Malapert, Melba Roy Mouton, Umberto Nobile, Adrien de Gerlache, David Slater.

## Changed scripts (before, after)

### orbit-intro
*Reason:* Removed an unsupported claim (crater floors cold enough to hold water ice; not in project data).

- **Before:** This is the Moon, shown with imagery from NASA's Lunar Reconnaissance Orbiter. Near the south pole the Sun never climbs far above the horizon, so long shadows shape the landscape. Some crater floors here never receive direct sunlight, and they are cold enough to hold water ice. Nearby rims and peaks, by contrast, can stay sunlit for much of the year. NASA has named nine candidate regions for the Artemis Three landing. This app measures, from real terrain data, when each of them can see the Sun and the Earth.
- **After:** This is the Moon, shown with imagery from NASA's Lunar Reconnaissance Orbiter. Near the south pole the Sun never climbs far above the horizon, so long shadows shape the landscape. Some rims and peaks can stay sunlit for much of the year. NASA has named nine candidate regions for the Artemis Three landing. This app measures, from real terrain data, when each of them can see the Sun and the Earth.

### region-peak-near-cabeus-b
*Reason:* Removed an unsupported claim (LCROSS 2009 impact and water detection; not in project data).

- **Before:** Peak near Cabeus B is a candidate region on high ground near the crater Cabeus B, about eighty-four degrees south. Its neighbor, the crater Cabeus, is where NASA's LCROSS mission struck the Moon in 2009 and detected water in the material it threw up. At the observation point this app uses inside NASA's outline, the center of the Sun clears the measured skyline for about fifty-eight percent of 2027.
- **After:** Peak near Cabeus B is a candidate region on high ground near the crater Cabeus B, about eighty-four degrees south. At the observation point this app uses inside NASA's outline, the center of the Sun clears the measured skyline for about fifty-eight percent of 2027.

### region-haworth
*Reason:* Removed an unsupported claim (permanently shadowed crater floor; not in project data).

- **Before:** The Haworth region lies on terrain beside Haworth crater, about fifty-one kilometers across, whose floor is permanently shadowed. At roughly thirty kilometers across, its outline is one of the larger ones NASA has drawn. At the observation point this app uses, the center of the Sun clears the measured skyline for about fifty-six percent of 2027.
- **After:** The Haworth region lies on terrain beside Haworth crater, about fifty-one kilometers across. At roughly thirty kilometers across, its outline is one of the larger ones NASA has drawn. At the observation point this app uses, the center of the Sun clears the measured skyline for about fifty-six percent of 2027.

### region-malapert-massif
*Reason:* Removed an unsupported claim (named after Charles Malapert; not in project data).

- **Before:** Malapert Massif is part of Mons Malapert, a broad mountain about sixty-seven kilometers across, named after the seventeenth-century astronomer Charles Malapert. It sits on the Earth-facing side of the south pole, so from its high ground the Earth is often above the horizon. At the observation point this app uses, the center of the Sun clears the measured skyline for about sixty-three percent of 2027.
- **After:** Malapert Massif is part of Mons Malapert, a broad mountain about sixty-seven kilometers across. It sits on the Earth-facing side of the south pole, so from its high ground the Earth is often above the horizon. At the observation point this app uses, the center of the Sun clears the measured skyline for about sixty-three percent of 2027.

### region-mons-mouton-plateau
*Reason:* Removed an unsupported claim (named after Melba Roy Mouton; not in project data).

- **Before:** Mons Mouton Plateau is the largest of the nine outlines, roughly seventy-eight by fifty-eight kilometers, across the high and comparatively flat top of Mons Mouton. The mountain is named after Melba Roy Mouton, a NASA mathematician and programmer. At the observation point this app uses, the center of the Sun clears the measured skyline for about fifty-five percent of 2027.
- **After:** Mons Mouton Plateau is the largest of the nine outlines, roughly seventy-eight by fifty-eight kilometers, across the high and comparatively flat top of Mons Mouton. At the observation point this app uses, the center of the Sun clears the measured skyline for about fifty-five percent of 2027.

### region-nobile-rim-1
*Reason:* Removed unsupported claims (named after Umberto Nobile; crater floor stays in shadow).

- **Before:** Nobile Rim One lies on the western rim of Nobile, a crater about seventy-nine kilometers across, named after the Italian polar explorer Umberto Nobile. Crater rims near the pole rise into sunlight while the crater floor stays in shadow. At the observation point this app uses, the center of the Sun clears the measured skyline for about sixty-four percent of 2027.
- **After:** Nobile Rim One lies on the western rim of Nobile, a crater about seventy-nine kilometers across. At the observation point this app uses, the center of the Sun clears the measured skyline for about sixty-four percent of 2027.

### region-de-gerlache-rim-2
*Reason:* Corrected the latitude to the data (88.63 degrees S: "about eighty-eight and a half"); removed an unsupported claim (named after Adrien de Gerlache).

- **Before:** de Gerlache Rim Two is on the rim of de Gerlache, a crater about thirty-three kilometers across, named after the Belgian polar explorer Adrien de Gerlache. At about eighty-eight degrees south, it is the closest of the nine regions to the pole. At the observation point this app uses, the center of the Sun clears the measured skyline for about fifty-eight percent of 2027.
- **After:** de Gerlache Rim Two is on the rim of de Gerlache, a crater about thirty-three kilometers across. At about eighty-eight and a half degrees south, it is the closest of the nine regions to the pole. At the observation point this app uses, the center of the Sun clears the measured skyline for about fifty-eight percent of 2027.

### region-slater-plain
*Reason:* Corrected to the data: Earth is below the local horizontal 59% of the time (median -1.8 degrees), so "often low in the sky or below the horizon"; removed an unsupported claim (named after David Slater).

- **Before:** Slater Plain is a comparatively smooth area near Slater crater, about twenty-five kilometers across, named after the planetary scientist David Slater. It lies on the side of the pole facing away from the Earth's usual direction, so the Earth is often close to its horizon. At the observation point this app uses, the center of the Sun clears the measured skyline for about sixty-two percent of 2027.
- **After:** Slater Plain is a comparatively smooth area near Slater crater, about twenty-five kilometers across. It lies on the side of the pole facing away from the Earth's usual direction, so the Earth is often low in the sky or below the horizon. At the observation point this app uses, the center of the Sun clears the measured skyline for about sixty-two percent of 2027.

### surface-intro
*Reason:* "layers menu" changed to the control name, "Display options".

- **Before:** You are standing at the observation point, two meters above the ground. The terrain all the way to the horizon is built from NASA's Lunar Orbiter Laser Altimeter measurements, so the skyline you see is the measured skyline. The Sun and the Earth are drawn at their true directions and sizes. The fine ground texture, the lifted shadows and the soft glow around the Sun and the Earth are display aids, not measurements. You can switch them off in the layers menu.
- **After:** You are standing at the observation point, two meters above the ground. The terrain all the way to the horizon is built from NASA's Lunar Orbiter Laser Altimeter measurements, so the skyline you see is the measured skyline. The Sun and the Earth are drawn at their true directions and sizes. The fine ground texture, the lifted shadows, and the soft glow around the Sun and the Earth are display aids, not measurements. You can turn the aids off in Display options.

### term-elevation
*Reason:* "within a few degrees" made precise to the data: within about 8 degrees (max 7.7 degrees, at Nobile Rim 2).

- **Before:** Elevation is the angle of an object above the local horizontal plane. Zero degrees is level with the eye, and ninety degrees is straight overhead. Near the south pole the Sun's elevation stays within a few degrees of the horizon all year.
- **After:** Elevation is the angle of an object above the local horizontal plane. Zero degrees is level with the eye, and ninety degrees is straight overhead. At the nine observation points, the Sun stays within about eight degrees of the horizontal all year.

### view-time
*Reason:* "by an hour or a day" removed: the day buttons are hidden on phones.

- **Before:** Observation time is in Coordinated Universal Time. The arrows step back or forward by an hour or a day. Open the date to choose any moment inside the period covered by the JPL ephemeris. Play moves time forward at one hour, six hours, or one day per second, and every reading updates as it goes.
- **After:** Observation time is in Coordinated Universal Time. The arrow buttons step the time backward or forward. Open the date to choose any moment inside the period covered by the JPL ephemeris. Play moves time forward at one hour, six hours, or one day per second, and every reading updates as it goes.

### analysis-timeline
*Reason:* Device-specific "Hover ... click" changed to "Point at ... Select".

- **Before:** The timelines show, for each scenario, when the Sun and the Earth are above the measured skyline. Each bar is an uninterrupted interval of visibility. Hover, or use the arrow keys, to read exact values, and click or press Enter to pin a moment and open it in the 3D views.
- **After:** The timelines show, for each scenario, when the Sun and the Earth are above the measured skyline. Each bar is an uninterrupted interval of visibility. Point at a bar, or use the arrow keys, to read exact values. Select a moment to pin it and open it in the 3D views.

### analysis-method
*Reason:* Made precise to validation.json: max error 0.006 degrees, January to February 2027.

- **Before:** The Sun and Earth directions come from NASA JPL Horizons, and they agree with Horizons to better than a hundredth of a degree. The skyline is traced through LOLA terrain data out to one hundred and fifty kilometers. Visible means the center of the disc is above the skyline. Results apply to one observation point, and slopes, hazards, temperatures, and radio links are not modeled.
- **After:** The Sun and Earth directions come from NASA JPL Horizons. In a check against Horizons over January and February 2027, they agreed to within six thousandths of a degree. The skyline is traced through LOLA terrain data out to one hundred and fifty kilometers. Visible means the center of the disc is above the skyline. Results apply to one observation point, and slopes, hazards, temperatures, and radio links are not modeled.

### tour-moon
*Reason:* "Everything in this app is built from NASA measurements" replaced by wording that separates measured data from display aids.

- **Before:** This is the Moon, as NASA's Lunar Reconnaissance Orbiter has mapped it. Everything in this app is built from NASA measurements: orbital imagery, laser altimetry of the terrain, and JPL ephemerides for the Sun and the Earth.
- **After:** This is the Moon, as NASA's Lunar Reconnaissance Orbiter has mapped it. The imagery and the terrain come from NASA measurements, and the positions of the Sun and the Earth come from JPL ephemerides. Some visual effects, such as lifted shadows and glows, are display aids that make the scene easier to read. They are not measurements.

### tour-nav
*Reason:* "buttons on the right" changed to "camera tools"; zoom buttons are hidden on phones; "Press F" changed to the Focus button or the More menu.

- **Before:** Drag to turn the globe, and scroll or pinch to zoom. The buttons on the right zoom in and out, return to the selected region, or show the whole Moon. Double-click a point to fly toward it. Press F at any time to hide the controls and focus on the scene.
- **After:** Drag to turn the globe, and scroll or pinch to zoom. The camera tools return the view to the selected region or show the whole Moon. On a computer, double-click a point to fly toward it. Focus hides the controls, so you see only the Moon. Use the Focus button, or the More menu on a smaller screen.

### tour-region
*Reason:* "panel on the left" changed to "Landing Regions".

- **Before:** This is Malapert Massif, one of the nine regions. You can choose any region from the panel on the left. The dot marks the observation point this app measures from. It is a representative point chosen by a fixed rule inside NASA's outline, not a NASA landing site.
- **After:** This is Malapert Massif, one of the nine regions. You can choose any region from Landing Regions. The dot marks the observation point this app measures from. It is a representative point chosen by a fixed rule inside NASA's outline, not a NASA landing site.

### tour-time
*Reason:* "bar at the bottom" changed to "time controls".

- **Before:** The bar at the bottom sets the observation time, in Coordinated Universal Time. Step by an hour or a day, open the date to choose any moment in the covered period, or press play to watch the light change at one hour, six hours, or one day per second.
- **After:** The time controls set the observation time, in Coordinated Universal Time. Step backward or forward, open the date to choose any moment in the covered period, or press play to watch the light change at one hour, six hours, or one day per second.

### tour-measure
*Reason:* "panel on the right" changed to "Sun and Earth readings".

- **Before:** The panel on the right reports the Sun and the Earth as seen from the observation point. Elevation is the angle above level ground. A body counts as visible only when its center is above the measured terrain skyline, not just above the horizontal. Sunlight matters for power and warmth. A line of sight to Earth is needed for direct communication.
- **After:** The Sun and Earth readings show both bodies as seen from the observation point. Elevation is the angle above level ground. A body counts as visible only when its center is above the measured terrain skyline, not just above the horizontal. Sunlight matters for power and warmth. A line of sight to Earth is needed for direct communication.

### tour-surface-controls
*Reason:* "buttons on the right" changed to "look tools"; "strip at the bottom" changed to "skyline strip"; corrected the layer list (labels are not a Surface layer); removed the field-of-view mention (hidden on phones).

- **Before:** Drag to look around. The buttons on the right turn you to face the Sun, the Earth, or north, and change the field of view. The strip at the bottom shows the whole horizon at once. Display options switch aids such as labels, the skyline line, and enhanced lighting on or off.
- **After:** Drag to look around. The look tools turn you to face the Sun, the Earth, or north. The skyline strip shows the whole horizon at once. Display options turn display aids on or off, such as lifted shadows, the fine ground texture, the grid, and range rings. The presets set common combinations.

### tour-pole
*Reason:* Removed an unsupported claim (deep craters stay dark).

- **Before:** We are now above the lunar south pole. Here the Sun skims the horizon, so high ground can stay sunlit while deep craters stay dark. The outlines mark NASA's nine candidate regions for Artemis Three.
- **After:** We are now above the lunar south pole. Here the Sun skims the horizon, so high ground can stay sunlit for much of the year. The outlines mark NASA's nine candidate regions for Artemis Three.

## Voice and generation

- **Configuration:** `voice-config.mjs`. Voice "Bella" (`hpp4J3VqNfWAUOO0d1Us`, American; replaced "Alice", British, at the user's request), model `eleven_v4`, language `en`, `mp3_44100_128`, stability 0.7, similarity 0.6, config version `afuq-2`.
- **Shared:** the recorded clips and the live-reading endpoint (`api/tts.js`) use the same configuration.
- **Generate:** `node --env-file=.env.local scripts/generate-narration.mjs [--only id1,id2] [--dry-run] [--force]`.
  - It skips unchanged clips (the hash covers the text and the voice configuration).
  - It saves progress after each clip and lists failed clips with a non-zero exit code.
  - It stops before exceeding the account's character allowance.
- **Key:** `.env.local` (git-ignored and Vercel-ignored), created by `npx @elevenlabs/cli onboard`. It never goes in code, chat or Git.
- **Live readings on the website:** add `ELEVENLABS_API_KEY` in Vercel, under Project > Settings > Environment Variables, marked Sensitive.
