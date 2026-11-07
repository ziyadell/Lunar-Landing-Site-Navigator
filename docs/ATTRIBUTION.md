# Data and asset attribution

This project is an independent NASA Space Apps Challenge 2026 entry. It is **not
an official NASA product** and is not endorsed by NASA. NASA material is used
under the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
NASA does not endorse this project.

| Asset in this repo | Derived from | Credit / source |
|---|---|---|
| `public/textures/moon_color_4k.jpg`, `public/textures/tiles/*.jpg` | `lroc_color_poles_8k.tif`, `lroc_color_poles_16k.tif`, CGI Moon Kit | NASA's Scientific Visualization Studio, data from LRO LROC (Wide Angle Camera) — https://svs.gsfc.nasa.gov/4720/ |
| `public/textures/moon_normal_*k.jpg` | `ldem_16.tif`, CGI Moon Kit | NASA SVS; LRO LOLA team (NASA GSFC) — https://svs.gsfc.nasa.gov/4720/ |
| `public/textures/southpole_normal.jpg`, `public/data/terrain/*.bin`, horizon profiles in `public/data/sites.json` | `LDEM_80S_80M.IMG` | LRO LOLA Science Team, NASA GSFC; NASA Planetary Data System, Geosciences Node — https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ |
| `public/data/ephemeris.json`, `public/data/validation.json` | Horizons API queries | NASA/JPL Solar System Dynamics Group, Horizons System — https://ssd.jpl.nasa.gov/horizons/ |
| `public/data/stars.json` | Yale Bright Star Catalogue, 5th rev. ed. | Hoffleit & Warren (1991), via VizieR V/50 (CDS / CfA mirror) |
| Moon orientation model | IAU WGCCRE 2009 | Archinal et al. (2011), Celest. Mech. Dyn. Astr. 109, 101–135 |
| Feature names and centres in `sites.json` | IAU Gazetteer | Gazetteer of Planetary Nomenclature, IAU WGPSN / USGS Astrogeology — https://planetarynames.wr.usgs.gov/ |
| Candidate region names | NASA release 22-089 (Aug 19, 2022) | https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/ |
| Fonts | IBM Plex Sans, IBM Plex Mono, Space Grotesk | SIL Open Font License 1.1, via `@fontsource` packages |

Raw source files are not committed (`data_raw/` is git-ignored). The scripts in
`preprocess/` re-download and regenerate every derived asset.
