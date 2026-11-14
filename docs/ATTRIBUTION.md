# Data and asset attribution

This project is an independent NASA Space Apps Challenge 2026 entry. It is **not
an official NASA product** and is not endorsed by NASA. NASA material is used
under the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
NASA does not endorse this project.

| Asset in this repo | Derived from | Credit / source |
|---|---|---|
| `public/textures/moon_color_4k.jpg`, `public/textures/tiles/*.jpg` | `lroc_color_poles_8k.tif`, `lroc_color_poles_16k.tif`, CGI Moon Kit | NASA's Scientific Visualization Studio, data from LRO LROC (Wide Angle Camera) — https://svs.gsfc.nasa.gov/4720/ |
| `public/textures/polar/wac_cap_*.jpg`, `public/textures/polar/wac_wide_*.jpg` (60°S to the cap, large-scale brightness matched to the global map), `public/textures/polar/*_wac.jpg` | `WAC_ROI_SOUTH_SUMMER_100M.TIF` (LROC WAC South Pole Summer Mosaic, 643 nm, 100 m/px) | NASA/GSFC/Arizona State University (LROC); Speyerer, E. J., Robinson, M. S., Boyd, A., Wagner, R. V., Henriksen, M. R. (2020) Exploration of the lunar south pole with LROC data products, Lunar Surface Science Workshop #5132 — https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_ROI_SOUTH_SUMMER |
| `public/textures/moon_normal_*k.jpg` | `ldem_16.tif`, CGI Moon Kit | NASA SVS; LRO LOLA team (NASA GSFC) — https://svs.gsfc.nasa.gov/4720/ |
| `public/textures/southpole_normal.png`, `public/textures/polar/*nrm*.png`, `public/data/terrain/*.bin`, horizon profiles in `public/data/sites.json` | `LDEM_80S_80M.IMG` | LRO LOLA Science Team, NASA GSFC; NASA Planetary Data System, Geosciences Node — https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ |
| `public/img/crew/*.webp` | Official Artemis III crew portrait (`artemis-iii-crew.jpg`), cropped to four portraits | NASA/Bill Stafford — https://www.nasa.gov/news-release/nasa-marches-toward-artemis-iii-mission-in-2027-names-crew-members/ (crew names and biographies from the same release, 9 June 2026). Shown for information; no endorsement by NASA, ESA or the crew is implied. |
| `public/data/ephemeris.json`, `public/data/validation.json` | Horizons API queries | NASA/JPL Solar System Dynamics Group, Horizons System — https://ssd.jpl.nasa.gov/horizons/ |
| `public/data/stars.json` | Yale Bright Star Catalogue, 5th rev. ed. | Hoffleit & Warren (1991), via VizieR V/50 (CDS / CfA mirror) |
| Moon orientation model | IAU WGCCRE 2009 | Archinal et al. (2011), Celest. Mech. Dyn. Astr. 109, 101–135 |
| Feature names and centres in `sites.json` | IAU Gazetteer | Gazetteer of Planetary Nomenclature, IAU WGPSN / USGS Astrogeology — https://planetarynames.wr.usgs.gov/ |
| Candidate region names | NASA release 22-089 (Aug 19, 2022); NASA update of Oct 28, 2024 | https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/ · https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/ |
| Fonts | IBM Plex Sans, IBM Plex Mono, Space Grotesk | SIL Open Font License 1.1, via `@fontsource` packages |

Raw source files are not committed (`data_raw/` is git-ignored). The scripts in
`preprocess/` re-download and regenerate every derived asset.
