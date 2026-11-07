/**
 * Scientific data interfaces.
 *
 * Everything shown as a measurement in the UI is derived from one of these
 * structures, each of which carries its provenance (source, method, frame).
 */

/** Planetocentric/planetodetic coordinates on the Moon (sphere), degrees. East-positive longitude. */
export interface LunarCoordinate {
  latDeg: number;
  lonDeg: number;
}

/** Named feature from the IAU Gazetteer of Planetary Nomenclature. */
export interface ReferenceFeature extends LunarCoordinate {
  name: string;
  type: string;
  diameterKm: number;
  /** null when the feature's Gazetteer record could not be confirmed. */
  gazetteerId: number | null;
  url?: string;
}

/** NASA's official region outline, digitised from the agency's map (see preprocess/register_nasa_regions.py). */
export interface NasaRegion {
  source: string;
  centreLatDeg: number;
  centreLonDeg: number;
  /** Width × height of the published box, km. */
  sizeKm: [number, number];
  /** Box corners [lat, lon] (deg), clockwise from the top-left of NASA's map. */
  corners: [number, number][];
  accuracyKm: number;
}

/**
 * A single representative point used for calculations. A candidate landing
 * region (~15 x 15 km per NASA) is NOT a single coordinate; this point is chosen
 * by the documented rule in `selectionRule` and is not a NASA-designated site.
 */
export interface ObservationPoint extends LunarCoordinate {
  /** Surface elevation relative to the 1737.4 km reference sphere, metres (LOLA). */
  elevationM: number;
  /** Height of the notional observer/instrument above the surface, metres. */
  observerHeightM: number;
  selectionRule: string;
  /** Fraction of 2027 hours with the Sun's centre above the terrain horizon (selection criterion). */
  sunVisibleFraction2027?: number;
}

/** Terrain-corrected horizon: elevation angle of the skyline vs azimuth. */
export interface HorizonProfile {
  /** Azimuth step, degrees. Azimuth measured clockwise from local north (toward the lunar north pole). */
  azStepDeg: number;
  /** Skyline elevation angle at each azimuth, degrees (may be negative on summits). */
  elevationDeg: number[];
  /** Furthest terrain distance searched along each azimuth, km. */
  maxDistanceKm: number;
  /** DEM used. */
  dem: string;
  method: string;
}

/** Local heightfield tile for Surface View (east/north grid centred on the observation point). */
export interface TerrainTileMeta {
  file: string;
  /** Samples per side. */
  n: number;
  /** Grid spacing, metres. */
  spacingM: number;
  /** Heights are float32, metres above the observation point's local tangent plane (includes curvature drop). */
  encoding: 'float32-le';
  dem: string;
  /** Coarser ring tile (same encoding) for distant terrain; inner area lowered 60 m beneath the near tile. */
  far?: { file: string; n: number; spacingM: number };
  /** ±150 km at 1 km (block mean); cells outside the DEM set to −20 km. */
  regional?: { file: string; n: number; spacingM: number; note?: string };
}

/** Native 100 m LROC imagery + LOLA normals in a window around the observation point. */
export interface SiteDetail {
  imagery: string;
  normals: string;
  /** Window centre in south-polar stereographic km. */
  centerKm: [number, number];
  halfExtentKm: number;
  imageryResolutionM: number;
  reliefSource: string;
}

export interface LandingRegion {
  id: string;
  name: string;
  /** How NASA has listed this candidate region. */
  nasaListing: string;
  referenceFeature: ReferenceFeature;
  nasaRegion: NasaRegion;
  observationPoint: ObservationPoint;
  horizon: HorizonProfile;
  terrain: TerrainTileMeta;
  detail?: SiteDetail;
  /** Region picture: the NASA outline area from the 100 m mosaic (centre/half-width in polar-stereographic km). */
  thumb?: { file: string; centerKm: [number, number]; halfExtentKm: number };
  /** Short factual notes, each traceable to the cited source. */
  notes: string[];
}

export interface SitesFile {
  generatedUtc: string;
  referenceRadiusKm: number;
  dem: { name: string; source: string; url: string; resolutionM: number; projection: string };
  polarCap?: { texture: string; standard?: string; extentKm: number; size: number };
  /** NASA candidate regions not represented, with the reason. */
  notRepresented?: Record<string, string>;
  nasaRegionMap?: { url: string; credit: string; method: string };
  /** Polar locator image: extent in polar-stereographic km (x east of 0°/90°E axis, y toward 0°E). */
  locator?: { file: string; xKm: [number, number]; yKm: [number, number]; source: string };
  nasaReferences?: { title: string; date: string; url: string; regions?: string[] }[];
  polarImagery?: {
    product: string;
    source: string;
    acquired: string;
    band: string;
    nativeResolutionM: number;
    cap: { high: string; standard: string; extentKm: number };
    brightnessGain: number;
  };
  regions: LandingRegion[];
}

/** Hourly Sun/Earth geometry from JPL Horizons (see preprocess/fetch_ephemeris.py). */
export interface EphemerisFile {
  source: string;
  frame: string;
  timeScale: 'UTC';
  retrievedUtc: string;
  startUtc: string;
  stepSeconds: number;
  count: number;
  subEarthLonDeg: number[];
  subEarthLatDeg: number[];
  subSolarLonDeg: number[];
  subSolarLatDeg: number[];
  earthRangeKm: number[];
}

/** Moon-fixed Cartesian vector: x → (0°N,0°E), y → (0°N,90°E), z → north pole. */
export type Vec3 = [number, number, number];

export interface BodyGeometry {
  /** Unit vector from Moon centre toward the body, Moon-fixed frame. */
  dir: Vec3;
  /** Distance from Moon centre, km (Infinity when treated as at infinity). */
  distanceKm: number;
}

export interface EphemerisSample {
  timeMs: number;
  sun: BodyGeometry;
  earth: BodyGeometry;
}

export type VisibilityState = 'visible' | 'terrain-blocked' | 'below-horizontal';

/** Topocentric result for one body at one site and epoch. */
export interface TopocentricBody {
  azDeg: number;
  elDeg: number;
  /** Skyline elevation at this azimuth (from the horizon profile). */
  horizonDeg: number;
  /** elDeg - horizonDeg */
  marginDeg: number;
  /** Fraction (0–1) of the body's disc above the skyline, flat-skyline approximation. */
  discFraction: number;
  state: VisibilityState;
}

export interface SiteConditions {
  timeMs: number;
  sun: TopocentricBody;
  earth: TopocentricBody;
}

export interface Interval {
  startMs: number;
  endMs: number;
}

export interface ScenarioMetrics {
  periodHours: number;
  sampleMinutes: number;
  sunVisiblePct: number;
  earthVisiblePct: number;
  bothVisiblePct: number;
  neitherVisiblePct: number;
  longestNoSunHours: number;
  longestNoEarthHours: number;
  longestNeitherHours: number;
  longestSunHours: number;
  sunElevRange: [number, number];
  earthElevRange: [number, number];
  /** True when the longest run touches the period boundary (true duration may be longer). */
  noSunTruncated: boolean;
  noEarthTruncated: boolean;
}
